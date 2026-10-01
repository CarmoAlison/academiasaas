-- =====================================================================
-- Migração 008 — Regras de negócio
--   • academy_settings: configurações da academia (tolerância de atraso, bloqueio…)
--   • Limite de alunos ativos do plano SaaS aplicado no banco + academy_usage()
--   • Validade do plano: students.plano_valido_ate, período em cada pagamento,
--     renovação automática ao quitar e generate_plan_charges() (cobranças de renovação)
--   • Inadimplência automática (X dias de tolerância) e bloqueio de reservas
--   • Mesmo CPF como aluno e equipe na mesma academia (create_student/create_staff
--     reaproveitam o cadastro) + remove_student/remove_staff que não apagam o outro acesso
--   • staff_names(): aluno vê o nome do professor (só o nome)
-- Pode ser executada mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Configurações da academia
-- ---------------------------------------------------------------------
create table if not exists public.academy_settings (
  academy_id                     uuid primary key references public.academies(id) on delete cascade,
  dias_tolerancia                integer not null default 5 check (dias_tolerancia between 0 and 90),
  bloquear_reservas_inadimplente boolean not null default true,
  updated_at                     timestamptz not null default now()
);
alter table public.academy_settings enable row level security;

drop policy if exists academy_settings_select on public.academy_settings;
create policy academy_settings_select on public.academy_settings for select to authenticated
  using (academy_id in (select public.my_member_academies()) or (select public.is_super_admin()));

drop policy if exists academy_settings_insert on public.academy_settings;
create policy academy_settings_insert on public.academy_settings for insert to authenticated
  with check (academy_id in (select public.my_admin_academies()));

drop policy if exists academy_settings_update on public.academy_settings;
create policy academy_settings_update on public.academy_settings for update to authenticated
  using (academy_id in (select public.my_admin_academies()))
  with check (academy_id in (select public.my_admin_academies()));

grant all on public.academy_settings to authenticated;

drop trigger if exists academy_settings_updated_at on public.academy_settings;
create trigger academy_settings_updated_at before update on public.academy_settings
  for each row execute function public.set_updated_at();
drop trigger if exists academy_settings_audit on public.academy_settings;
create trigger academy_settings_audit after insert or update or delete on public.academy_settings
  for each row execute function public.audit_trigger();

/** Configurações da academia em JSON ('{}' se nunca configurou — cada uso aplica o seu padrão) */
create or replace function public._academy_cfg(p_academy uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select to_jsonb(s) from public.academy_settings s where s.academy_id = p_academy), '{}'::jsonb);
$$;

create or replace function public._academy_tolerancia(p_academy uuid)
returns integer
language sql stable security definer set search_path = public as $$
  select coalesce((public._academy_cfg(p_academy) ->> 'dias_tolerancia')::int, 5);
$$;

-- ---------------------------------------------------------------------
-- Inadimplência: pagamento pendente vencido há mais que a tolerância
-- ---------------------------------------------------------------------
create or replace function public.is_inadimplente(p_student uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.payments pa
      join public.students s on s.id = pa.student_id
     where pa.student_id = p_student
       and pa.deleted_at is null
       and pa.status = 'pendente'
       and pa.vencimento < public._today() - public._academy_tolerancia(s.academy_id)
  );
$$;

-- ---------------------------------------------------------------------
-- Limite de alunos ativos do plano SaaS
-- ---------------------------------------------------------------------
create or replace function public.academy_usage(p_academy uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ativos', (select count(*) from public.students
                where academy_id = p_academy and deleted_at is null and status = 'ativo'),
    'limite', sp.limite_alunos,
    'plano', sp.nome
  )
  from public.academies a
  left join public.saas_plans sp on sp.id = a.saas_plan_id
  where a.id = p_academy
    and (public.is_member(p_academy) or public.is_super_admin());
$$;

create or replace function public.check_student_limit()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_limite integer;
  v_plano  text;
  v_ativos integer;
begin
  if new.status <> 'ativo' or new.deleted_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'ativo' and old.deleted_at is null then
    return new; -- já contava como ativo
  end if;
  if public.is_super_admin() then
    return new; -- Super Admin pode exceder (ajustes manuais)
  end if;

  select sp.limite_alunos, sp.nome into v_limite, v_plano
    from public.academies a join public.saas_plans sp on sp.id = a.saas_plan_id
   where a.id = new.academy_id;
  if v_limite is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('limite:' || new.academy_id::text));
  select count(*) into v_ativos from public.students
   where academy_id = new.academy_id and deleted_at is null and status = 'ativo' and id <> new.id;
  if v_ativos >= v_limite then
    raise exception 'Limite de % alunos ativos do plano % atingido. Fale com o suporte para mudar de plano.', v_limite, v_plano
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists students_limit on public.students;
create trigger students_limit before insert or update of status, deleted_at on public.students
  for each row execute function public.check_student_limit();

-- ---------------------------------------------------------------------
-- Validade do plano e renovação automática ao quitar
-- ---------------------------------------------------------------------
alter table public.students add column if not exists plano_valido_ate date;
alter table public.payments add column if not exists periodo_inicio date;
alter table public.payments add column if not exists periodo_fim date;

create or replace function public.payment_plan_period()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_meses    integer;
  v_validade date;
  v_inicio   date;
  v_today    date := public._today();
begin
  -- quitado agora (com plano): calcula o período coberto e estende a validade
  if new.status = 'pago' and new.plan_id is not null and new.deleted_at is null
     and (tg_op = 'INSERT' or old.status is distinct from 'pago') then
    select duracao_meses into v_meses from public.plans where id = new.plan_id;
    select plano_valido_ate into v_validade from public.students where id = new.student_id;
    -- continua de onde a validade parou (se não venceu há mais de 30 dias); senão, começa no vencimento/hoje
    v_inicio := case when v_validade is not null and v_validade >= v_today - 30 then v_validade + 1
                     else least(new.vencimento, v_today) end;
    new.periodo_inicio := v_inicio;
    new.periodo_fim := (v_inicio + make_interval(months => coalesce(v_meses, 1)))::date - 1;
    update public.students
       set plano_valido_ate = greatest(coalesce(plano_valido_ate, new.periodo_fim), new.periodo_fim)
     where id = new.student_id;

  -- desfeito (reaberto/cancelado/excluído): devolve a validade se era o último período
  elsif tg_op = 'UPDATE' and old.status = 'pago' and old.periodo_fim is not null
        and (new.status <> 'pago' or new.deleted_at is not null) then
    update public.students
       set plano_valido_ate = case when old.periodo_inicio is null then null else old.periodo_inicio - 1 end
     where id = old.student_id and plano_valido_ate = old.periodo_fim;
    new.periodo_inicio := null;
    new.periodo_fim := null;
  end if;
  return new;
end $$;

drop trigger if exists payments_plan_period on public.payments;
create trigger payments_plan_period before insert or update on public.payments
  for each row execute function public.payment_plan_period();

-- Validade inicial para quem já tinha pagamentos quitados (só quando ainda vazia)
update public.students s
   set plano_valido_ate = x.fim
  from (
    select distinct on (pa.student_id) pa.student_id,
           ((pa.vencimento + make_interval(months => coalesce(pl.duracao_meses, 1)))::date - 1) fim
      from public.payments pa
      left join public.plans pl on pl.id = pa.plan_id
     where pa.status = 'pago' and pa.deleted_at is null and pa.plan_id is not null
     order by pa.student_id, pa.vencimento desc
  ) x
 where s.id = x.student_id and s.plano_valido_ate is null;

/**
 * Gera as cobranças de renovação: alunos ativos com plano cuja validade termina
 * até p_ate (ou sem validade) e que ainda não têm cobrança pendente do plano.
 * Vencimento = dia seguinte ao fim da validade (ou hoje). Retorna quantas criou.
 */
create or replace function public.generate_plan_charges(p_academy uuid, p_ate date)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  if not public.has_permission(p_academy, 'financeiro.criar') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  insert into public.payments (academy_id, student_id, plan_id, descricao, valor, vencimento, status)
  select s.academy_id, s.id, pl.id,
         case when pl.duracao_meses > 1 then 'Renovação · ' || pl.nome else 'Mensalidade' end,
         pl.valor,
         greatest(coalesce(s.plano_valido_ate + 1, public._today()), public._today() - 30),
         'pendente'
    from public.students s
    join public.plans pl on pl.id = s.plan_id and pl.deleted_at is null
   where s.academy_id = p_academy
     and s.deleted_at is null and s.status = 'ativo'
     and (s.plano_valido_ate is null or s.plano_valido_ate <= p_ate)
     and not exists (
       select 1 from public.payments pa
        where pa.student_id = s.id and pa.deleted_at is null and pa.status = 'pendente'
     );
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ---------------------------------------------------------------------
-- Reserva de aula: bloqueia inadimplente (se configurado)
-- ---------------------------------------------------------------------
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

  if coalesce((public._academy_cfg(v_class.academy_id) ->> 'bloquear_reservas_inadimplente')::boolean, true)
     and public.is_inadimplente(v_student) then
    raise exception 'Reservas bloqueadas: há mensalidade em atraso. Procure a recepção para regularizar.';
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

-- ---------------------------------------------------------------------
-- Dashboard: inadimplentes respeitam a tolerância configurada
-- ---------------------------------------------------------------------
create or replace function public.admin_dashboard(p_academy uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := public._today();
  v_mes   date := date_trunc('month', public._today())::date;
  v_tol   integer := public._academy_tolerancia(p_academy);
begin
  if not public.has_permission(p_academy, 'dashboard.ver') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'alunos_ativos', (select count(*) from public.students
                       where academy_id = p_academy and deleted_at is null and status = 'ativo'),
    'inadimplentes', (select count(distinct student_id) from public.payments
                       where academy_id = p_academy and deleted_at is null and status = 'pendente'
                         and vencimento < v_today - v_tol),
    'tolerancia', v_tol,
    'planos_vencendo', (select count(*) from public.students
                         where academy_id = p_academy and deleted_at is null and status = 'ativo'
                           and plano_valido_ate between v_today and v_today + 7),
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

-- ---------------------------------------------------------------------
-- Mesmo CPF como aluno e equipe na mesma academia
-- ---------------------------------------------------------------------
create or replace function public.create_student(p_academy uuid, p_profile jsonb, p_student jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_role    uuid;
  v_profile public.profiles;
  v_student uuid;
  v_cpf     text := p_profile ->> 'cpf';
begin
  if not public.has_permission(p_academy, 'alunos.criar') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  select id into v_role from public.roles where academy_id = p_academy and slug = 'aluno' and deleted_at is null;
  select * into v_profile from public.profiles where academy_id = p_academy and cpf = v_cpf and deleted_at is null;

  if v_profile.id is null then
    v_profile.id := public._create_member(
      p_academy, p_profile ->> 'nome', v_cpf,
      nullif(p_profile ->> 'telefone', ''), nullif(p_profile ->> 'email_contato', ''), v_role
    );
  else
    -- CPF já cadastrado nesta academia (ex.: instrutor que também treina): reaproveita o cadastro
    if exists (select 1 from public.students where profile_id = v_profile.id and deleted_at is null) then
      raise exception 'Este CPF já está cadastrado como aluno nesta academia' using errcode = '23505';
    end if;
    insert into public.user_roles (user_id, role_id, academy_id) values (v_profile.user_id, v_role, p_academy)
    on conflict do nothing;
    update public.profiles set status = 'ativo' where id = v_profile.id;
  end if;

  insert into public.students (
    academy_id, profile_id, unit_id, plan_id, data_matricula, status, data_nascimento,
    responsavel, endereco, cidade, estado, cep, observacoes
  ) values (
    p_academy, v_profile.id,
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
declare
  v_profile public.profiles;
begin
  if not public.has_permission(p_academy, 'equipe.criar') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if not exists (select 1 from public.roles where id = p_role_id and academy_id = p_academy and deleted_at is null and coalesce(slug, '') <> 'aluno') then
    raise exception 'Perfil de acesso inválido' using errcode = '22023';
  end if;
  if (select slug from public.roles where id = p_role_id) = 'admin'
     and not (public.is_super_admin() or public.is_academy_admin(p_academy)) then
    raise exception 'Apenas administradores podem criar outros administradores' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where academy_id = p_academy and cpf = p_cpf and deleted_at is null;
  if v_profile.id is null then
    return public._create_member(p_academy, p_nome, p_cpf, nullif(p_telefone, ''), nullif(p_email, ''), p_role_id);
  end if;

  -- CPF já cadastrado (ex.: aluno que vai trabalhar na academia): adiciona o perfil de equipe
  if exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
              where ur.user_id = v_profile.user_id and ur.academy_id = p_academy and coalesce(r.slug, '') <> 'aluno'
                and r.deleted_at is null) then
    raise exception 'Este CPF já faz parte da equipe desta academia' using errcode = '23505';
  end if;
  insert into public.user_roles (user_id, role_id, academy_id) values (v_profile.user_id, p_role_id, p_academy)
  on conflict do nothing;
  update public.profiles set status = 'ativo' where id = v_profile.id;
  return v_profile.id;
end $$;

/** Remove o aluno; se a pessoa também é da equipe, mantém o acesso de equipe */
create or replace function public.remove_student(p_student uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_s public.students;
  v_p public.profiles;
begin
  select * into v_s from public.students where id = p_student and deleted_at is null;
  if v_s.id is null then
    raise exception 'Aluno não encontrado';
  end if;
  if not public.has_permission(v_s.academy_id, 'alunos.excluir') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  select * into v_p from public.profiles where id = v_s.profile_id;

  update public.students set deleted_at = now(), status = 'inativo' where id = p_student;
  delete from public.user_roles ur using public.roles r
   where r.id = ur.role_id and ur.user_id = v_p.user_id and ur.academy_id = v_s.academy_id and r.slug = 'aluno';

  if not exists (select 1 from public.user_roles where user_id = v_p.user_id and academy_id = v_s.academy_id) then
    update public.profiles set deleted_at = now(), status = 'inativo' where id = v_p.id;
  end if;
end $$;

/** Remove da equipe; se a pessoa também é aluna, mantém o acesso de aluno */
create or replace function public.remove_staff(p_profile uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_p public.profiles;
begin
  select * into v_p from public.profiles where id = p_profile and deleted_at is null;
  if v_p.id is null then
    raise exception 'Usuário não encontrado';
  end if;
  if not public.has_permission(v_p.academy_id, 'equipe.excluir') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
              where ur.user_id = v_p.user_id and ur.academy_id = v_p.academy_id and r.slug = 'admin')
     and not (public.is_super_admin() or public.is_academy_admin(v_p.academy_id)) then
    raise exception 'Apenas administradores podem remover outro administrador' using errcode = '42501';
  end if;

  delete from public.user_roles ur using public.roles r
   where r.id = ur.role_id and ur.user_id = v_p.user_id and ur.academy_id = v_p.academy_id
     and coalesce(r.slug, '') <> 'aluno';

  if not exists (select 1 from public.students where profile_id = v_p.id and deleted_at is null) then
    update public.profiles set deleted_at = now(), status = 'inativo' where id = v_p.id;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Nome do professor para o aluno (somente o nome de quem é da equipe)
-- ---------------------------------------------------------------------
create or replace function public.staff_names(p_ids uuid[])
returns table (id uuid, nome text)
language sql stable security definer set search_path = public as $$
  select p.id, p.nome
    from public.profiles p
   where p.id = any (p_ids)
     and p.deleted_at is null
     and p.academy_id in (select public.my_member_academies())
     and exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
                  where ur.user_id = p.user_id and ur.academy_id = p.academy_id and coalesce(r.slug, '') <> 'aluno');
$$;

-- ---------------------------------------------------------------------
-- Views atualizadas: validade do plano e inadimplência
-- ---------------------------------------------------------------------
drop view if exists public.v_students;
create view public.v_students with (security_invoker = true) as
select
  s.id, s.academy_id, s.profile_id, s.unit_id, s.plan_id, s.status, s.data_matricula, s.created_at,
  s.plano_valido_ate,
  p.nome, p.cpf, p.telefone, p.email_contato, p.avatar_url,
  pl.nome as plano_nome, u.nome as unidade_nome,
  public.is_inadimplente(s.id) as inadimplente,
  exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
           where ur.user_id = p.user_id and ur.academy_id = s.academy_id and coalesce(r.slug, '') <> 'aluno'
             and r.deleted_at is null) as tambem_equipe
from public.students s
join public.profiles p on p.id = s.profile_id
left join public.plans pl on pl.id = s.plan_id
left join public.units u on u.id = s.unit_id
where s.deleted_at is null;
grant select on public.v_students to authenticated;

notify pgrst, 'reload schema';
