-- =====================================================================
-- Migração 018 — Gestão do Super Admin
--   • academies.inativada_em: data em que a academia deixou de estar ativa (cancelamentos)
--   • access_logs: evento 'acesso_super' (Super Admin entrando como academia — histórico)
--   • super_dashboard(): MRR com variação, novas/canceladas, faturas vencidas, chamados,
--     receita de adicionais, custo das ofertas, previsto x recebido do mês
--   • super_academies_overview(): uso do limite, último acesso do admin, atraso, módulos
--   • super_search(): busca global (academia, pessoa por nome/CPF, CNPJ, nº do chamado)
--   • Avisos segmentados por plano e/ou módulo (my_announcements)
--   • Chamados: anexos (bucket privado support-files) e respostas prontas (support_macros)
--   • super_admins: foto e preferências de alerta (update_my_super_profile)
-- Requer a 017. Pode ser executada mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Cancelamentos de academias
-- ---------------------------------------------------------------------
alter table public.academies add column if not exists inativada_em timestamptz;

create or replace function public.academy_exit_date()
returns trigger
language plpgsql as $$
begin
  if old.status = 'ativa' and old.deleted_at is null and (new.status <> 'ativa' or new.deleted_at is not null) then
    new.inativada_em := now();
  elsif new.status = 'ativa' and new.deleted_at is null and (old.status <> 'ativa' or old.deleted_at is not null) then
    new.inativada_em := null;
  end if;
  return new;
end $$;

drop trigger if exists academies_exit_date on public.academies;
create trigger academies_exit_date before update of status, deleted_at on public.academies
  for each row execute function public.academy_exit_date();

update public.academies set inativada_em = coalesce(deleted_at, updated_at)
 where inativada_em is null and (status <> 'ativa' or deleted_at is not null);

-- ---------------------------------------------------------------------
-- Histórico: Super Admin entrando como academia
-- ---------------------------------------------------------------------
alter table public.access_logs drop constraint if exists access_logs_evento_check;
alter table public.access_logs add constraint access_logs_evento_check check (evento in ('login', 'logout', 'acesso_super'));

-- ---------------------------------------------------------------------
-- Dashboard do SaaS
-- ---------------------------------------------------------------------
create or replace function public.super_dashboard()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := public._today();
  v_mes   date := date_trunc('month', public._today())::date;
  v_ini   timestamptz := v_mes::timestamp at time zone 'America/Sao_Paulo';
begin
  if not public.is_super_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  return (
  with ativas as (
    select a.id, public._academy_price(a.id) preco
      from public.academies a
     where a.deleted_at is null and a.status = 'ativa' and a.saas_plan_id is not null
  ),
  anteriores as ( -- ativas no fim do mês passado (preço atual como aproximação)
    select a.id, public._academy_price(a.id) preco
      from public.academies a
     where a.saas_plan_id is not null and a.created_at < v_ini
       and (a.inativada_em is null or a.inativada_em >= v_ini)
  )
  select jsonb_build_object(
    'total', (select count(*) from public.academies where deleted_at is null),
    'ativas', (select count(*) from public.academies where deleted_at is null and status = 'ativa'),
    'mrr', (select coalesce(sum((preco ->> 'mensal_equivalente')::numeric), 0) from ativas),
    'mrr_anterior', (select coalesce(sum((preco ->> 'mensal_equivalente')::numeric), 0) from anteriores),
    'adicionais_mrr', (select coalesce(sum((preco ->> 'adicionais_total')::numeric / (preco ->> 'meses')::numeric), 0) from ativas),
    'desconto_ofertas', (select coalesce(sum((preco ->> 'desconto_oferta')::numeric / (preco ->> 'meses')::numeric), 0) from ativas),
    'novas_mes', (select count(*) from public.academies where deleted_at is null and created_at >= v_ini),
    'canceladas_mes', (select count(*) from public.academies where inativada_em >= v_ini),
    'faturas_vencidas', (select count(*) from public.saas_invoices where status = 'pendente' and vencimento < v_today),
    'valor_vencido', (select coalesce(sum(valor), 0) from public.saas_invoices where status = 'pendente' and vencimento < v_today),
    'inadimplentes', (select count(distinct academy_id) from public.saas_invoices where status = 'pendente' and vencimento < v_today),
    'previsto_mes', (select coalesce(sum(valor), 0) from public.saas_invoices where competencia = v_mes and status <> 'cancelado'),
    'recebido_mes', (select coalesce(sum(valor), 0) from public.saas_invoices where competencia = v_mes and status = 'pago'),
    'chamados_abertos', (select count(*) from public.support_tickets where status <> 'resolvido'),
    'chamados_aguardando', (select count(*) from public.support_tickets where status <> 'resolvido' and not lido_suporte),
    'total_alunos', (select count(*) from public.students where deleted_at is null and status = 'ativo'),
    'crescimento', (
      select jsonb_agg(jsonb_build_object(
        'mes', to_char(m, 'YYYY-MM'),
        'novas', (select count(*) from public.academies
                   where deleted_at is null and created_at >= m and created_at < m + interval '1 month'),
        'total', (select count(*) from public.academies
                   where deleted_at is null and created_at < m + interval '1 month')
      ) order by m)
      from generate_series(v_mes - interval '11 months', v_mes, interval '1 month') m
    )
  ));
end $$;

-- ---------------------------------------------------------------------
-- Visão das academias (lista do Super Admin)
-- ---------------------------------------------------------------------
create or replace function public.super_academies_overview()
returns table (
  academy_id uuid, alunos_ativos integer, limite_alunos integer, ultimo_acesso timestamptz,
  faturas_atrasadas integer, valor_atrasado numeric, modulos integer, modulos_total integer, mrr numeric
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := public._today();
  v_total integer;
begin
  if not public.is_super_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  select count(*) into v_total from public.saas_modules where ativo and not essencial;
  return query
  select a.id,
         (select count(*)::int from public.students s where s.academy_id = a.id and s.deleted_at is null and s.status = 'ativo'),
         sp.limite_alunos,
         (select max(l.created_at) from public.access_logs l
           where l.academy_id = a.id and l.evento = 'login'
             and l.user_id in (select ur.user_id from public.user_roles ur join public.roles r on r.id = ur.role_id
                                where ur.academy_id = a.id and r.slug = 'admin')),
         (select count(*)::int from public.saas_invoices i where i.academy_id = a.id and i.status = 'pendente' and i.vencimento < v_today),
         (select coalesce(sum(i.valor), 0) from public.saas_invoices i where i.academy_id = a.id and i.status = 'pendente' and i.vencimento < v_today),
         (select count(*)::int from unnest(public._academy_modules(a.id)) x(slug)
           join public.saas_modules m on m.slug = x.slug and not m.essencial),
         v_total,
         coalesce((public._academy_price(a.id) ->> 'mensal_equivalente')::numeric, 0)
    from public.academies a
    left join public.saas_plans sp on sp.id = a.saas_plan_id
   where a.deleted_at is null;
end $$;

-- ---------------------------------------------------------------------
-- Busca global
-- ---------------------------------------------------------------------
create or replace function public.super_search(p_q text)
returns table (tipo text, ref text, titulo text, subtitulo text, academy_id uuid)
language plpgsql stable security definer set search_path = public as $$
declare
  v_q    text := trim(coalesce(p_q, ''));
  v_dig  text := regexp_replace(coalesce(p_q, ''), '\D', '', 'g');
  v_like text := '%' || replace(replace(trim(coalesce(p_q, '')), '%', ''), '_', '') || '%';
begin
  if not public.is_super_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if length(v_q) < 2 then
    return;
  end if;

  return query
  (select 'academia'::text, a.id::text, a.nome, coalesce('CNPJ ' || a.cnpj, a.cidade, ''), a.id
     from public.academies a
    where a.deleted_at is null and (a.nome ilike v_like or (length(v_dig) >= 4 and a.cnpj like '%' || v_dig || '%'))
    order by a.nome limit 8)
  union all
  (select case when exists (select 1 from public.students s where s.profile_id = p.id and s.deleted_at is null) then 'aluno' else 'equipe' end,
          coalesce((select s.id::text from public.students s where s.profile_id = p.id and s.deleted_at is null limit 1), p.id::text),
          p.nome, a.nome || ' · CPF ' || p.cpf, p.academy_id
     from public.profiles p
     join public.academies a on a.id = p.academy_id and a.deleted_at is null
    where public.super_can('acessar') and p.deleted_at is null
      and (p.nome ilike v_like or (length(v_dig) >= 4 and p.cpf like '%' || v_dig || '%'))
    order by p.nome limit 10)
  union all
  (select 'chamado'::text, t.id::text, '#' || t.numero || ' · ' || t.assunto, a.nome || ' · ' || t.status, t.academy_id
     from public.support_tickets t
     join public.academies a on a.id = t.academy_id
    where public.super_can('suporte')
      and ((case when v_dig <> '' and v_dig = v_q and length(v_dig) <= 15 then t.numero = v_dig::bigint else false end)
           or t.assunto ilike v_like)
    order by t.ultima_msg_em desc limit 8);
end $$;

-- ---------------------------------------------------------------------
-- Avisos segmentados
-- ---------------------------------------------------------------------
alter table public.announcements add column if not exists planos uuid[];   -- null/vazio = todos os planos
alter table public.announcements add column if not exists modulo text;     -- null = qualquer academia

-- leitura direta da tabela só para o Super Admin; academias usam my_announcements()
drop policy if exists announcements_select on public.announcements;
create policy announcements_select on public.announcements for select to authenticated
  using ((select public.is_super_admin()));

/** Avisos vigentes para o usuário na academia ativa (público, plano, módulo e período) */
create or replace function public.my_announcements(p_academy uuid)
returns setof public.announcements
language sql stable security definer set search_path = public as $$
  select n.*
    from public.announcements n
    join public.academies ac on ac.id = p_academy
   where public.is_member(p_academy)
     and n.ativo and n.inicio <= now() and (n.fim is null or n.fim > now())
     and (n.academy_id is null or n.academy_id = p_academy)
     and (n.publico = 'todos' or public.is_staff(p_academy))
     and (n.planos is null or cardinality(n.planos) = 0 or ac.saas_plan_id = any (n.planos))
     and (n.modulo is null or public.has_module(p_academy, n.modulo))
   order by n.inicio desc
   limit 10;
$$;

-- ---------------------------------------------------------------------
-- Chamados: anexos e respostas prontas
-- ---------------------------------------------------------------------
alter table public.support_messages add column if not exists anexos jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public)
values ('support-files', 'support-files', false)
on conflict (id) do nothing;

do $$
begin
  update storage.buckets set file_size_limit = 10485760 where id = 'support-files';
exception when undefined_column then
  null;
end $$;

-- support-files/{academy_id}/... : equipe da academia ou suporte do SaaS
drop policy if exists support_files_read on storage.objects;
create policy support_files_read on storage.objects for select to authenticated
  using (bucket_id = 'support-files'
    and ((storage.foldername(name))[1] in (select public.my_staff_academies()::text) or public.super_can('suporte')));

drop policy if exists support_files_insert on storage.objects;
create policy support_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'support-files'
    and ((storage.foldername(name))[1] in (select public.my_staff_academies()::text) or public.super_can('suporte')));

/** Anexos válidos: até 5, cada um dentro da pasta da academia do chamado */
create or replace function public._clean_attachments(p_academy uuid, p_anexos jsonb)
returns jsonb language plpgsql immutable as $$
declare
  v jsonb := coalesce(p_anexos, '[]'::jsonb);
begin
  if jsonb_typeof(v) <> 'array' then
    return '[]'::jsonb;
  end if;
  if jsonb_array_length(v) > 5 then
    raise exception 'Envie no máximo 5 anexos por mensagem';
  end if;
  if exists (select 1 from jsonb_array_elements(v) e where coalesce(e ->> 'path', '') not like p_academy::text || '/%') then
    raise exception 'Anexo inválido';
  end if;
  return v;
end $$;

drop function if exists public.open_ticket(uuid, text, text, text, text);
create or replace function public.open_ticket(
  p_academy uuid, p_assunto text, p_categoria text, p_mensagem text, p_prioridade text default 'normal', p_anexos jsonb default '[]'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id   uuid;
  v_nome text;
  v_anx  jsonb := public._clean_attachments(p_academy, p_anexos);
begin
  if not public.is_staff(p_academy) then
    raise exception 'Somente a equipe da academia pode abrir chamados' using errcode = '42501';
  end if;
  if (select count(*) from public.support_tickets where aberto_por = auth.uid() and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Muitos chamados em pouco tempo. Aguarde um pouco ou responda num chamado já aberto.';
  end if;
  v_nome := public._support_author(p_academy);
  insert into public.support_tickets (academy_id, assunto, categoria, prioridade, aberto_por_nome)
  values (p_academy, trim(p_assunto), coalesce(p_categoria, 'duvida'), coalesce(p_prioridade, 'normal'), v_nome)
  returning id into v_id;
  insert into public.support_messages (ticket_id, autor_nome, do_suporte, mensagem, anexos)
  values (v_id, v_nome, false, coalesce(nullif(trim(p_mensagem), ''), '(anexo)'), v_anx);
  return v_id;
end $$;

drop function if exists public.reply_ticket(uuid, text);
create or replace function public.reply_ticket(p_ticket uuid, p_mensagem text, p_anexos jsonb default '[]')
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_t       public.support_tickets;
  v_suporte boolean;
  v_anx     jsonb;
begin
  select * into v_t from public.support_tickets where id = p_ticket for update;
  if v_t.id is null then
    raise exception 'Chamado não encontrado';
  end if;
  v_suporte := public.super_can('suporte');
  if not v_suporte and not public.is_staff(v_t.academy_id) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  v_anx := public._clean_attachments(v_t.academy_id, p_anexos);
  if coalesce(trim(p_mensagem), '') = '' and jsonb_array_length(v_anx) = 0 then
    raise exception 'Escreva uma mensagem ou anexe um arquivo';
  end if;

  insert into public.support_messages (ticket_id, autor_nome, do_suporte, mensagem, anexos)
  values (p_ticket, public._support_author(v_t.academy_id), v_suporte, coalesce(nullif(trim(p_mensagem), ''), '(anexo)'), v_anx);

  update public.support_tickets set
    status = case when v_suporte then 'respondido' else 'aberto' end,
    responsavel = case when v_suporte then coalesce(responsavel, auth.uid()) else responsavel end,
    lido_academia = not v_suporte,
    lido_suporte = v_suporte,
    ultima_msg_em = now(),
    updated_at = now()
  where id = p_ticket;
end $$;

create table if not exists public.support_macros (
  id         uuid primary key default gen_random_uuid(),
  titulo     text not null check (length(titulo) between 2 and 80),
  texto      text not null check (length(texto) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.support_macros enable row level security;
drop policy if exists support_macros_all on public.support_macros;
create policy support_macros_all on public.support_macros for all to authenticated
  using ((select public.super_can('suporte'))) with check ((select public.super_can('suporte')));
grant select, insert, update, delete on public.support_macros to authenticated;

drop trigger if exists support_macros_updated_at on public.support_macros;
create trigger support_macros_updated_at before update on public.support_macros
  for each row execute function public.set_updated_at();

insert into public.support_macros (titulo, texto)
select v.t, v.x from (values
  ('Recurso não aparece', 'Olá! Esse recurso depende do plano/módulos liberados para a sua academia. Já verifiquei por aqui e retorno em seguida.'),
  ('Esqueci a senha', 'Olá! O administrador da academia pode redefinir a senha em Alunos (ou Perfil de acesso) → abrir o cadastro → "Resetar senha". A nova senha passa a ser os 6 primeiros dígitos do CPF.'),
  ('Resolvido', 'Pronto, ajuste feito! Se precisar de mais alguma coisa, é só responder aqui.')
) v(t, x)
where not exists (select 1 from public.support_macros);

-- ---------------------------------------------------------------------
-- Perfil do Super Admin
-- ---------------------------------------------------------------------
alter table public.super_admins add column if not exists avatar_url text;
alter table public.super_admins add column if not exists alertas jsonb not null default '{}'::jsonb;

/** Dados do próprio usuário do SaaS (não muda papel nem CPF) */
create or replace function public.update_my_super_profile(p_nome text, p_email text, p_avatar_url text, p_alertas jsonb)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'Informe o nome';
  end if;
  update public.super_admins
     set nome = trim(p_nome), email = nullif(trim(p_email), ''), avatar_url = nullif(p_avatar_url, ''),
         alertas = coalesce(p_alertas, '{}'::jsonb)
   where user_id = auth.uid();
end $$;

notify pgrst, 'reload schema';
