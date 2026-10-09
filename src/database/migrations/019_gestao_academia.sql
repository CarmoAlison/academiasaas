-- =====================================================================
-- Migração 019 — Gestão da academia
--   • Dados e endereço da academia editáveis pelo Admin (update_my_academy)
--   • Cobrança: multa, juros ao mês e PIX (academy_settings)
--   • Horário de funcionamento + check-in por QR só com a academia aberta (opcional)
--   • Aniversariantes: data de nascimento na v_students e mensagem de parabéns no WhatsApp
--   • Histórico do aluno (student_history)
-- Requer a 018. Pode ser executada mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Dados e endereço da academia
-- ---------------------------------------------------------------------
alter table public.academies add column if not exists cep text;
alter table public.academies add column if not exists endereco text;
alter table public.academies add column if not exists bairro text;
alter table public.academies add column if not exists instagram text;
alter table public.academies add column if not exists site text;

/** Admin da academia atualiza contato e endereço (nome, CNPJ e plano ficam com o SaaS) */
create or replace function public.update_my_academy(p_academy uuid, p_dados jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uf text := upper(nullif(trim(p_dados ->> 'uf'), ''));
begin
  if p_academy not in (select public.my_admin_academies()) then
    raise exception 'Somente o administrador da academia pode alterar estes dados' using errcode = '42501';
  end if;
  if v_uf is not null and v_uf !~ '^[A-Z]{2}$' then
    raise exception 'UF inválida';
  end if;
  update public.academies set
    email     = nullif(trim(p_dados ->> 'email'), ''),
    telefone  = nullif(regexp_replace(coalesce(p_dados ->> 'telefone', ''), '\D', '', 'g'), ''),
    cep       = nullif(regexp_replace(coalesce(p_dados ->> 'cep', ''), '\D', '', 'g'), ''),
    endereco  = nullif(trim(p_dados ->> 'endereco'), ''),
    bairro    = nullif(trim(p_dados ->> 'bairro'), ''),
    cidade    = nullif(trim(p_dados ->> 'cidade'), ''),
    uf        = v_uf,
    instagram = nullif(trim(p_dados ->> 'instagram'), ''),
    site      = nullif(trim(p_dados ->> 'site'), ''),
    updated_at = now()
  where id = p_academy and deleted_at is null;
end $$;

-- ---------------------------------------------------------------------
-- Cobrança, horário e mensagens (configurações da academia)
-- ---------------------------------------------------------------------
alter table public.academy_settings add column if not exists multa_percent numeric(5,2) not null default 0;
alter table public.academy_settings add column if not exists juros_mes_percent numeric(5,2) not null default 0;
alter table public.academy_settings add column if not exists pix_tipo text;
alter table public.academy_settings add column if not exists pix_chave text;
alter table public.academy_settings add column if not exists pix_favorecido text;
alter table public.academy_settings add column if not exists horarios jsonb;
alter table public.academy_settings add column if not exists checkin_somente_aberto boolean not null default false;
alter table public.academy_settings add column if not exists msg_aniversario text;

alter table public.academy_settings drop constraint if exists academy_settings_cobranca_check;
alter table public.academy_settings add constraint academy_settings_cobranca_check check (
  multa_percent between 0 and 2           -- CDC: multa limitada a 2%
  and juros_mes_percent between 0 and 1   -- juros de mora usuais: até 1% ao mês
  and (pix_tipo is null or pix_tipo in ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria'))
  and (horarios is null or (jsonb_typeof(horarios) = 'array' and jsonb_array_length(horarios) = 7))
);

/** Academia aberta agora? Sem horário configurado = sempre aberta. Aceita fechamento após a meia-noite. */
create or replace function public._academy_open(p_academy uuid)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_cfg jsonb := public._academy_cfg(p_academy);
  v_now timestamp := now() at time zone 'America/Sao_Paulo';
  v_d   jsonb;
  v_abre time;
  v_fecha time;
begin
  if coalesce(jsonb_typeof(v_cfg -> 'horarios'), '') <> 'array' then
    return true;
  end if;
  v_d := v_cfg -> 'horarios' -> extract(dow from v_now)::int;
  if v_d is null or not coalesce((v_d ->> 'aberto')::boolean, false) then
    return false;
  end if;
  v_abre := coalesce(nullif(v_d ->> 'abre', ''), '00:00')::time;
  v_fecha := coalesce(nullif(v_d ->> 'fecha', ''), '00:00')::time;
  if v_fecha <= v_abre then
    return v_now::time >= v_abre or v_now::time < v_fecha;
  end if;
  return v_now::time >= v_abre and v_now::time < v_fecha;
end $$;

/** Check-in do próprio aluno lendo o QR da recepção (bloqueia fora do horário, se configurado) */
create or replace function public.do_checkin(p_academy uuid, p_codigo text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_epoch   numeric := extract(epoch from now());
  v_janela  bigint := floor(v_epoch / 300);
  v_student uuid;
begin
  select s.id into v_student
    from public.students s
    join public.profiles p on p.id = s.profile_id
   where p.user_id = auth.uid() and s.academy_id = p_academy
     and s.deleted_at is null and p.deleted_at is null and s.status = 'ativo';
  if v_student is null or not public.is_member(p_academy) then
    raise exception 'Check-in disponível apenas para alunos ativos desta academia' using errcode = '42501';
  end if;
  if coalesce(p_codigo, '') <> public._checkin_code(p_academy, v_janela)
     and not (v_epoch - v_janela * 300 < 120 and p_codigo = public._checkin_code(p_academy, v_janela - 1)) then
    raise exception 'QR Code expirado. Leia o código que está na tela da recepção agora.';
  end if;
  if coalesce((public._academy_cfg(p_academy) ->> 'checkin_somente_aberto')::boolean, false)
     and not public._academy_open(p_academy) then
    raise exception 'A academia está fechada agora. O check-in fica disponível no horário de funcionamento.';
  end if;
  return public._register_checkin(p_academy, v_student, 'qr');
end $$;

-- ---------------------------------------------------------------------
-- Aniversariantes: data de nascimento na view de alunos
-- ---------------------------------------------------------------------
create or replace view public.v_students with (security_invoker = true) as
select
  s.id, s.academy_id, s.profile_id, s.unit_id, s.plan_id, s.status, s.data_matricula, s.created_at,
  s.plano_valido_ate,
  p.nome, p.cpf, p.telefone, p.email_contato, p.avatar_url,
  pl.nome as plano_nome, u.nome as unidade_nome,
  public.is_inadimplente(s.id) as inadimplente,
  exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
           where ur.user_id = p.user_id and ur.academy_id = s.academy_id and coalesce(r.slug, '') <> 'aluno'
             and r.deleted_at is null) as tambem_equipe,
  s.data_nascimento,
  extract(month from s.data_nascimento)::int as nasc_mes,
  extract(day from s.data_nascimento)::int as nasc_dia
from public.students s
join public.profiles p on p.id = s.profile_id
left join public.plans pl on pl.id = s.plan_id
left join public.units u on u.id = s.unit_id
where s.deleted_at is null;
grant select on public.v_students to authenticated;

alter table public.whatsapp_logs drop constraint if exists whatsapp_logs_tipo_check;
alter table public.whatsapp_logs add constraint whatsapp_logs_tipo_check
  check (tipo in ('lembrete', 'atraso', 'recibo', 'sumido', 'aniversario', 'livre'));

-- ---------------------------------------------------------------------
-- Histórico do aluno (ficha → aba Histórico)
-- ---------------------------------------------------------------------
create or replace function public.student_history(p_student uuid)
returns table (
  origem text, tabela text, acao text, dados_antes jsonb, dados_depois jsonb, user_nome text, created_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_s public.students;
begin
  select * into v_s from public.students where id = p_student;
  if v_s.id is null or not public.has_permission(v_s.academy_id, 'alunos.ver') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  return query
  (select 'audit'::text, l.tabela, l.acao, l.dados_antes, l.dados_depois, l.user_nome, l.created_at
     from public.audit_logs l
    where l.academy_id = v_s.academy_id
      and ((l.tabela = 'students' and l.registro_id = v_s.id::text)
        or (l.tabela = 'profiles' and l.registro_id = v_s.profile_id::text)
        or (l.tabela in ('payments', 'workouts', 'class_bookings')
            and coalesce(l.dados_depois, l.dados_antes) ->> 'student_id' = v_s.id::text))
    order by l.created_at desc
    limit 200)
  union all
  (select 'whatsapp'::text, w.tipo, 'envio'::text, null::jsonb, jsonb_build_object('mensagem', w.mensagem),
          (select p.nome from public.profiles p where p.user_id = w.enviado_por and p.academy_id = w.academy_id limit 1),
          w.created_at
     from public.whatsapp_logs w
    where w.student_id = v_s.id
    order by w.created_at desc
    limit 50)
  union all
  (select 'contrato'::text, c.titulo, 'emitido'::text, null::jsonb, null::jsonb,
          (select p.nome from public.profiles p where p.user_id = c.criado_por and p.academy_id = c.academy_id limit 1),
          c.created_at
     from public.contracts c
    where c.student_id = v_s.id)
  union all
  (select 'contrato'::text, c.titulo, 'aceito'::text, null::jsonb, null::jsonb, c.aceite_nome, c.aceito_em
     from public.contracts c
    where c.student_id = v_s.id and c.aceito_em is not null);
end $$;

notify pgrst, 'reload schema';
