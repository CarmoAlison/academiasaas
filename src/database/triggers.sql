-- =====================================================================
-- SaaS Academia — TRIGGERS
-- Executar depois de rls.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'saas_plans', 'academies', 'profiles', 'roles', 'units', 'plans', 'students',
    'exercises', 'workouts', 'classes', 'class_bookings', 'payments', 'receipt_settings'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t || '_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_updated_at', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Auditoria: INSERT / UPDATE / DELETE em tabelas sensíveis → audit_logs
-- ---------------------------------------------------------------------
create or replace function public.audit_trigger()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old     jsonb;
  v_new     jsonb;
  v_acao    text := lower(tg_op);
  v_academy uuid;
  v_reg     text;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new); end if;

  if tg_op = 'UPDATE' then
    -- ignora updates sem mudança real (além de updated_at)
    if (v_old - 'updated_at') = (v_new - 'updated_at') then
      return new;
    end if;
    if v_old ->> 'deleted_at' is null and v_new ->> 'deleted_at' is not null then
      v_acao := 'soft_delete';
    end if;
  end if;

  if tg_table_name = 'academies' then
    -- DELETE físico: a academia já não existe (FK de audit_logs → academies)
    v_academy := case when tg_op = 'DELETE' then null else (v_new ->> 'id')::uuid end;
  elsif tg_table_name = 'role_permissions' then
    select academy_id into v_academy from public.roles
     where id = coalesce(v_new ->> 'role_id', v_old ->> 'role_id')::uuid;
  else
    v_academy := nullif(coalesce(v_new ->> 'academy_id', v_old ->> 'academy_id'), '')::uuid;
  end if;

  v_reg := coalesce(
    v_new ->> 'id', v_old ->> 'id',
    coalesce(v_new ->> 'role_id', v_old ->> 'role_id') || ':' ||
      coalesce(v_new ->> 'permission_id', v_new ->> 'user_id', v_old ->> 'permission_id', v_old ->> 'user_id')
  );

  insert into public.audit_logs (academy_id, user_id, user_nome, acao, tabela, registro_id, dados_antes, dados_depois, ip)
  values (v_academy, auth.uid(), public._user_nome(v_academy), v_acao, tg_table_name, v_reg, v_old, v_new, public._client_ip());

  return coalesce(new, old);
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'saas_plans', 'academies', 'super_admins', 'saas_invoices', 'saas_settings',
    'profiles', 'roles', 'role_permissions', 'user_roles',
    'units', 'plans', 'students', 'exercises', 'workouts', 'workout_exercises',
    'classes', 'class_bookings', 'payments', 'receipt_settings'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_trigger()',
      t || '_audit', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Perfis padrão ao criar academia: Admin, Instrutor, Recepção, Aluno
-- ---------------------------------------------------------------------
create or replace function public.academy_default_roles()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_admin    uuid;
  v_recepcao uuid;
begin
  insert into public.roles (academy_id, nome, descricao, slug, is_system)
  values (new.id, 'Admin', 'Acesso total à academia', 'admin', true)
  returning id into v_admin;

  insert into public.roles (academy_id, nome, descricao, slug, is_system)
  values (new.id, 'Instrutor', 'Sem permissões por padrão — libere no gerenciamento de perfil', 'instrutor', true);

  insert into public.roles (academy_id, nome, descricao, slug, is_system)
  values (new.id, 'Recepção', 'Atendimento, matrículas e recebimentos', 'recepcao', true)
  returning id into v_recepcao;

  insert into public.roles (academy_id, nome, descricao, slug, is_system)
  values (new.id, 'Aluno', 'Acesso à área do aluno (somente os próprios dados)', 'aluno', true);

  insert into public.role_permissions (role_id, permission_id)
  select v_admin, id from public.permissions;

  insert into public.role_permissions (role_id, permission_id)
  select v_recepcao, id from public.permissions
   where recurso || '.' || acao in (
     'dashboard.ver',
     'alunos.ver', 'alunos.criar', 'alunos.editar',
     'planos.ver', 'unidades.ver', 'aulas.ver',
     'financeiro.ver', 'financeiro.criar', 'financeiro.editar'
   );

  return new;
end $$;

drop trigger if exists academies_default_roles on public.academies;
create trigger academies_default_roles
  after insert on public.academies
  for each row execute function public.academy_default_roles();

-- Perfis do sistema não podem ser renomeados nem excluídos
create or replace function public.protect_system_roles()
returns trigger language plpgsql as $$
begin
  if old.is_system and not public.is_super_admin() then
    if new.slug is distinct from old.slug
       or new.is_system is distinct from old.is_system
       or new.deleted_at is distinct from old.deleted_at
       or new.nome is distinct from old.nome then
      raise exception 'Perfis do sistema não podem ser renomeados ou excluídos' using errcode = '42501';
    end if;
  end if;
  if new.academy_id is distinct from old.academy_id then
    raise exception 'Não é permitido mover perfis entre academias' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists roles_protect_system on public.roles;
create trigger roles_protect_system
  before update on public.roles
  for each row execute function public.protect_system_roles();

-- ---------------------------------------------------------------------
-- Proteção de colunas do profile (usuário editando o próprio perfil)
-- ---------------------------------------------------------------------
create or replace function public.protect_profile_columns()
returns trigger language plpgsql as $$
begin
  if public.is_super_admin() then
    return new;
  end if;

  if new.academy_id is distinct from old.academy_id
     or new.user_id is distinct from old.user_id
     or new.email_fake is distinct from old.email_fake then
    raise exception 'Alteração não permitida' using errcode = '42501';
  end if;

  -- CPF é a chave de login: não pode ser alterado pela interface
  new.cpf := old.cpf;

  if not (public.has_permission(old.academy_id, 'alunos.editar') or public.has_permission(old.academy_id, 'equipe.editar')) then
    new.status := old.status;
    new.deleted_at := old.deleted_at;
    if new.must_change_password = true then
      new.must_change_password := old.must_change_password;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists profiles_protect_columns on public.profiles;
create trigger profiles_protect_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- ---------------------------------------------------------------------
-- Consistência multi-tenant: registros filhos precisam pertencer à mesma academia
-- ---------------------------------------------------------------------
create or replace function public.check_same_academy()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'students' then
    if new.plan_id is not null and not exists (select 1 from public.plans where id = new.plan_id and academy_id = new.academy_id) then
      raise exception 'Plano não pertence à academia';
    end if;
    if new.unit_id is not null and not exists (select 1 from public.units where id = new.unit_id and academy_id = new.academy_id) then
      raise exception 'Unidade não pertence à academia';
    end if;
    if not exists (select 1 from public.profiles where id = new.profile_id and academy_id = new.academy_id) then
      raise exception 'Perfil não pertence à academia';
    end if;
  elsif tg_table_name in ('workouts', 'payments') then
    if not exists (select 1 from public.students where id = new.student_id and academy_id = new.academy_id) then
      raise exception 'Aluno não pertence à academia';
    end if;
  elsif tg_table_name = 'workout_exercises' then
    if not exists (select 1 from public.workouts where id = new.workout_id and academy_id = new.academy_id)
       or not exists (select 1 from public.exercises where id = new.exercise_id and academy_id = new.academy_id) then
      raise exception 'Treino/exercício não pertence à academia';
    end if;
  elsif tg_table_name = 'classes' then
    if new.unit_id is not null and not exists (select 1 from public.units where id = new.unit_id and academy_id = new.academy_id) then
      raise exception 'Unidade não pertence à academia';
    end if;
  end if;
  return new;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['students', 'workouts', 'payments', 'workout_exercises', 'classes'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_same_academy', t);
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function public.check_same_academy()',
      t || '_same_academy', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Recibo: numeração sequencial por academia + quem recebeu, ao quitar
-- ---------------------------------------------------------------------
create or replace function public.payment_receipt()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pago' then
    if new.pago_em is null then
      new.pago_em := now();
    end if;
    if tg_op = 'INSERT' or old.status is distinct from 'pago' then
      new.recebido_por := coalesce(public._user_nome(new.academy_id), new.recebido_por);
    end if;
    if new.recibo_numero is null then
      perform pg_advisory_xact_lock(hashtext('recibo:' || new.academy_id::text));
      select coalesce(max(recibo_numero), 0) + 1 into new.recibo_numero
        from public.payments where academy_id = new.academy_id;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists payments_receipt on public.payments;
create trigger payments_receipt
  before insert or update on public.payments
  for each row execute function public.payment_receipt();