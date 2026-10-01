-- =====================================================================
-- Migração 010 — Contrato digital, identidade visual, relatórios e primeiro acesso
--   • academy_settings: cor/logo da academia (aplicados no sistema), modelo de contrato,
--     emissão automática e checklist de primeiro acesso
--   • contracts: contrato por aluno com conteúdo congelado (hash SHA-256) e aceite
--     eletrônico (data, IP, navegador, nome e CPF de quem aceitou)
--   • students.inativado_em: data da saída (relatório de cancelamentos)
--   • report_data(): relatórios com filtros; permissões relatorios.ver / relatorios.exportar
--   • onboarding_status(): checklist do primeiro acesso
-- Requer a 009. Pode ser executada mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Configurações novas
-- ---------------------------------------------------------------------
alter table public.academy_settings add column if not exists cor_primaria text;
alter table public.academy_settings add column if not exists logo_url text;
alter table public.academy_settings add column if not exists contrato_titulo text;
alter table public.academy_settings add column if not exists contrato_texto text;
alter table public.academy_settings add column if not exists contrato_automatico boolean not null default false;
alter table public.academy_settings add column if not exists onboarding_oculto boolean not null default false;

alter table public.academy_settings drop constraint if exists academy_settings_cor_check;
alter table public.academy_settings add constraint academy_settings_cor_check
  check (cor_primaria is null or cor_primaria ~ '^#[0-9A-Fa-f]{6}$');

-- O logo escolhido pelo Admin vira o logo da academia (menu, seleção de academia, recibo)
create or replace function public.sync_academy_logo()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.logo_url is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.logo_url is not distinct from old.logo_url then
    return new;
  end if;
  update public.academies set logo_url = new.logo_url where id = new.academy_id;
  return new;
end $$;

drop trigger if exists academy_settings_logo on public.academy_settings;
create trigger academy_settings_logo after insert or update of logo_url on public.academy_settings
  for each row execute function public.sync_academy_logo();

-- ---------------------------------------------------------------------
-- Saída do aluno (relatório de cancelamentos)
-- ---------------------------------------------------------------------
alter table public.students add column if not exists inativado_em timestamptz;

create or replace function public.student_exit_date()
returns trigger
language plpgsql as $$
begin
  if old.status = 'ativo' and old.deleted_at is null
     and (new.status <> 'ativo' or new.deleted_at is not null) then
    new.inativado_em := now();
  elsif new.status = 'ativo' and new.deleted_at is null
        and (old.status <> 'ativo' or old.deleted_at is not null) then
    new.inativado_em := null;
  end if;
  return new;
end $$;

drop trigger if exists students_exit_date on public.students;
create trigger students_exit_date before update of status, deleted_at on public.students
  for each row execute function public.student_exit_date();

-- quem já saiu antes desta migração: usa a última alteração do cadastro
update public.students
   set inativado_em = coalesce(deleted_at, updated_at)
 where inativado_em is null and (status <> 'ativo' or deleted_at is not null);

-- ---------------------------------------------------------------------
-- Contrato digital
-- ---------------------------------------------------------------------
create table if not exists public.contracts (
  id                uuid primary key default gen_random_uuid(),
  academy_id        uuid not null references public.academies(id) on delete cascade,
  student_id        uuid not null references public.students(id),
  titulo            text not null,
  conteudo          text not null,
  hash              text not null,
  status            text not null default 'pendente' check (status in ('pendente', 'aceito', 'cancelado')),
  criado_por        uuid default auth.uid() references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  aceito_em         timestamptz,
  aceite_ip         text,
  aceite_user_agent text,
  aceite_nome       text,
  aceite_cpf        text
);
create index if not exists contracts_student_idx on public.contracts (student_id, created_at desc);
create index if not exists contracts_academy_idx on public.contracts (academy_id, status);
alter table public.contracts enable row level security;

-- leitura: equipe com alunos.ver ou o próprio aluno; escrita só pelas funções
drop policy if exists contracts_select on public.contracts;
create policy contracts_select on public.contracts for select to authenticated
  using (academy_id in (select public.academies_with_permission('alunos.ver'))
      or student_id in (select public.my_student_ids()));
grant select on public.contracts to authenticated;

drop trigger if exists contracts_audit on public.contracts;
create trigger contracts_audit after insert or update or delete on public.contracts
  for each row execute function public.audit_trigger();

/** Modelo padrão (usado enquanto a academia não escreve o seu) */
create or replace function public.default_contract_text()
returns text language sql immutable as $$
  select $txt$CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE ATIVIDADE FÍSICA

CONTRATADA: {academia}, inscrita no CNPJ {cnpj}.
CONTRATANTE: {nome}, CPF {cpf}.

1. OBJETO. A CONTRATADA disponibiliza ao CONTRATANTE o uso das instalações, equipamentos e atividades incluídos no plano {plano}, nos horários de funcionamento da academia.

2. VALOR E PAGAMENTO. O CONTRATANTE pagará {valor} a cada {duracao} mês(es), na data de vencimento informada pela academia. Mensalidades em atraso podem gerar o bloqueio de reservas de aulas e do acesso até a regularização.

3. VIGÊNCIA. Este contrato vale a partir de {data} e é renovado automaticamente a cada período do plano, enquanto houver pagamento.

4. SAÚDE. O CONTRATANTE declara estar apto à prática de atividade física e se compromete a informar à academia qualquer condição de saúde relevante, apresentando atestado médico quando solicitado.

5. REGRAS DE USO. O CONTRATANTE se compromete a respeitar o regulamento interno, os horários, os demais alunos e a equipe, e a zelar pelos equipamentos.

6. CANCELAMENTO. O CONTRATANTE pode cancelar o plano a qualquer momento, comunicando a academia. Valores de períodos já iniciados não são devolvidos, salvo previsão em lei.

7. DADOS PESSOAIS. Os dados do CONTRATANTE são usados apenas para a prestação dos serviços, cobrança e comunicação, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018).

8. ACEITE ELETRÔNICO. O aceite deste contrato pela área do aluno, com login por CPF e senha pessoal, tem a mesma validade da assinatura, ficando registrados data, hora, endereço IP e código de verificação.

{cidade}, {data}.$txt$;
$$;

/** Texto do contrato com os dados do aluno (variáveis entre chaves) */
create or replace function public._render_contract(p_student uuid, out titulo text, out conteudo text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_s   public.students;
  v_p   public.profiles;
  v_pl  public.plans;
  v_a   public.academies;
  v_u   public.units;
  v_cfg jsonb;
  v_txt text;
  v_moeda text;
begin
  select * into v_s from public.students where id = p_student;
  select * into v_p from public.profiles where id = v_s.profile_id;
  select * into v_pl from public.plans where id = v_s.plan_id;
  select * into v_a from public.academies where id = v_s.academy_id;
  select * into v_u from public.units where id = v_s.unit_id;
  v_cfg := public._academy_cfg(v_s.academy_id);

  v_txt := coalesce(nullif(trim(v_cfg ->> 'contrato_texto'), ''), public.default_contract_text());
  v_moeda := case when v_pl.valor is null then '—'
                  else 'R$ ' || translate(to_char(v_pl.valor, 'FM999,999,990.00'), ',.', '.,') end;

  titulo := coalesce(nullif(trim(v_cfg ->> 'contrato_titulo'), ''), 'Contrato de prestação de serviços');
  conteudo := replace(replace(replace(replace(replace(replace(replace(replace(replace(v_txt,
    '{nome}', v_p.nome),
    '{cpf}', regexp_replace(v_p.cpf, '^(\d{3})(\d{3})(\d{3})(\d{2})$', '\1.\2.\3-\4')),
    '{plano}', coalesce(v_pl.nome, 'contratado')),
    '{valor}', v_moeda),
    '{duracao}', coalesce(v_pl.duracao_meses, 1)::text),
    '{academia}', v_a.nome),
    '{cnpj}', coalesce(regexp_replace(v_a.cnpj, '^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$', '\1.\2.\3/\4-\5'), '—')),
    '{cidade}', coalesce(v_u.cidade, '')),
    '{data}', to_char(public._today(), 'DD/MM/YYYY'));
  conteudo := regexp_replace(conteudo, '^, ', '', 'gm'); -- "{cidade}, " sem cidade
end $$;
revoke execute on function public._render_contract(uuid) from public, anon, authenticated;

create or replace function public._issue_contract(p_student uuid)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_s   public.students;
  v_r   record;
  v_id  uuid;
begin
  select * into v_s from public.students where id = p_student and deleted_at is null;
  if v_s.id is null then
    raise exception 'Aluno não encontrado';
  end if;
  select * into v_r from public._render_contract(p_student);
  update public.contracts set status = 'cancelado' where student_id = p_student and status = 'pendente';
  insert into public.contracts (academy_id, student_id, titulo, conteudo, hash)
  values (v_s.academy_id, p_student, v_r.titulo, v_r.conteudo,
          encode(digest(v_r.titulo || E'\n' || v_r.conteudo, 'sha256'), 'hex'))
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public._issue_contract(uuid) from public, anon, authenticated;

/** Gera (ou reenvia) o contrato para o aluno aceitar na área dele */
create or replace function public.issue_contract(p_student uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission((select academy_id from public.students where id = p_student), 'alunos.editar') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  return public._issue_contract(p_student);
end $$;

create or replace function public.cancel_contract(p_contract uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_c public.contracts;
begin
  select * into v_c from public.contracts where id = p_contract;
  if v_c.id is null or not public.has_permission(v_c.academy_id, 'alunos.editar') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if v_c.status <> 'pendente' then
    raise exception 'Só contratos pendentes podem ser cancelados';
  end if;
  update public.contracts set status = 'cancelado' where id = p_contract;
end $$;

/** Aceite eletrônico pelo próprio aluno: confere a integridade do texto e registra data/IP/navegador */
create or replace function public.accept_contract(p_contract uuid, p_user_agent text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_c public.contracts;
  v_p public.profiles;
begin
  select * into v_c from public.contracts where id = p_contract for update;
  if v_c.id is null or v_c.student_id not in (select public.my_student_ids()) then
    raise exception 'Contrato não encontrado' using errcode = '42501';
  end if;
  if v_c.status <> 'pendente' then
    raise exception 'Este contrato não está mais disponível para aceite';
  end if;
  if v_c.hash <> encode(digest(v_c.titulo || E'\n' || v_c.conteudo, 'sha256'), 'hex') then
    raise exception 'Falha na verificação do contrato. Peça à academia para reenviá-lo.';
  end if;
  select p.* into v_p from public.students s join public.profiles p on p.id = s.profile_id where s.id = v_c.student_id;

  update public.contracts
     set status = 'aceito', aceito_em = now(), aceite_ip = public._client_ip(),
         aceite_user_agent = left(p_user_agent, 500), aceite_nome = v_p.nome, aceite_cpf = v_p.cpf
   where id = p_contract;
  return jsonb_build_object('aceito_em', now(), 'hash', v_c.hash);
end $$;

/** Dados completos para tela/PDF do contrato (visual do recibo da academia) */
create or replace function public.get_contract(p_contract uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_c public.contracts;
  v_s public.students;
begin
  select * into v_c from public.contracts where id = p_contract;
  if v_c.id is null or not (
    public.has_permission(v_c.academy_id, 'alunos.ver')
    or (public.is_member(v_c.academy_id) and v_c.student_id in (select public.my_student_ids()))
  ) then
    raise exception 'Contrato não encontrado' using errcode = '42501';
  end if;
  select * into v_s from public.students where id = v_c.student_id;
  return jsonb_build_object(
    'contrato', to_jsonb(v_c) - 'aceite_user_agent',
    'aluno', (select jsonb_build_object('nome', p.nome, 'cpf', p.cpf) from public.profiles p where p.id = v_s.profile_id),
    'academia', (select jsonb_build_object('nome', a.nome, 'cnpj', a.cnpj, 'email', a.email, 'telefone', a.telefone, 'logo_url', a.logo_url)
                   from public.academies a where a.id = v_c.academy_id),
    'unidade', (select to_jsonb(u) from public.units u where u.id = v_s.unit_id),
    'config', (select to_jsonb(r) from public.receipt_settings r where r.academy_id = v_c.academy_id)
  );
end $$;

-- Emissão automática ao cadastrar aluno (se ligada em Configurações)
create or replace function public.auto_issue_contract()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce((public._academy_cfg(new.academy_id) ->> 'contrato_automatico')::boolean, false) then
    perform public._issue_contract(new.id);
  end if;
  return new;
end $$;

drop trigger if exists students_auto_contract on public.students;
create trigger students_auto_contract after insert on public.students
  for each row execute function public.auto_issue_contract();

-- ---------------------------------------------------------------------
-- Relatórios
-- ---------------------------------------------------------------------
insert into public.permissions (recurso, acao, descricao) values
  ('relatorios', 'ver', 'Ver relatórios'),
  ('relatorios', 'exportar', 'Exportar relatórios (PDF/CSV)')
on conflict (recurso, acao) do nothing;

create index if not exists students_inativado_idx on public.students (academy_id, inativado_em) where inativado_em is not null;
create index if not exists payments_pago_idx on public.payments (academy_id, pago_em) where status = 'pago';

/**
 * Relatórios do período [p_de, p_ate] com filtros opcionais de unidade e plano
 * (aplicados pelo cadastro do aluno; aulas filtram pela unidade da aula).
 */
create or replace function public.report_data(p_academy uuid, p_de date, p_ate date, p_unit uuid default null, p_plan uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_ini timestamptz := p_de::timestamp at time zone 'America/Sao_Paulo';
  v_fim timestamptz := (p_ate + 1)::timestamp at time zone 'America/Sao_Paulo';
  v_today date := public._today();
begin
  if not public.has_permission(p_academy, 'relatorios.ver') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if p_ate < p_de or p_ate - p_de > 3660 then
    raise exception 'Período inválido (máximo de 10 anos)';
  end if;

  return (
  with alunos as (
    select s.* from public.students s
     where s.academy_id = p_academy
       and (p_unit is null or s.unit_id = p_unit)
       and (p_plan is null or s.plan_id = p_plan)
  ),
  pagos as (
    select pa.*, (pa.pago_em at time zone 'America/Sao_Paulo')::date dia
      from public.payments pa
     where pa.academy_id = p_academy and pa.deleted_at is null and pa.status = 'pago'
       and pa.pago_em >= v_ini and pa.pago_em < v_fim
       and pa.student_id in (select id from alunos)
       and (p_plan is null or pa.plan_id = p_plan)
  ),
  saidas as (
    select a.* from alunos a where a.inativado_em >= v_ini and a.inativado_em < v_fim
  ),
  cks as (
    select c.created_at at time zone 'America/Sao_Paulo' t, c.student_id
      from public.checkins c
     where c.academy_id = p_academy and c.created_at >= v_ini and c.created_at < v_fim
       and c.student_id in (select id from alunos)
  ),
  meses as (
    select generate_series(date_trunc('month', p_de), date_trunc('month', p_ate), interval '1 month')::date m
  )
  select jsonb_build_object(
    'resumo', jsonb_build_object(
      'receita', (select coalesce(sum(valor), 0) from pagos),
      'pagamentos', (select count(*) from pagos),
      'ticket_medio', (select coalesce(round(avg(valor), 2), 0) from pagos),
      'novos', (select count(*) from alunos where deleted_at is null and data_matricula between p_de and p_ate),
      'cancelamentos', (select count(*) from saidas),
      'ativos', (select count(*) from alunos where deleted_at is null and status = 'ativo'),
      'checkins', (select count(*) from cks),
      'inadimplencia', (select coalesce(sum(pa.valor), 0) from public.payments pa
                         where pa.academy_id = p_academy and pa.deleted_at is null and pa.status = 'pendente'
                           and pa.vencimento < v_today and pa.student_id in (select id from alunos)
                           and (p_plan is null or pa.plan_id = p_plan))
    ),
    'mensal', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'mes', to_char(m, 'YYYY-MM'),
        'receita', (select coalesce(sum(valor), 0) from pagos where dia >= m and dia < (m + interval '1 month')),
        'novos', (select count(*) from alunos where deleted_at is null and data_matricula >= m and data_matricula < (m + interval '1 month')
                    and data_matricula between p_de and p_ate),
        'cancelamentos', (select count(*) from saidas where (inativado_em at time zone 'America/Sao_Paulo')::date >= m
                            and (inativado_em at time zone 'America/Sao_Paulo')::date < (m + interval '1 month'))
      ) order by m), '[]'::jsonb) from meses
    ),
    'receita_por_plano', (
      select coalesce(jsonb_agg(jsonb_build_object('plano', nome, 'total', total, 'pagamentos', qtd) order by total desc), '[]'::jsonb)
        from (select coalesce(pl.nome, 'Sem plano') nome, sum(pg.valor) total, count(*) qtd
                from pagos pg left join public.plans pl on pl.id = pg.plan_id
               group by 1) x
    ),
    'cancelamentos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'nome', p.nome, 'plano', pl.nome, 'status', case when sa.deleted_at is not null then 'removido' else sa.status end,
        'data_matricula', sa.data_matricula, 'saida', (sa.inativado_em at time zone 'America/Sao_Paulo')::date,
        'meses', (extract(year from age(sa.inativado_em::date, sa.data_matricula)) * 12
                  + extract(month from age(sa.inativado_em::date, sa.data_matricula)))::int
      ) order by sa.inativado_em desc), '[]'::jsonb)
        from saidas sa
        join public.profiles p on p.id = sa.profile_id
        left join public.plans pl on pl.id = sa.plan_id
    ),
    'por_professor', (
      select coalesce(jsonb_agg(jsonb_build_object('professor', nome, 'alunos', alunos, 'fichas', fichas) order by alunos desc), '[]'::jsonb)
        from (select coalesce(pr.nome, 'Sem professor') nome, count(distinct w.student_id) alunos, count(*) fichas
                from public.workouts w
                join alunos a on a.id = w.student_id and a.deleted_at is null and a.status = 'ativo'
                left join public.profiles pr on pr.id = w.professor_id
               where w.deleted_at is null and w.ativo and (w.data_fim is null or w.data_fim >= v_today)
               group by 1) x
    ),
    'horarios', (
      select coalesce(jsonb_agg(jsonb_build_object('dow', dow, 'hora', hora, 'total', total)), '[]'::jsonb)
        from (select extract(dow from t)::int dow, extract(hour from t)::int hora, count(*) total
                from cks group by 1, 2) x
    ),
    'aulas', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'aula', nome, 'horario', to_char(horario, 'HH24:MI'), 'reservas', reservas, 'presencas', presencas,
        'faltas', faltas, 'capacidade', capacidade
      ) order by reservas desc), '[]'::jsonb)
        from (select c.nome, c.horario, c.capacidade,
                     count(b.id) filter (where b.status in ('reservado', 'presente', 'falta')) reservas,
                     count(b.id) filter (where b.status = 'presente') presencas,
                     count(b.id) filter (where b.status = 'falta') faltas
                from public.classes c
                left join public.class_bookings b on b.class_id = c.id and b.data between p_de and p_ate
               where c.academy_id = p_academy and c.deleted_at is null
                 and (p_unit is null or c.unit_id = p_unit)
               group by c.id) x
    )
  ));
end $$;

-- ---------------------------------------------------------------------
-- Primeiro acesso: o que já foi configurado
-- ---------------------------------------------------------------------
create or replace function public.onboarding_status(p_academy uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'oculto', coalesce((public._academy_cfg(p_academy) ->> 'onboarding_oculto')::boolean, false),
    'identidade', (public._academy_cfg(p_academy) ->> 'cor_primaria') is not null
                  or (select logo_url is not null from public.academies where id = p_academy),
    'unidades', exists (select 1 from public.units where academy_id = p_academy and deleted_at is null),
    'planos', exists (select 1 from public.plans where academy_id = p_academy and deleted_at is null),
    'equipe', exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
                       where ur.academy_id = p_academy and r.slug not in ('admin', 'aluno')),
    'exercicios', exists (select 1 from public.exercises where academy_id = p_academy and deleted_at is null),
    'alunos', exists (select 1 from public.students where academy_id = p_academy and deleted_at is null),
    'treinos', exists (select 1 from public.workouts where academy_id = p_academy and deleted_at is null),
    'aulas', exists (select 1 from public.classes where academy_id = p_academy and deleted_at is null),
    'recibo', exists (select 1 from public.receipt_settings where academy_id = p_academy),
    'contrato', nullif(trim(public._academy_cfg(p_academy) ->> 'contrato_texto'), '') is not null,
    'checkin', exists (select 1 from public.checkins where academy_id = p_academy)
  )
  where public.is_academy_admin(p_academy) or public.is_super_admin();
$$;

notify pgrst, 'reload schema';
