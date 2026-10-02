-- =====================================================================
-- Migração 011 — Equipe do SaaS, avisos e central de suporte
--   • super_admins.papel: admin (tudo) | suporte (acessar academias, logs, chamados, avisos)
--     | financeiro (faturas, planos SaaS). Regras aplicadas no banco.
--   • announcements: avisos do SaaS exibidos como faixa no sistema das academias
--   • support_tickets / support_messages: chamados abertos pela equipe da academia
-- Requer a 007. Pode ser executada mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Papéis da equipe do SaaS
-- ---------------------------------------------------------------------
alter table public.super_admins add column if not exists papel text not null default 'admin';
alter table public.super_admins drop constraint if exists super_admins_papel_check;
alter table public.super_admins add constraint super_admins_papel_check check (papel in ('admin', 'suporte', 'financeiro'));

create or replace function public.super_role()
returns text language sql stable security definer set search_path = public as $$
  select papel from public.super_admins where user_id = auth.uid();
$$;

/**
 * O que cada papel pode fazer:
 *   acessar     → entrar nas academias ("acessar como") e ver os dados delas   (admin, suporte)
 *   suporte     → responder chamados                                          (admin, suporte)
 *   avisos      → publicar avisos                                             (admin, suporte)
 *   financeiro  → faturas e planos do SaaS                                    (admin, financeiro)
 *   academias   → criar/editar/suspender academias                            (admin)
 *   equipe      → gerenciar usuários do SaaS                                  (admin)
 *   config      → configurações do SaaS                                       (admin)
 */
create or replace function public.super_can(p_area text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select case papel
      when 'admin' then true
      when 'suporte' then p_area in ('acessar', 'suporte', 'avisos')
      when 'financeiro' then p_area = 'financeiro'
      else false end
    from public.super_admins where user_id = auth.uid()
  ), false);
$$;

-- Dados das academias: só quem pode "acessar como"
create or replace function public.has_permission(p_academy uuid, p_perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.super_can('acessar')
      or public.is_academy_admin(p_academy)
      or (
        public.is_member(p_academy) and exists (
          select 1
            from public.user_roles ur
            join public.roles r on r.id = ur.role_id and r.deleted_at is null
            join public.role_permissions rp on rp.role_id = ur.role_id
            join public.permissions pe on pe.id = rp.permission_id
           where ur.user_id = auth.uid()
             and ur.academy_id = p_academy
             and pe.recurso || '.' || pe.acao = p_perm
        )
      );
$$;

create or replace function public.my_admin_academies()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from public.academies where public.super_can('acessar')
  union
  select ur.academy_id
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id and r.deleted_at is null
   where ur.user_id = auth.uid() and r.slug = 'admin'
     and ur.academy_id in (select public.my_member_academies());
$$;

-- Tabelas do SaaS: leitura para a equipe, escrita conforme o papel
drop policy if exists saas_invoices_super_all on public.saas_invoices;
create policy saas_invoices_super_all on public.saas_invoices for all to authenticated
  using ((select public.super_can('financeiro'))) with check ((select public.super_can('financeiro')));

drop policy if exists saas_plans_super_all on public.saas_plans;
create policy saas_plans_super_all on public.saas_plans for all to authenticated
  using ((select public.super_can('financeiro'))) with check ((select public.super_can('financeiro')));

drop policy if exists saas_settings_super_all on public.saas_settings;
drop policy if exists saas_settings_super_select on public.saas_settings;
create policy saas_settings_super_select on public.saas_settings for select to authenticated
  using ((select public.is_super_admin()));
drop policy if exists saas_settings_super_write on public.saas_settings;
create policy saas_settings_super_write on public.saas_settings for all to authenticated
  using ((select public.super_can('config'))) with check ((select public.super_can('config')));

drop policy if exists academies_super_all on public.academies;
create policy academies_super_all on public.academies for all to authenticated
  using ((select public.super_can('academias'))) with check ((select public.super_can('academias')));

drop policy if exists super_admins_super_all on public.super_admins;
create policy super_admins_super_all on public.super_admins for all to authenticated
  using ((select public.super_can('equipe'))) with check ((select public.super_can('equipe')));

-- Sempre sobra pelo menos um administrador
create or replace function public.keep_one_super_admin()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.papel = 'admin' and (tg_op = 'DELETE' or new.papel <> 'admin')
     and not exists (select 1 from public.super_admins where papel = 'admin' and id <> old.id) then
    raise exception 'É preciso manter pelo menos um Administrador no SaaS';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists super_admins_keep_admin on public.super_admins;
create trigger super_admins_keep_admin before update of papel or delete on public.super_admins
  for each row execute function public.keep_one_super_admin();

-- RPCs do SaaS com o papel certo
create or replace function public.create_academy(
  p_nome text, p_cnpj text, p_saas_plan_id uuid,
  p_admin_nome text, p_admin_cpf text, p_admin_telefone text default null,
  p_unidade_nome text default 'Unidade Principal'
) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if not public.super_can('academias') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  return public._create_academy(p_nome, p_cnpj, p_saas_plan_id, p_admin_nome, p_admin_cpf, p_admin_telefone, p_unidade_nome);
end $$;

create or replace function public.generate_saas_invoices(p_competencia date default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_comp  date := date_trunc('month', coalesce(p_competencia, public._today()))::date;
  v_count integer;
begin
  if not public.super_can('financeiro') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  insert into public.saas_invoices (academy_id, saas_plan_id, valor, competencia, vencimento)
  select a.id, sp.id, sp.valor, v_comp, v_comp + 9
    from public.academies a
    join public.saas_plans sp on sp.id = a.saas_plan_id
   where a.deleted_at is null and a.status = 'ativa'
  on conflict (academy_id, competencia) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

drop function if exists public.create_super_admin(text, text, text);
create or replace function public.create_super_admin(p_nome text, p_cpf text, p_email text default null, p_papel text default 'admin')
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_id   uuid;
begin
  if not public.super_can('equipe') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  v_user := public._ensure_auth_user(p_cpf, p_nome);
  insert into public.super_admins (user_id, nome, cpf, email, papel)
  values (v_user, p_nome, p_cpf, nullif(p_email, ''), coalesce(p_papel, 'admin'))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.reset_super_admin_password(p_super_admin_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_sa public.super_admins;
begin
  if not public.super_can('equipe') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  select * into v_sa from public.super_admins where id = p_super_admin_id;
  perform public._set_default_password(v_sa.user_id, v_sa.cpf);
end $$;

-- ---------------------------------------------------------------------
-- Avisos do SaaS
-- ---------------------------------------------------------------------
create table if not exists public.announcements (
  id          uuid primary key default gen_random_uuid(),
  titulo      text not null check (length(titulo) between 3 and 120),
  mensagem    text check (length(mensagem) <= 1000),
  tipo        text not null default 'info' check (tipo in ('info', 'novidade', 'manutencao', 'urgente')),
  publico     text not null default 'equipe' check (publico in ('equipe', 'todos')),
  academy_id  uuid references public.academies(id) on delete cascade, -- null = todas as academias
  link        text,
  inicio      timestamptz not null default now(),
  fim         timestamptz,
  ativo       boolean not null default true,
  criado_por  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (fim is null or fim > inicio)
);
create index if not exists announcements_vigentes_idx on public.announcements (inicio, fim) where ativo;
alter table public.announcements enable row level security;

drop policy if exists announcements_select on public.announcements;
create policy announcements_select on public.announcements for select to authenticated
  using (
    (select public.is_super_admin())
    or (
      ativo and inicio <= now() and (fim is null or fim > now())
      and (
        (publico = 'todos' and (academy_id is null and exists (select public.my_member_academies())
                                or academy_id in (select public.my_member_academies())))
        or (publico = 'equipe' and (academy_id is null and exists (select public.my_staff_academies())
                                    or academy_id in (select public.my_staff_academies())))
      )
    )
  );

drop policy if exists announcements_write on public.announcements;
create policy announcements_write on public.announcements for all to authenticated
  using ((select public.super_can('avisos'))) with check ((select public.super_can('avisos')));

grant select, insert, update, delete on public.announcements to authenticated;

drop trigger if exists announcements_updated_at on public.announcements;
create trigger announcements_updated_at before update on public.announcements
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Central de suporte
-- ---------------------------------------------------------------------
create table if not exists public.support_tickets (
  id              uuid primary key default gen_random_uuid(),
  numero          bigint generated always as identity,
  academy_id      uuid not null references public.academies(id) on delete cascade,
  assunto         text not null check (length(assunto) between 3 and 150),
  categoria       text not null default 'duvida' check (categoria in ('duvida', 'problema', 'financeiro', 'sugestao')),
  prioridade      text not null default 'normal' check (prioridade in ('baixa', 'normal', 'alta')),
  status          text not null default 'aberto' check (status in ('aberto', 'em_andamento', 'respondido', 'resolvido')),
  aberto_por      uuid default auth.uid() references auth.users(id) on delete set null,
  aberto_por_nome text,
  responsavel     uuid references auth.users(id) on delete set null,
  lido_academia   boolean not null default true,
  lido_suporte    boolean not null default false,
  ultima_msg_em   timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists support_tickets_numero_uk on public.support_tickets (numero);
create index if not exists support_tickets_academy_idx on public.support_tickets (academy_id, ultima_msg_em desc);
create index if not exists support_tickets_status_idx on public.support_tickets (status, ultima_msg_em desc);

create table if not exists public.support_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.support_tickets(id) on delete cascade,
  autor       uuid default auth.uid() references auth.users(id) on delete set null,
  autor_nome  text,
  do_suporte  boolean not null default false,
  mensagem    text not null check (length(mensagem) between 1 and 5000),
  created_at  timestamptz not null default now()
);
create index if not exists support_messages_ticket_idx on public.support_messages (ticket_id, created_at);

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;

-- leitura: equipe da academia (os chamados dela) e suporte do SaaS; escrita só pelas funções
drop policy if exists support_tickets_select on public.support_tickets;
create policy support_tickets_select on public.support_tickets for select to authenticated
  using (academy_id in (select public.my_staff_academies()) or (select public.super_can('suporte')));

drop policy if exists support_messages_select on public.support_messages;
create policy support_messages_select on public.support_messages for select to authenticated
  using (ticket_id in (select id from public.support_tickets
                        where academy_id in (select public.my_staff_academies()))
         or (select public.super_can('suporte')));

grant select on public.support_tickets, public.support_messages to authenticated;

/** Nome de quem escreve: Super Admin ou perfil na academia */
create or replace function public._support_author(p_academy uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select nome from public.super_admins where user_id = auth.uid()),
    (select nome from public.profiles where user_id = auth.uid() and academy_id = p_academy and deleted_at is null limit 1),
    'Usuário'
  );
$$;

/** Abre um chamado (equipe da academia) */
create or replace function public.open_ticket(p_academy uuid, p_assunto text, p_categoria text, p_mensagem text, p_prioridade text default 'normal')
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id   uuid;
  v_nome text;
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
  insert into public.support_messages (ticket_id, autor_nome, do_suporte, mensagem)
  values (v_id, v_nome, false, trim(p_mensagem));
  return v_id;
end $$;

/** Responde um chamado (academia ou suporte). Reabre se estava resolvido. */
create or replace function public.reply_ticket(p_ticket uuid, p_mensagem text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_t       public.support_tickets;
  v_suporte boolean;
begin
  select * into v_t from public.support_tickets where id = p_ticket for update;
  if v_t.id is null then
    raise exception 'Chamado não encontrado';
  end if;
  v_suporte := public.super_can('suporte');
  if not v_suporte and not public.is_staff(v_t.academy_id) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  insert into public.support_messages (ticket_id, autor_nome, do_suporte, mensagem)
  values (p_ticket, public._support_author(v_t.academy_id), v_suporte, trim(p_mensagem));

  update public.support_tickets set
    status = case when v_suporte then 'respondido' else 'aberto' end,
    responsavel = case when v_suporte then coalesce(responsavel, auth.uid()) else responsavel end,
    lido_academia = not v_suporte,
    lido_suporte = v_suporte,
    ultima_msg_em = now(),
    updated_at = now()
  where id = p_ticket;
end $$;

/** Muda o status. Suporte: qualquer status; academia: só resolver ou reabrir. */
create or replace function public.set_ticket_status(p_ticket uuid, p_status text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_t public.support_tickets;
begin
  select * into v_t from public.support_tickets where id = p_ticket;
  if v_t.id is null then
    raise exception 'Chamado não encontrado';
  end if;
  if public.super_can('suporte') then
    update public.support_tickets
       set status = p_status, updated_at = now(),
           responsavel = case when p_status = 'em_andamento' then coalesce(responsavel, auth.uid()) else responsavel end
     where id = p_ticket;
  elsif public.is_staff(v_t.academy_id) and p_status in ('resolvido', 'aberto') then
    update public.support_tickets set status = p_status, lido_suporte = (p_status = 'resolvido'), updated_at = now() where id = p_ticket;
  else
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
end $$;

/** Marca o chamado como lido pelo lado de quem chama */
create or replace function public.mark_ticket_read(p_ticket uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_t public.support_tickets;
begin
  select * into v_t from public.support_tickets where id = p_ticket;
  if v_t.id is null then
    return;
  end if;
  if public.super_can('suporte') then
    update public.support_tickets set lido_suporte = true where id = p_ticket and not lido_suporte;
  elsif public.is_staff(v_t.academy_id) then
    update public.support_tickets set lido_academia = true where id = p_ticket and not lido_academia;
  end if;
end $$;

drop trigger if exists support_tickets_audit on public.support_tickets;
create trigger support_tickets_audit after insert or delete on public.support_tickets
  for each row execute function public.audit_trigger();

notify pgrst, 'reload schema';
