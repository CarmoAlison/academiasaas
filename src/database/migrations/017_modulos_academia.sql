-- =====================================================================
-- Migração 017 — Módulos por academia
--   • saas_modules: catálogo de módulos (editável pelo Super Admin; "essencial" = sempre ligado)
--   • saas_plans.modulos: módulos incluídos no plano (null = todos)
--   • academies.modulos_override: ajustes por academia { "slug": true|false }
--   • academy_modules() / has_module(): módulos liberados de uma academia
--   • Bloqueio no banco (não só na tela):
--       - políticas RESTRITIVAS nas tabelas de cada módulo (ninguém da academia lê/grava)
--       - gatilho nas inclusões feitas por funções do sistema (reserva, check-in, chamado…)
--       - has_permission / academies_with_permission recusam recursos de módulo desligado
--     No "acessar como", o Super Admin vê a academia como ela é. Nada é apagado ao desligar.
-- Requer a 014. Pode ser executada mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------
create table if not exists public.saas_modules (
  slug       text primary key check (slug ~ '^[a-z0-9_]{2,40}$'),
  nome       text not null,
  descricao  text,
  grupo      text not null default 'gestao' check (grupo in ('gestao', 'aluno', 'ambos')),
  essencial  boolean not null default false,
  ativo      boolean not null default true,
  ordem      integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.saas_modules (slug, nome, descricao, grupo, essencial, ordem) values
  ('alunos',     'Alunos e cadastros',        'Alunos, planos da academia, unidades, equipe e perfis de acesso', 'gestao', true, 1),
  ('dashboard',  'Dashboard',                 'Painel inicial com indicadores',                                  'gestao', true, 2),
  ('treinos',    'Treinos',                   'Fichas de treino, exercícios e treino do aluno',                  'ambos',  false, 10),
  ('videos',     'Vídeos nos exercícios',     'Link do YouTube/Vimeo ou envio de vídeo nos exercícios',           'ambos',  false, 11),
  ('aulas',      'Aulas coletivas',           'Agenda, reservas, lista de espera e presença',                    'ambos',  false, 20),
  ('checkin',    'Check-in e frequência',     'QR Code na recepção, histórico e alunos sumidos',                 'ambos',  false, 30),
  ('financeiro', 'Financeiro',                'Mensalidades, recibos, renovações e inadimplência',               'ambos',  false, 40),
  ('whatsapp',   'WhatsApp',                  'Lembretes, cobranças e recibos em 1 clique',                      'gestao', false, 50),
  ('contratos',  'Contrato digital',          'Contrato com aceite eletrônico pelo aluno',                       'ambos',  false, 60),
  ('relatorios', 'Relatórios',                'Relatórios gerenciais com exportação em PDF/CSV',                 'gestao', false, 70),
  ('auditoria',  'Auditoria e logs',          'Histórico de alterações, acessos e erros',                        'gestao', false, 80),
  ('identidade', 'Identidade visual',         'Logo e cor da academia no sistema',                               'gestao', false, 90),
  ('suporte',    'Central de suporte',        'Chamados com a equipe do sistema',                                'gestao', false, 95)
on conflict (slug) do nothing;

alter table public.saas_plans add column if not exists modulos text[];          -- null = todos os módulos
alter table public.academies add column if not exists modulos_override jsonb not null default '{}'::jsonb;

alter table public.saas_modules enable row level security;
drop policy if exists saas_modules_select on public.saas_modules;
create policy saas_modules_select on public.saas_modules for select to authenticated using (true);
drop policy if exists saas_modules_write on public.saas_modules;
create policy saas_modules_write on public.saas_modules for all to authenticated
  using ((select public.super_can('academias'))) with check ((select public.super_can('academias')));
grant select, insert, update, delete on public.saas_modules to authenticated;

drop trigger if exists saas_modules_updated_at on public.saas_modules;
create trigger saas_modules_updated_at before update on public.saas_modules
  for each row execute function public.set_updated_at();
drop trigger if exists saas_modules_audit on public.saas_modules;
create trigger saas_modules_audit after insert or update or delete on public.saas_modules
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------
-- Módulos liberados
-- ---------------------------------------------------------------------
/** Módulos liberados (essencial, ou ajuste da academia, ou incluído no plano) */
create or replace function public._academy_modules(p_academy uuid)
returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(m.slug order by m.ordem, m.slug), '{}')
    from public.saas_modules m
    cross join public.academies a
    left join public.saas_plans p on p.id = a.saas_plan_id
   where a.id = p_academy
     and m.ativo
     and (
       m.essencial
       or case when a.modulos_override ? m.slug then (a.modulos_override ->> m.slug)::boolean
               else p.modulos is null or m.slug = any (p.modulos) end
     );
$$;
revoke execute on function public._academy_modules(uuid) from public, anon, authenticated;

/** Para as telas: módulos da academia (membros dela ou Super Admin) */
create or replace function public.academy_modules(p_academy uuid)
returns text[]
language sql stable security definer set search_path = public as $$
  select case when public.is_member(p_academy) or public.is_super_admin() then public._academy_modules(p_academy) else '{}'::text[] end;
$$;

/** Módulo liberado? (módulo inexistente/desativado no catálogo não bloqueia nada) */
create or replace function public.has_module(p_academy uuid, p_slug text)
returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.saas_modules where slug = p_slug and ativo)
      or p_slug = any (public._academy_modules(p_academy));
$$;

/** Academias do usuário em que o módulo está liberado (avaliado uma vez por consulta) */
create or replace function public.academies_with_module(p_slug text)
returns setof uuid
language sql stable security definer set search_path = public as $$
  select x.id from (select public.my_member_academies() id) x where public.has_module(x.id, p_slug);
$$;

/** Recurso de permissão → módulo */
create or replace function public._module_of(p_perm text)
returns text language sql immutable as $$
  select case split_part(p_perm, '.', 1)
    when 'treinos' then 'treinos'
    when 'aulas' then 'aulas'
    when 'financeiro' then 'financeiro'
    when 'relatorios' then 'relatorios'
    when 'auditoria' then 'auditoria'
  end;
$$;

-- ---------------------------------------------------------------------
-- Permissões respeitam o módulo
-- ---------------------------------------------------------------------
create or replace function public.has_permission(p_academy uuid, p_perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select (public._module_of(p_perm) is null or public.has_module(p_academy, public._module_of(p_perm)))
    and (
      public.super_can('acessar')
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
      )
    );
$$;

create or replace function public.academies_with_permission(p_perm text)
returns setof uuid
language sql stable security definer set search_path = public as $$
  select x.id from (
    select public.my_admin_academies() id
    union
    select ur.academy_id
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id and r.deleted_at is null
      join public.role_permissions rp on rp.role_id = r.id
      join public.permissions pe on pe.id = rp.permission_id
     where ur.user_id = auth.uid()
       and pe.recurso || '.' || pe.acao = p_perm
       and ur.academy_id in (select public.my_member_academies())
  ) x
  where public._module_of(p_perm) is null or public.has_module(x.id, public._module_of(p_perm));
$$;

-- ---------------------------------------------------------------------
-- Políticas restritivas: tabela de módulo desligado fica inacessível para a academia
-- ---------------------------------------------------------------------
do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('exercises', 'treinos'), ('workouts', 'treinos'), ('workout_days', 'treinos'),
      ('workout_exercises', 'treinos'), ('workout_logs', 'treinos'),
      ('classes', 'aulas'), ('class_bookings', 'aulas'),
      ('payments', 'financeiro'),
      ('checkins', 'checkin'),
      ('contracts', 'contratos'),
      ('whatsapp_logs', 'whatsapp'),
      ('support_tickets', 'suporte')
    ) as v(tbl, modulo)
  loop
    execute format('drop policy if exists %I on public.%I', t.tbl || '_modulo', t.tbl);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated
         using ((select public.is_super_admin()) or academy_id in (select public.academies_with_module(%L)))
         with check ((select public.is_super_admin()) or academy_id in (select public.academies_with_module(%L)))',
      t.tbl || '_modulo', t.tbl, t.modulo, t.modulo);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Inclusões feitas por funções do sistema (que ignoram a RLS)
-- ---------------------------------------------------------------------
create or replace function public.check_module_insert()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() and not public.has_module(new.academy_id, tg_argv[0]) then
    raise exception 'O recurso "%" não está disponível para esta academia',
      coalesce((select nome from public.saas_modules where slug = tg_argv[0]), tg_argv[0])
      using errcode = '42501';
  end if;
  return new;
end $$;

do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('workout_logs', 'treinos'), ('class_bookings', 'aulas'), ('checkins', 'checkin'),
      ('contracts', 'contratos'), ('support_tickets', 'suporte'), ('whatsapp_logs', 'whatsapp')
    ) as v(tbl, modulo)
  loop
    execute format('drop trigger if exists %I on public.%I', t.tbl || '_modulo', t.tbl);
    execute format(
      'create trigger %I before insert on public.%I for each row execute function public.check_module_insert(%L)',
      t.tbl || '_modulo', t.tbl, t.modulo);
  end loop;
end $$;

-- Contrato automático no cadastro só com o módulo de contratos ligado
create or replace function public.auto_issue_contract()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce((public._academy_cfg(new.academy_id) ->> 'contrato_automatico')::boolean, false)
     and public.has_module(new.academy_id, 'contratos') then
    perform public._issue_contract(new.id);
  end if;
  return new;
end $$;

notify pgrst, 'reload schema';
