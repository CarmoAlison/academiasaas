-- =====================================================================
-- Migração 007 — Desempenho
--   • Regras de acesso (RLS) reescritas no padrão recomendado pelo Supabase:
--     "academy_id in (select <academias permitidas>)" — a lista de academias do
--     usuário é calculada UMA vez por consulta, e não linha a linha.
--     O comportamento (quem vê/edita o quê) é exatamente o mesmo de antes.
--   • Índices extras para as junções usadas pelas regras
--   • Views para paginação/busca/ordenação no servidor:
--     v_students, v_payments, v_workouts (security_invoker = respeitam a RLS)
--   • payments_summary: totais do financeiro sem carregar todos os pagamentos
-- Pode ser executada mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Conjuntos de academias do usuário logado (avaliados uma vez por consulta)
-- ---------------------------------------------------------------------

/** Academias ativas em que o usuário tem perfil ativo */
create or replace function public.my_member_academies()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select p.academy_id
    from public.profiles p
    join public.academies a on a.id = p.academy_id
   where p.user_id = auth.uid()
     and p.deleted_at is null and p.status = 'ativo'
     and a.deleted_at is null and a.status = 'ativa';
$$;

/** Academias em que o usuário é da equipe (qualquer perfil diferente de "aluno") */
create or replace function public.my_staff_academies()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct ur.academy_id
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id and r.deleted_at is null
   where ur.user_id = auth.uid()
     and coalesce(r.slug, '') <> 'aluno'
     and ur.academy_id in (select public.my_member_academies());
$$;

/** Academias em que o usuário tem o perfil Admin (Super Admin: todas) */
create or replace function public.my_admin_academies()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from public.academies where public.is_super_admin()
  union
  select ur.academy_id
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id and r.deleted_at is null
   where ur.user_id = auth.uid() and r.slug = 'admin'
     and ur.academy_id in (select public.my_member_academies());
$$;

/** Academias em que o usuário tem a permissão "recurso.acao" (Admin e Super Admin: todas as suas) */
create or replace function public.academies_with_permission(p_perm text)
returns setof uuid
language sql stable security definer set search_path = public as $$
  select public.my_admin_academies()
  union
  select ur.academy_id
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id and r.deleted_at is null
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions pe on pe.id = rp.permission_id
   where ur.user_id = auth.uid()
     and pe.recurso || '.' || pe.acao = p_perm
     and ur.academy_id in (select public.my_member_academies());
$$;

-- ---------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------
create index if not exists user_roles_user_idx on public.user_roles (user_id, academy_id);
create index if not exists role_permissions_permission_idx on public.role_permissions (permission_id);
create index if not exists roles_academy_idx on public.roles (academy_id) where deleted_at is null;
create index if not exists profiles_academy_idx on public.profiles (academy_id) where deleted_at is null;
create index if not exists workouts_student_idx on public.workouts (student_id) where deleted_at is null;
create index if not exists class_bookings_student_idx on public.class_bookings (student_id, data);
create index if not exists students_plan_idx on public.students (plan_id);
create index if not exists payments_vencimento_idx on public.payments (academy_id, vencimento) where deleted_at is null;
create index if not exists saas_invoices_academy_idx on public.saas_invoices (academy_id, competencia);

-- ---------------------------------------------------------------------
-- Tabelas de domínio: mesmas regras, no formato rápido
-- ---------------------------------------------------------------------
do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('units',             'unidades'),
      ('plans',             'planos'),
      ('students',          'alunos'),
      ('exercises',         'treinos'),
      ('workouts',          'treinos'),
      ('workout_days',      'treinos'),
      ('workout_exercises', 'treinos'),
      ('workout_logs',      'treinos'),
      ('classes',           'aulas'),
      ('class_bookings',    'aulas'),
      ('payments',          'financeiro')
    ) as v(tbl, recurso)
  loop
    execute format('drop policy if exists %I on public.%I', t.tbl || '_perm_select', t.tbl);
    execute format('drop policy if exists %I on public.%I', t.tbl || '_perm_insert', t.tbl);
    execute format('drop policy if exists %I on public.%I', t.tbl || '_perm_update', t.tbl);
    execute format('drop policy if exists %I on public.%I', t.tbl || '_super_delete', t.tbl);

    execute format(
      'create policy %I on public.%I for select to authenticated
         using (academy_id in (select public.academies_with_permission(%L)))',
      t.tbl || '_perm_select', t.tbl, t.recurso || '.ver');

    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (academy_id in (select public.academies_with_permission(%L)))',
      t.tbl || '_perm_insert', t.tbl, t.recurso || '.criar');

    execute format(
      'create policy %I on public.%I for update to authenticated
         using (academy_id in (select public.academies_with_permission(%L))
             or academy_id in (select public.academies_with_permission(%L)))
         with check (academy_id in (select public.academies_with_permission(%L))
             or academy_id in (select public.academies_with_permission(%L)))',
      t.tbl || '_perm_update', t.tbl,
      t.recurso || '.editar', t.recurso || '.excluir',
      t.recurso || '.editar', t.recurso || '.excluir');

    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select public.is_super_admin()))',
      t.tbl || '_super_delete', t.tbl);
  end loop;
end $$;

-- delete físico de itens/dias de treino por quem edita treinos
drop policy if exists workout_exercises_perm_delete on public.workout_exercises;
create policy workout_exercises_perm_delete on public.workout_exercises for delete to authenticated
  using (academy_id in (select public.academies_with_permission('treinos.editar')));

drop policy if exists workout_days_perm_delete on public.workout_days;
create policy workout_days_perm_delete on public.workout_days for delete to authenticated
  using (academy_id in (select public.academies_with_permission('treinos.editar')));

-- dados de referência visíveis para qualquer membro (inclusive alunos)
drop policy if exists units_member_select on public.units;
create policy units_member_select on public.units for select to authenticated
  using (academy_id in (select public.my_member_academies()));

drop policy if exists plans_member_select on public.plans;
create policy plans_member_select on public.plans for select to authenticated
  using (academy_id in (select public.my_member_academies()));

drop policy if exists exercises_member_select on public.exercises;
create policy exercises_member_select on public.exercises for select to authenticated
  using (academy_id in (select public.my_member_academies()));

drop policy if exists classes_member_select on public.classes;
create policy classes_member_select on public.classes for select to authenticated
  using (academy_id in (select public.my_member_academies()));

drop policy if exists students_own_select on public.students;
create policy students_own_select on public.students for select to authenticated
  using (profile_id in (select id from public.profiles where user_id = (select auth.uid())));

-- ---------------------------------------------------------------------
-- Usuários, perfis e permissões
-- ---------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_super_admin())
    or academy_id in (select public.my_staff_academies())
  );

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (
    user_id = (select auth.uid())
    or academy_id in (select public.academies_with_permission('alunos.editar'))
    or academy_id in (select public.academies_with_permission('equipe.editar'))
  )
  with check (
    user_id = (select auth.uid())
    or academy_id in (select public.academies_with_permission('alunos.editar'))
    or academy_id in (select public.academies_with_permission('equipe.editar'))
  );

drop policy if exists profiles_super_delete on public.profiles;
create policy profiles_super_delete on public.profiles for delete to authenticated
  using ((select public.is_super_admin()));

drop policy if exists permissions_super_all on public.permissions;
create policy permissions_super_all on public.permissions for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));

drop policy if exists roles_select on public.roles;
create policy roles_select on public.roles for select to authenticated
  using (academy_id in (select public.my_member_academies()) or (select public.is_super_admin()));

drop policy if exists roles_insert on public.roles;
create policy roles_insert on public.roles for insert to authenticated
  with check (academy_id in (select public.academies_with_permission('perfis.criar')) and not is_system);

drop policy if exists roles_update on public.roles;
create policy roles_update on public.roles for update to authenticated
  using (academy_id in (select public.academies_with_permission('perfis.editar'))
      or academy_id in (select public.academies_with_permission('perfis.excluir')))
  with check (academy_id in (select public.academies_with_permission('perfis.editar'))
      or academy_id in (select public.academies_with_permission('perfis.excluir')));

drop policy if exists role_permissions_select on public.role_permissions;
create policy role_permissions_select on public.role_permissions for select to authenticated
  using (role_id in (
    select id from public.roles
     where academy_id in (select public.my_member_academies()) or (select public.is_super_admin())
  ));

drop policy if exists role_permissions_insert on public.role_permissions;
create policy role_permissions_insert on public.role_permissions for insert to authenticated
  with check (role_id in (
    select id from public.roles
     where coalesce(slug, '') <> 'admin'
       and academy_id in (select public.academies_with_permission('perfis.editar'))
  ));

drop policy if exists role_permissions_delete on public.role_permissions;
create policy role_permissions_delete on public.role_permissions for delete to authenticated
  using (role_id in (
    select id from public.roles
     where coalesce(slug, '') <> 'admin'
       and academy_id in (select public.academies_with_permission('perfis.editar'))
  ));

drop policy if exists user_roles_select on public.user_roles;
create policy user_roles_select on public.user_roles for select to authenticated
  using (
    user_id = (select auth.uid())
    or academy_id in (select public.my_staff_academies())
    or (select public.is_super_admin())
  );

drop policy if exists user_roles_insert on public.user_roles;
create policy user_roles_insert on public.user_roles for insert to authenticated
  with check (
    academy_id in (select public.academies_with_permission('equipe.editar'))
    and (
      academy_id in (select public.my_admin_academies())
      or role_id not in (select id from public.roles where slug = 'admin')
    )
  );

drop policy if exists user_roles_delete on public.user_roles;
create policy user_roles_delete on public.user_roles for delete to authenticated
  using (
    academy_id in (select public.academies_with_permission('equipe.editar'))
    and (
      academy_id in (select public.my_admin_academies())
      or role_id not in (select id from public.roles where slug = 'admin')
    )
  );

-- ---------------------------------------------------------------------
-- Globais / SaaS
-- ---------------------------------------------------------------------
drop policy if exists saas_plans_super_all on public.saas_plans;
create policy saas_plans_super_all on public.saas_plans for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));

drop policy if exists academies_select on public.academies;
create policy academies_select on public.academies for select to authenticated
  using ((select public.is_super_admin()) or id in (select public.my_member_academies()));

drop policy if exists academies_super_all on public.academies;
create policy academies_super_all on public.academies for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));

drop policy if exists super_admins_select on public.super_admins;
create policy super_admins_select on public.super_admins for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_super_admin()));

drop policy if exists super_admins_super_all on public.super_admins;
create policy super_admins_super_all on public.super_admins for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));

drop policy if exists saas_invoices_select on public.saas_invoices;
create policy saas_invoices_select on public.saas_invoices for select to authenticated
  using (academy_id in (select public.my_admin_academies()));

drop policy if exists saas_invoices_super_all on public.saas_invoices;
create policy saas_invoices_super_all on public.saas_invoices for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));

drop policy if exists saas_settings_super_all on public.saas_settings;
create policy saas_settings_super_all on public.saas_settings for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));

-- ---------------------------------------------------------------------
-- Logs e recibo
-- ---------------------------------------------------------------------
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select to authenticated
  using ((select public.is_super_admin()) or academy_id in (select public.academies_with_permission('auditoria.ver')));

drop policy if exists access_logs_select on public.access_logs;
create policy access_logs_select on public.access_logs for select to authenticated
  using ((select public.is_super_admin()) or academy_id in (select public.academies_with_permission('auditoria.ver')));

drop policy if exists errors_select on public.errors;
create policy errors_select on public.errors for select to authenticated
  using ((select public.is_super_admin()) or academy_id in (select public.academies_with_permission('auditoria.ver')));

drop policy if exists receipt_settings_select on public.receipt_settings;
create policy receipt_settings_select on public.receipt_settings for select to authenticated
  using (academy_id in (select public.my_member_academies()) or (select public.is_super_admin()));

drop policy if exists receipt_settings_insert on public.receipt_settings;
create policy receipt_settings_insert on public.receipt_settings for insert to authenticated
  with check (academy_id in (select public.academies_with_permission('financeiro.editar')));

drop policy if exists receipt_settings_update on public.receipt_settings;
create policy receipt_settings_update on public.receipt_settings for update to authenticated
  using (academy_id in (select public.academies_with_permission('financeiro.editar')))
  with check (academy_id in (select public.academies_with_permission('financeiro.editar')));

-- ---------------------------------------------------------------------
-- Views para listas paginadas no servidor (respeitam a RLS de quem consulta)
-- ---------------------------------------------------------------------
drop view if exists public.v_students;
create view public.v_students with (security_invoker = true) as
select
  s.id, s.academy_id, s.profile_id, s.unit_id, s.plan_id, s.status, s.data_matricula, s.created_at,
  p.nome, p.cpf, p.telefone, p.email_contato, p.avatar_url,
  pl.nome as plano_nome, u.nome as unidade_nome
from public.students s
join public.profiles p on p.id = s.profile_id
left join public.plans pl on pl.id = s.plan_id
left join public.units u on u.id = s.unit_id
where s.deleted_at is null;

drop view if exists public.v_payments;
create view public.v_payments with (security_invoker = true) as
select
  pa.id, pa.academy_id, pa.student_id, pa.plan_id, pa.descricao, pa.valor, pa.vencimento, pa.pago_em,
  pa.forma_pagamento, pa.status, pa.recibo_numero, pa.created_at,
  case when pa.status = 'pendente' and pa.vencimento < public._today() then 'atrasado' else pa.status end as situacao,
  p.nome as aluno_nome, p.cpf as aluno_cpf, p.telefone as aluno_telefone,
  pl.nome as plano_nome
from public.payments pa
join public.students s on s.id = pa.student_id
join public.profiles p on p.id = s.profile_id
left join public.plans pl on pl.id = pa.plan_id
where pa.deleted_at is null;

drop view if exists public.v_workouts;
create view public.v_workouts with (security_invoker = true) as
select
  w.id, w.academy_id, w.student_id, w.professor_id, w.nome, w.objetivo, w.data_inicio, w.data_fim, w.ativo, w.created_at,
  (w.ativo and (w.data_fim is null or w.data_fim >= public._today())) as vigente,
  p.nome as aluno_nome,
  pr.nome as professor_nome,
  coalesce((select array_agg(d.dia_semana order by (d.dia_semana + 6) % 7)
              from public.workout_days d where d.workout_id = w.id and d.dia_semana is not null), '{}') as dias,
  (select count(*) from public.workout_days d where d.workout_id = w.id)::int as total_dias
from public.workouts w
join public.students s on s.id = w.student_id
join public.profiles p on p.id = s.profile_id
left join public.profiles pr on pr.id = w.professor_id
where w.deleted_at is null;

grant select on public.v_students, public.v_payments, public.v_workouts to authenticated;

-- ---------------------------------------------------------------------
-- Totais do financeiro (cards) sem trazer os pagamentos para o navegador
-- ---------------------------------------------------------------------
create or replace function public.payments_summary(p_academy uuid, p_de date, p_ate date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := public._today();
begin
  if not public.has_permission(p_academy, 'financeiro.ver') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'previsto',   coalesce(sum(valor) filter (where status <> 'cancelado' and vencimento between p_de and p_ate), 0),
      'recebido',   coalesce(sum(valor) filter (where status = 'pago' and vencimento between p_de and p_ate), 0),
      'a_receber',  coalesce(sum(valor) filter (where status = 'pendente' and vencimento >= v_today and vencimento between p_de and p_ate), 0),
      'atrasado_mes', coalesce(sum(valor) filter (where status = 'pendente' and vencimento < v_today and vencimento between p_de and p_ate), 0),
      'inadimplencia', coalesce(sum(valor) filter (where status = 'pendente' and vencimento < v_today), 0),
      'alunos_em_atraso', count(distinct student_id) filter (where status = 'pendente' and vencimento < v_today)
    )
    from public.payments
    where academy_id = p_academy and deleted_at is null
  );
end $$;

notify pgrst, 'reload schema';
