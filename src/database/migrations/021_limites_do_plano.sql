-- =====================================================================
-- Migração 021 — Limites do plano valem para todos
--   • Limite de unidades e de alunos ativos agora também vale quando o
--     Super Admin está dentro da academia ("Acessar como admin").
--     Para liberar mais, troque o plano da academia ou aumente o limite do plano.
--   • academy_usage(): passa a informar também unidades e limite de unidades
-- Requer a 020. Pode ser executada mais de uma vez.
-- =====================================================================

create or replace function public.check_unit_limit()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_limite integer;
  v_plano  text;
begin
  if new.deleted_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.deleted_at is null then
    return new; -- já contava
  end if;
  select sp.limite_unidades, sp.nome into v_limite, v_plano
    from public.academies a join public.saas_plans sp on sp.id = a.saas_plan_id where a.id = new.academy_id;
  if v_limite is null then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('unidades:' || new.academy_id::text));
  if (select count(*) from public.units where academy_id = new.academy_id and deleted_at is null and id <> new.id) >= v_limite then
    raise exception 'O plano % permite até % unidade(s). Fale com o suporte para mudar de plano.', v_plano, v_limite
      using errcode = 'P0001';
  end if;
  return new;
end $$;

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

/** Uso do plano: alunos ativos e unidades x limites */
create or replace function public.academy_usage(p_academy uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ativos', (select count(*) from public.students
                where academy_id = p_academy and deleted_at is null and status = 'ativo'),
    'limite', sp.limite_alunos,
    'unidades', (select count(*) from public.units where academy_id = p_academy and deleted_at is null),
    'limite_unidades', sp.limite_unidades,
    'plano', sp.nome
  )
  from public.academies a
  left join public.saas_plans sp on sp.id = a.saas_plan_id
  where a.id = p_academy
    and (public.is_member(p_academy) or public.is_super_admin());
$$;

notify pgrst, 'reload schema';
