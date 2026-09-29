-- =====================================================================
-- SaaS Academia — FUNÇÕES (helpers de RLS + RPCs de negócio)
-- Executar depois de schema.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helpers internos
-- ---------------------------------------------------------------------

create or replace function public._today()
returns date language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

create or replace function public._client_ip()
returns text language plpgsql stable as $$
declare
  v_headers json;
begin
  v_headers := nullif(current_setting('request.headers', true), '')::json;
  if v_headers is null then
    return null;
  end if;
  return coalesce(
    nullif(trim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), ''),
    v_headers ->> 'cf-connecting-ip',
    v_headers ->> 'x-real-ip'
  );
end $$;

create or replace function public._cpf_email(p_cpf text)
returns text language sql immutable as $$
  select p_cpf || '@academia.internal';
$$;

-- ---------------------------------------------------------------------
-- Helpers de autorização (usados nas policies)
-- ---------------------------------------------------------------------

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.super_admins where user_id = auth.uid());
$$;

-- Usuário ativo numa academia ativa
create or replace function public.is_member(p_academy uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.profiles p
      join public.academies a on a.id = p.academy_id
     where p.user_id = auth.uid()
       and p.academy_id = p_academy
       and p.deleted_at is null
       and p.status = 'ativo'
       and a.deleted_at is null
       and a.status = 'ativa'
  );
$$;

create or replace function public.is_academy_admin(p_academy uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_member(p_academy) and exists (
    select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id and r.deleted_at is null
     where ur.user_id = auth.uid()
       and ur.academy_id = p_academy
       and r.slug = 'admin'
  );
$$;

-- Membro da equipe (qualquer perfil que não seja "aluno")
create or replace function public.is_staff(p_academy uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_member(p_academy) and exists (
    select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id and r.deleted_at is null
     where ur.user_id = auth.uid()
       and ur.academy_id = p_academy
       and coalesce(r.slug, '') <> 'aluno'
  );
$$;

-- Permissão granular "recurso.acao"
create or replace function public.has_permission(p_academy uuid, p_perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin()
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

-- IDs de aluno do usuário logado (em todas as academias)
create or replace function public.my_student_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select s.id
    from public.students s
    join public.profiles p on p.id = s.profile_id
   where p.user_id = auth.uid()
     and p.deleted_at is null
     and s.deleted_at is null;
$$;

create or replace function public._user_nome(p_academy uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select nome from public.profiles where user_id = auth.uid() and academy_id = p_academy and deleted_at is null limit 1),
    (select nome from public.super_admins where user_id = auth.uid()),
    (select nome from public.profiles where user_id = auth.uid() and deleted_at is null limit 1)
  );
$$;

-- ---------------------------------------------------------------------
-- Criação de usuário no Supabase Auth (login por CPF)
-- e-mail fake: {cpf}@academia.internal · senha padrão: 6 primeiros dígitos do CPF
-- A mesma pessoa (CPF) usa um único usuário Auth, com um profile por academia.
-- ---------------------------------------------------------------------

create or replace function public._ensure_auth_user(p_cpf text, p_nome text default null)
returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_id    uuid;
  v_email text := public._cpf_email(p_cpf);
begin
  if p_cpf is null or p_cpf !~ '^\d{11}$' then
    raise exception 'CPF inválido' using errcode = '22023';
  end if;

  select id into v_id from auth.users where email = v_email;
  if v_id is not null then
    return v_id;
  end if;

  v_id := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    crypt(left(p_cpf, 6), gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('nome', p_nome, 'cpf', p_cpf),
    now(), now(), '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  return v_id;
end $$;

create or replace function public._set_default_password(p_user_id uuid, p_cpf text)
returns void
language plpgsql security definer set search_path = public, auth, extensions as $$
begin
  update auth.users
     set encrypted_password = crypt(left(p_cpf, 6), gen_salt('bf')),
         updated_at = now()
   where id = p_user_id;
  update public.profiles set must_change_password = true where user_id = p_user_id;
  update public.super_admins set must_change_password = true where user_id = p_user_id;
end $$;

-- Cria profile + vínculo de perfil (role) numa academia
create or replace function public._create_member(
  p_academy uuid, p_nome text, p_cpf text, p_telefone text, p_email text, p_role_id uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user    uuid;
  v_profile uuid;
begin
  if exists (select 1 from public.profiles where academy_id = p_academy and cpf = p_cpf and deleted_at is null) then
    raise exception 'Já existe um usuário com este CPF nesta academia' using errcode = '23505';
  end if;

  v_user := public._ensure_auth_user(p_cpf, p_nome);

  insert into public.profiles (user_id, academy_id, nome, cpf, email_fake, telefone, email_contato)
  values (v_user, p_academy, p_nome, p_cpf, public._cpf_email(p_cpf), p_telefone, p_email)
  returning id into v_profile;

  if p_role_id is not null then
    insert into public.user_roles (user_id, role_id, academy_id)
    values (v_user, p_role_id, p_academy)
    on conflict do nothing;
  end if;

  return v_profile;
end $$;

-- ---------------------------------------------------------------------
-- Academias
-- ---------------------------------------------------------------------

create or replace function public._create_academy(
  p_nome text, p_cnpj text, p_saas_plan_id uuid,
  p_admin_nome text, p_admin_cpf text, p_admin_telefone text default null,
  p_unidade_nome text default 'Unidade Principal'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_academy uuid;
  v_role    uuid;
  v_valor   numeric;
begin
  insert into public.academies (nome, cnpj, saas_plan_id)
  values (p_nome, nullif(p_cnpj, ''), p_saas_plan_id)
  returning id into v_academy;
  -- perfis padrão são criados pelo trigger academies_default_roles

  insert into public.units (academy_id, nome)
  values (v_academy, coalesce(nullif(p_unidade_nome, ''), 'Unidade Principal'));

  select id into v_role from public.roles where academy_id = v_academy and slug = 'admin';
  perform public._create_member(v_academy, p_admin_nome, p_admin_cpf, p_admin_telefone, null, v_role);

  select valor into v_valor from public.saas_plans where id = p_saas_plan_id;
  if v_valor is not null then
    insert into public.saas_invoices (academy_id, saas_plan_id, valor, competencia, vencimento)
    values (v_academy, p_saas_plan_id, v_valor, date_trunc('month', public._today())::date, public._today() + 10);
  end if;

  return v_academy;
end $$;

create or replace function public.create_academy(
  p_nome text, p_cnpj text, p_saas_plan_id uuid,
  p_admin_nome text, p_admin_cpf text, p_admin_telefone text default null,
  p_unidade_nome text default 'Unidade Principal'
) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  return public._create_academy(p_nome, p_cnpj, p_saas_plan_id, p_admin_nome, p_admin_cpf, p_admin_telefone, p_unidade_nome);
end $$;

-- Gera as faturas SaaS do mês para todas as academias ativas
create or replace function public.generate_saas_invoices(p_competencia date default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_comp  date := date_trunc('month', coalesce(p_competencia, public._today()))::date;
  v_count integer;
begin
  if not public.is_super_admin() then
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

-- ---------------------------------------------------------------------
-- Usuários
-- ---------------------------------------------------------------------

create or replace function public.create_student(p_academy uuid, p_profile jsonb, p_student jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_role    uuid;
  v_profile uuid;
  v_student uuid;
begin
  if not public.has_permission(p_academy, 'alunos.criar') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  select id into v_role from public.roles where academy_id = p_academy and slug = 'aluno' and deleted_at is null;

  v_profile := public._create_member(
    p_academy, p_profile ->> 'nome', p_profile ->> 'cpf',
    nullif(p_profile ->> 'telefone', ''), nullif(p_profile ->> 'email_contato', ''), v_role
  );

  insert into public.students (
    academy_id, profile_id, unit_id, plan_id, data_matricula, status, data_nascimento,
    responsavel, endereco, cidade, estado, cep, observacoes
  ) values (
    p_academy, v_profile,
    nullif(p_student ->> 'unit_id', '')::uuid,
    nullif(p_student ->> 'plan_id', '')::uuid,
    coalesce(nullif(p_student ->> 'data_matricula', '')::date, public._today()),
    coalesce(nullif(p_student ->> 'status', ''), 'ativo'),
    nullif(p_student ->> 'data_nascimento', '')::date,
    nullif(p_student ->> 'responsavel', ''),
    nullif(p_student ->> 'endereco', ''),
    nullif(p_student ->> 'cidade', ''),
    nullif(p_student ->> 'estado', ''),
    nullif(p_student ->> 'cep', ''),
    nullif(p_student ->> 'observacoes', '')
  ) returning id into v_student;

  return v_student;
end $$;

create or replace function public.create_staff(
  p_academy uuid, p_nome text, p_cpf text, p_telefone text, p_email text, p_role_id uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission(p_academy, 'equipe.criar') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if not exists (select 1 from public.roles where id = p_role_id and academy_id = p_academy and deleted_at is null) then
    raise exception 'Perfil de acesso inválido' using errcode = '22023';
  end if;
  if (select slug from public.roles where id = p_role_id) = 'admin'
     and not (public.is_super_admin() or public.is_academy_admin(p_academy)) then
    raise exception 'Apenas administradores podem criar outros administradores' using errcode = '42501';
  end if;
  return public._create_member(p_academy, p_nome, p_cpf, nullif(p_telefone, ''), nullif(p_email, ''), p_role_id);
end $$;

-- Reset de senha pelo admin: volta para os 6 primeiros dígitos do CPF.
-- Obs.: como o usuário Auth é único por CPF, a senha é redefinida em todas as academias.
create or replace function public.reset_password(p_profile_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_is_student boolean;
begin
  select * into v_profile from public.profiles where id = p_profile_id;
  if v_profile.id is null then
    raise exception 'Usuário não encontrado';
  end if;

  v_is_student := exists (select 1 from public.students where profile_id = p_profile_id);

  if not (
    public.is_super_admin()
    or (v_is_student and public.has_permission(v_profile.academy_id, 'alunos.editar'))
    or (not v_is_student and public.has_permission(v_profile.academy_id, 'equipe.editar'))
  ) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  perform public._set_default_password(v_profile.user_id, v_profile.cpf);
end $$;

create or replace function public.create_super_admin(p_nome text, p_cpf text, p_email text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_id   uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  v_user := public._ensure_auth_user(p_cpf, p_nome);
  insert into public.super_admins (user_id, nome, cpf, email)
  values (v_user, p_nome, p_cpf, nullif(p_email, ''))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.reset_super_admin_password(p_super_admin_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_sa public.super_admins;
begin
  if not public.is_super_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  select * into v_sa from public.super_admins where id = p_super_admin_id;
  perform public._set_default_password(v_sa.user_id, v_sa.cpf);
end $$;

create or replace function public.mark_password_changed()
returns void
language sql security definer set search_path = public as $$
  update public.profiles set must_change_password = false where user_id = auth.uid();
  update public.super_admins set must_change_password = false where user_id = auth.uid();
$$;

-- Contexto completo do usuário logado (usado pelo AuthContext)
create or replace function public.get_my_context()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'user_id', auth.uid(),
    'super_admin', (select to_jsonb(sa) from public.super_admins sa where sa.user_id = auth.uid()),
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'academy_id', a.id,
        'academy_nome', a.nome,
        'academy_status', a.status,
        'academy_logo', a.logo_url,
        'profile', to_jsonb(p),
        'student_id', (select s.id from public.students s where s.profile_id = p.id and s.deleted_at is null),
        'roles', coalesce((
          select jsonb_agg(jsonb_build_object('id', r.id, 'nome', r.nome, 'slug', r.slug))
            from public.user_roles ur
            join public.roles r on r.id = ur.role_id and r.deleted_at is null
           where ur.user_id = p.user_id and ur.academy_id = p.academy_id
        ), '[]'::jsonb),
        'permissions', coalesce((
          select jsonb_agg(distinct pe.recurso || '.' || pe.acao)
            from public.user_roles ur
            join public.roles r on r.id = ur.role_id and r.deleted_at is null
            join public.role_permissions rp on rp.role_id = ur.role_id
            join public.permissions pe on pe.id = rp.permission_id
           where ur.user_id = p.user_id and ur.academy_id = p.academy_id
        ), '[]'::jsonb)
      ) order by a.nome)
      from public.profiles p
      join public.academies a on a.id = p.academy_id and a.deleted_at is null
      where p.user_id = auth.uid() and p.deleted_at is null and p.status = 'ativo'
    ), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------
-- Logs
-- ---------------------------------------------------------------------

create or replace function public.log_access(p_academy uuid, p_evento text, p_user_agent text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return;
  end if;
  if p_academy is not null and not (public.is_member(p_academy) or public.is_super_admin()) then
    p_academy := null;
  end if;
  insert into public.access_logs (academy_id, user_id, user_nome, evento, ip, user_agent)
  values (p_academy, auth.uid(), public._user_nome(p_academy), p_evento, public._client_ip(), left(p_user_agent, 500));
end $$;

create or replace function public.log_error(
  p_academy uuid, p_mensagem text, p_stack text default null, p_rota text default null, p_user_agent text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_academy is not null and not (public.is_member(p_academy) or public.is_super_admin()) then
    p_academy := null;
  end if;
  insert into public.errors (academy_id, user_id, user_nome, mensagem, stack, rota, user_agent)
  values (
    p_academy, auth.uid(), case when auth.uid() is not null then public._user_nome(p_academy) end,
    left(coalesce(p_mensagem, 'Erro desconhecido'), 2000), left(p_stack, 8000), left(p_rota, 500), left(p_user_agent, 500)
  );
end $$;

-- ---------------------------------------------------------------------
-- Aulas / reservas
-- ---------------------------------------------------------------------

create or replace function public.class_occupancy(p_academy uuid, p_inicio date, p_fim date)
returns table (class_id uuid, data date, total bigint)
language sql stable security definer set search_path = public as $$
  select b.class_id, b.data, count(*)
    from public.class_bookings b
   where b.academy_id = p_academy
     and b.data between p_inicio and p_fim
     and b.status in ('reservado', 'presente')
     and (public.is_member(p_academy) or public.is_super_admin())
   group by b.class_id, b.data;
$$;

create or replace function public.book_class(p_class_id uuid, p_data date)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_class   public.classes;
  v_student uuid;
  v_total   integer;
  v_id      uuid;
begin
  select * into v_class from public.classes where id = p_class_id and deleted_at is null and ativo;
  if v_class.id is null then
    raise exception 'Aula não encontrada';
  end if;

  select s.id into v_student
    from public.students s
    join public.profiles p on p.id = s.profile_id
   where p.user_id = auth.uid() and s.academy_id = v_class.academy_id
     and s.deleted_at is null and s.status = 'ativo';
  if v_student is null or not public.is_member(v_class.academy_id) then
    raise exception 'Apenas alunos ativos podem reservar aulas' using errcode = '42501';
  end if;

  if p_data < public._today() then
    raise exception 'Não é possível reservar datas passadas';
  end if;
  if not (extract(dow from p_data)::smallint = any (v_class.dias_semana)) then
    raise exception 'Esta aula não acontece nesse dia';
  end if;

  perform 1 from public.classes where id = p_class_id for update;
  select count(*) into v_total
    from public.class_bookings
   where class_id = p_class_id and data = p_data and status in ('reservado', 'presente');
  if v_total >= v_class.capacidade then
    raise exception 'Aula lotada';
  end if;

  insert into public.class_bookings (academy_id, class_id, student_id, data, status)
  values (v_class.academy_id, p_class_id, v_student, p_data, 'reservado')
  on conflict (class_id, student_id, data) do update set status = 'reservado', updated_at = now()
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.cancel_booking(p_booking_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_booking public.class_bookings;
begin
  select * into v_booking from public.class_bookings where id = p_booking_id;
  if v_booking.id is null then
    raise exception 'Reserva não encontrada';
  end if;
  if not (
    v_booking.student_id in (select public.my_student_ids())
    or public.has_permission(v_booking.academy_id, 'aulas.editar')
  ) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  update public.class_bookings set status = 'cancelado', updated_at = now() where id = p_booking_id;
end $$;

-- ---------------------------------------------------------------------
-- Dashboards
-- ---------------------------------------------------------------------

create or replace function public.admin_dashboard(p_academy uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := public._today();
  v_mes   date := date_trunc('month', public._today())::date;
begin
  if not public.has_permission(p_academy, 'dashboard.ver') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'alunos_ativos', (select count(*) from public.students
                       where academy_id = p_academy and deleted_at is null and status = 'ativo'),
    'inadimplentes', (select count(distinct student_id) from public.payments
                       where academy_id = p_academy and deleted_at is null and status = 'pendente' and vencimento < v_today),
    'aulas_hoje', (select count(*) from public.classes
                    where academy_id = p_academy and deleted_at is null and ativo
                      and extract(dow from v_today)::smallint = any (dias_semana)),
    'novos_mes', (select count(*) from public.students
                   where academy_id = p_academy and deleted_at is null and data_matricula >= v_mes),
    'receita_mes', (select coalesce(sum(valor), 0) from public.payments
                     where academy_id = p_academy and deleted_at is null and status = 'pago' and pago_em >= v_mes),
    'mensal', (
      select jsonb_agg(jsonb_build_object(
        'mes', to_char(m, 'YYYY-MM'),
        'receita', (select coalesce(sum(valor), 0) from public.payments
                     where academy_id = p_academy and deleted_at is null and status = 'pago'
                       and pago_em >= m and pago_em < m + interval '1 month'),
        'matriculas', (select count(*) from public.students
                        where academy_id = p_academy and deleted_at is null
                          and data_matricula >= m and data_matricula < m + interval '1 month')
      ) order by m)
      from generate_series(v_mes - interval '5 months', v_mes, interval '1 month') m
    ),
    'alunos_por_status', (
      select coalesce(jsonb_agg(jsonb_build_object('status', status, 'total', total)), '[]'::jsonb)
        from (select status, count(*) total from public.students
               where academy_id = p_academy and deleted_at is null group by status) s
    )
  );
end $$;

create or replace function public.super_dashboard()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_mes date := date_trunc('month', public._today())::date;
begin
  if not public.is_super_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'total', (select count(*) from public.academies where deleted_at is null),
    'ativas', (select count(*) from public.academies where deleted_at is null and status = 'ativa'),
    'mrr', (select coalesce(sum(sp.valor), 0) from public.academies a
              join public.saas_plans sp on sp.id = a.saas_plan_id
             where a.deleted_at is null and a.status = 'ativa'),
    'inadimplentes', (select count(distinct academy_id) from public.saas_invoices
                       where status = 'pendente' and vencimento < public._today()),
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
  );
end $$;

-- ---------------------------------------------------------------------
-- Recibo: dados completos (aluno dono do pagamento ou quem tem financeiro.ver)
-- ---------------------------------------------------------------------

create or replace function public.get_receipt(p_payment_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_pay     public.payments;
  v_student public.students;
  v_unit    public.units;
begin
  select * into v_pay from public.payments where id = p_payment_id and deleted_at is null;
  if v_pay.id is null then
    raise exception 'Pagamento não encontrado';
  end if;

  if not (
    public.has_permission(v_pay.academy_id, 'financeiro.ver')
    or (public.is_member(v_pay.academy_id) and v_pay.student_id in (select public.my_student_ids()))
  ) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  if v_pay.status <> 'pago' then
    raise exception 'O recibo fica disponível após a confirmação do pagamento';
  end if;

  select * into v_student from public.students where id = v_pay.student_id;
  select * into v_unit from public.units where id = v_student.unit_id;
  if v_unit.id is null then
    select * into v_unit from public.units
     where academy_id = v_pay.academy_id and deleted_at is null
     order by ativo desc, created_at limit 1;
  end if;

  return jsonb_build_object(
    'pagamento', jsonb_build_object(
      'id', v_pay.id, 'numero', v_pay.recibo_numero, 'descricao', v_pay.descricao, 'valor', v_pay.valor,
      'vencimento', v_pay.vencimento, 'pago_em', v_pay.pago_em, 'forma_pagamento', v_pay.forma_pagamento,
      'recebido_por', v_pay.recebido_por
    ),
    'plano', (select jsonb_build_object('nome', nome, 'duracao_meses', duracao_meses) from public.plans where id = v_pay.plan_id),
    'aluno', (select jsonb_build_object('nome', nome, 'cpf', cpf, 'email', email_contato, 'telefone', telefone)
                from public.profiles where id = v_student.profile_id),
    'academia', (select jsonb_build_object('nome', nome, 'cnpj', cnpj, 'email', email, 'telefone', telefone, 'logo_url', logo_url)
                   from public.academies where id = v_pay.academy_id),
    'unidade', case when v_unit.id is null then null else jsonb_build_object(
      'nome', v_unit.nome, 'endereco', v_unit.endereco, 'cidade', v_unit.cidade, 'estado', v_unit.estado,
      'cep', v_unit.cep, 'telefone', v_unit.telefone) end,
    'config', (select to_jsonb(r) - 'academy_id' from public.receipt_settings r where r.academy_id = v_pay.academy_id)
  );
end $$;

-- ---------------------------------------------------------------------
-- Grants: funções internas (prefixo _) não ficam expostas via API
-- ---------------------------------------------------------------------
revoke execute on function public._ensure_auth_user(text, text) from public, anon, authenticated;
revoke execute on function public._set_default_password(uuid, text) from public, anon, authenticated;
revoke execute on function public._create_member(uuid, text, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public._create_academy(text, text, uuid, text, text, text, text) from public, anon, authenticated;
