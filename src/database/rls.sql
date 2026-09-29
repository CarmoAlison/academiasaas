-- =====================================================================
-- SaaS Academia — ROW LEVEL SECURITY
-- Executar depois de functions.sql
--
-- Regras:
--  • Super Admin vê tudo (has_permission() já retorna true para ele)
--  • Equipe da academia: acesso por permissão granular recurso.acao
--  • Aluno: somente os próprios registros
--  • Soft delete: exclusão = UPDATE deleted_at (filtro deleted_at IS NULL nas queries)
--  • DELETE físico: apenas Super Admin
-- =====================================================================

alter table public.saas_plans         enable row level security;
alter table public.academies          enable row level security;
alter table public.super_admins       enable row level security;
alter table public.permissions        enable row level security;
alter table public.saas_invoices      enable row level security;
alter table public.saas_settings      enable row level security;
alter table public.profiles           enable row level security;
alter table public.roles              enable row level security;
alter table public.role_permissions   enable row level security;
alter table public.user_roles         enable row level security;
alter table public.units              enable row level security;
alter table public.plans              enable row level security;
alter table public.students           enable row level security;
alter table public.exercises          enable row level security;
alter table public.workouts           enable row level security;
alter table public.workout_exercises  enable row level security;
alter table public.workout_logs       enable row level security;
alter table public.classes            enable row level security;
alter table public.class_bookings     enable row level security;
alter table public.payments           enable row level security;
alter table public.audit_logs         enable row level security;
alter table public.access_logs        enable row level security;
alter table public.errors             enable row level security;
alter table public.receipt_settings   enable row level security;

-- ---------------------------------------------------------------------
-- Tabelas de domínio da academia: policies padrão por recurso
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
      'create policy %I on public.%I for select to authenticated using (public.has_permission(academy_id, %L))',
      t.tbl || '_perm_select', t.tbl, t.recurso || '.ver');

    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.has_permission(academy_id, %L))',
      t.tbl || '_perm_insert', t.tbl, t.recurso || '.criar');

    execute format(
      'create policy %I on public.%I for update to authenticated
         using (public.has_permission(academy_id, %L) or public.has_permission(academy_id, %L))
         with check (public.has_permission(academy_id, %L) or public.has_permission(academy_id, %L))',
      t.tbl || '_perm_update', t.tbl,
      t.recurso || '.editar', t.recurso || '.excluir',
      t.recurso || '.editar', t.recurso || '.excluir');

    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_super_admin())',
      t.tbl || '_super_delete', t.tbl);
  end loop;
end $$;

-- Itens de treino podem ser removidos fisicamente por quem edita treinos
drop policy if exists workout_exercises_perm_delete on public.workout_exercises;
create policy workout_exercises_perm_delete on public.workout_exercises for delete to authenticated
  using (public.has_permission(academy_id, 'treinos.editar'));

-- Dados de referência visíveis para qualquer membro da academia (inclusive alunos)
drop policy if exists units_member_select on public.units;
create policy units_member_select on public.units for select to authenticated
  using (public.is_member(academy_id));

drop policy if exists plans_member_select on public.plans;
create policy plans_member_select on public.plans for select to authenticated
  using (public.is_member(academy_id));

drop policy if exists exercises_member_select on public.exercises;
create policy exercises_member_select on public.exercises for select to authenticated
  using (public.is_member(academy_id));

drop policy if exists classes_member_select on public.classes;
create policy classes_member_select on public.classes for select to authenticated
  using (public.is_member(academy_id));

-- Aluno: somente os próprios registros
drop policy if exists students_own_select on public.students;
create policy students_own_select on public.students for select to authenticated
  using (profile_id in (select id from public.profiles where user_id = auth.uid()));

drop policy if exists workouts_own_select on public.workouts;
create policy workouts_own_select on public.workouts for select to authenticated
  using (student_id in (select public.my_student_ids()));

drop policy if exists workout_exercises_own_select on public.workout_exercises;
create policy workout_exercises_own_select on public.workout_exercises for select to authenticated
  using (workout_id in (
    select id from public.workouts where student_id in (select public.my_student_ids())
  ));

drop policy if exists workout_logs_own_select on public.workout_logs;
create policy workout_logs_own_select on public.workout_logs for select to authenticated
  using (student_id in (select public.my_student_ids()));

drop policy if exists workout_logs_own_insert on public.workout_logs;
create policy workout_logs_own_insert on public.workout_logs for insert to authenticated
  with check (
    student_id in (select public.my_student_ids())
    and public.is_member(academy_id)
    and workout_id in (select id from public.workouts where student_id in (select public.my_student_ids()))
  );

drop policy if exists class_bookings_own_select on public.class_bookings;
create policy class_bookings_own_select on public.class_bookings for select to authenticated
  using (student_id in (select public.my_student_ids()));

drop policy if exists payments_own_select on public.payments;
create policy payments_own_select on public.payments for select to authenticated
  using (student_id in (select public.my_student_ids()) and deleted_at is null);

-- ---------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_super_admin()
    or public.is_staff(academy_id)
  );

-- Inserção somente via RPC (create_student / create_staff / create_academy)

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (
    user_id = auth.uid()
    or public.has_permission(academy_id, 'alunos.editar')
    or public.has_permission(academy_id, 'equipe.editar')
  )
  with check (
    user_id = auth.uid()
    or public.has_permission(academy_id, 'alunos.editar')
    or public.has_permission(academy_id, 'equipe.editar')
  );

drop policy if exists profiles_super_delete on public.profiles;
create policy profiles_super_delete on public.profiles for delete to authenticated
  using (public.is_super_admin());

-- ---------------------------------------------------------------------
-- Perfis de acesso (roles) e permissões
-- ---------------------------------------------------------------------
drop policy if exists permissions_select on public.permissions;
create policy permissions_select on public.permissions for select to authenticated using (true);

drop policy if exists permissions_super_all on public.permissions;
create policy permissions_super_all on public.permissions for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists roles_select on public.roles;
create policy roles_select on public.roles for select to authenticated
  using (public.is_member(academy_id) or public.is_super_admin());

drop policy if exists roles_insert on public.roles;
create policy roles_insert on public.roles for insert to authenticated
  with check (public.has_permission(academy_id, 'perfis.criar') and not is_system);

drop policy if exists roles_update on public.roles;
create policy roles_update on public.roles for update to authenticated
  using (public.has_permission(academy_id, 'perfis.editar') or public.has_permission(academy_id, 'perfis.excluir'))
  with check (public.has_permission(academy_id, 'perfis.editar') or public.has_permission(academy_id, 'perfis.excluir'));

drop policy if exists role_permissions_select on public.role_permissions;
create policy role_permissions_select on public.role_permissions for select to authenticated
  using (exists (
    select 1 from public.roles r
     where r.id = role_id and (public.is_member(r.academy_id) or public.is_super_admin())
  ));

-- O perfil "admin" sempre tem tudo: suas permissões não são editáveis
drop policy if exists role_permissions_insert on public.role_permissions;
create policy role_permissions_insert on public.role_permissions for insert to authenticated
  with check (exists (
    select 1 from public.roles r
     where r.id = role_id and coalesce(r.slug, '') <> 'admin'
       and public.has_permission(r.academy_id, 'perfis.editar')
  ));

drop policy if exists role_permissions_delete on public.role_permissions;
create policy role_permissions_delete on public.role_permissions for delete to authenticated
  using (exists (
    select 1 from public.roles r
     where r.id = role_id and coalesce(r.slug, '') <> 'admin'
       and public.has_permission(r.academy_id, 'perfis.editar')
  ));

drop policy if exists user_roles_select on public.user_roles;
create policy user_roles_select on public.user_roles for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_staff(academy_id)
    or public.is_super_admin()
  );

-- Somente administradores atribuem/removem o perfil "admin"
drop policy if exists user_roles_insert on public.user_roles;
create policy user_roles_insert on public.user_roles for insert to authenticated
  with check (
    public.has_permission(academy_id, 'equipe.editar')
    and (
      public.is_super_admin() or public.is_academy_admin(academy_id)
      or not exists (select 1 from public.roles r where r.id = role_id and r.slug = 'admin')
    )
  );

drop policy if exists user_roles_delete on public.user_roles;
create policy user_roles_delete on public.user_roles for delete to authenticated
  using (
    public.has_permission(academy_id, 'equipe.editar')
    and (
      public.is_super_admin() or public.is_academy_admin(academy_id)
      or not exists (select 1 from public.roles r where r.id = role_id and r.slug = 'admin')
    )
  );

-- ---------------------------------------------------------------------
-- Globais (SaaS)
-- ---------------------------------------------------------------------
drop policy if exists saas_plans_select on public.saas_plans;
create policy saas_plans_select on public.saas_plans for select to authenticated using (true);

drop policy if exists saas_plans_super_all on public.saas_plans;
create policy saas_plans_super_all on public.saas_plans for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists academies_select on public.academies;
create policy academies_select on public.academies for select to authenticated
  using (public.is_super_admin() or public.is_member(id));

drop policy if exists academies_super_all on public.academies;
create policy academies_super_all on public.academies for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists super_admins_select on public.super_admins;
create policy super_admins_select on public.super_admins for select to authenticated
  using (user_id = auth.uid() or public.is_super_admin());

drop policy if exists super_admins_super_all on public.super_admins;
create policy super_admins_super_all on public.super_admins for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists saas_invoices_select on public.saas_invoices;
create policy saas_invoices_select on public.saas_invoices for select to authenticated
  using (public.is_super_admin() or public.is_academy_admin(academy_id));

drop policy if exists saas_invoices_super_all on public.saas_invoices;
create policy saas_invoices_super_all on public.saas_invoices for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists saas_settings_super_all on public.saas_settings;
create policy saas_settings_super_all on public.saas_settings for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ---------------------------------------------------------------------
-- Auditoria / logs: leitura por permissão; escrita apenas via trigger/RPC
-- ---------------------------------------------------------------------
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (public.is_super_admin() or (academy_id is not null and public.has_permission(academy_id, 'auditoria.ver')));

drop policy if exists access_logs_select on public.access_logs;
create policy access_logs_select on public.access_logs for select to authenticated
  using (public.is_super_admin() or (academy_id is not null and public.has_permission(academy_id, 'auditoria.ver')));

drop policy if exists errors_select on public.errors;
create policy errors_select on public.errors for select to authenticated
  using (public.is_super_admin() or (academy_id is not null and public.has_permission(academy_id, 'auditoria.ver')));

-- ---------------------------------------------------------------------
-- Personalização do recibo: membros leem (aluno precisa para ver o recibo),
-- quem tem financeiro.editar altera
-- ---------------------------------------------------------------------
drop policy if exists receipt_settings_select on public.receipt_settings;
create policy receipt_settings_select on public.receipt_settings for select to authenticated
  using (public.is_member(academy_id) or public.is_super_admin());

drop policy if exists receipt_settings_insert on public.receipt_settings;
create policy receipt_settings_insert on public.receipt_settings for insert to authenticated
  with check (public.has_permission(academy_id, 'financeiro.editar'));

drop policy if exists receipt_settings_update on public.receipt_settings;
create policy receipt_settings_update on public.receipt_settings for update to authenticated
  using (public.has_permission(academy_id, 'financeiro.editar'))
  with check (public.has_permission(academy_id, 'financeiro.editar'));

-- ---------------------------------------------------------------------
-- Storage: academy-assets/{academy_id}/arquivo (logo do recibo)
-- ---------------------------------------------------------------------
drop policy if exists academy_assets_public_read on storage.objects;
create policy academy_assets_public_read on storage.objects for select
  using (bucket_id = 'academy-assets');

drop policy if exists academy_assets_insert on storage.objects;
create policy academy_assets_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'academy-assets'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and public.has_permission(((storage.foldername(name))[1])::uuid, 'financeiro.editar'));

drop policy if exists academy_assets_update on storage.objects;
create policy academy_assets_update on storage.objects for update to authenticated
  using (bucket_id = 'academy-assets'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and public.has_permission(((storage.foldername(name))[1])::uuid, 'financeiro.editar'));

drop policy if exists academy_assets_delete on storage.objects;
create policy academy_assets_delete on storage.objects for delete to authenticated
  using (bucket_id = 'academy-assets'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and public.has_permission(((storage.foldername(name))[1])::uuid, 'financeiro.editar'));

-- ---------------------------------------------------------------------
-- Storage: avatars/{user_id}/arquivo
-- ---------------------------------------------------------------------
drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists avatars_own_insert on storage.objects;
create policy avatars_own_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_own_update on storage.objects;
create policy avatars_own_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_own_delete on storage.objects;
create policy avatars_own_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
