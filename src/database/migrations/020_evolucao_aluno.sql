-- =====================================================================
-- Migração 020 — Evolução do aluno
--   • exercise_logs: o aluno marca cada exercício do dia e anota a carga usada
--     (gráfico de evolução por exercício)
--   • students.meta_semanal: meta de treinos por semana escolhida pelo aluno
--   • my_progress(): semanas treinadas (sequência), totais de check-ins e treinos (conquistas)
-- Requer a 019. Pode ser executada mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Registro por exercício (um por exercício da ficha por dia)
-- ---------------------------------------------------------------------
create table if not exists public.exercise_logs (
  id                  uuid primary key default gen_random_uuid(),
  academy_id          uuid not null references public.academies(id),
  student_id          uuid not null references public.students(id),
  workout_id          uuid not null references public.workouts(id) on delete cascade,
  workout_exercise_id uuid not null references public.workout_exercises(id) on delete cascade,
  exercise_id         uuid not null references public.exercises(id),
  data                date not null default public._today(),
  feito               boolean not null default false,
  carga               numeric(6,2) check (carga is null or (carga >= 0 and carga <= 2000)),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint exercise_logs_item_data_uk unique (workout_exercise_id, data)
);
create index if not exists exercise_logs_student_idx on public.exercise_logs (student_id, exercise_id, data desc);
alter table public.exercise_logs enable row level security;

/** Consistência: o exercício é da ficha e a ficha é do aluno/academia informados */
create or replace function public.check_exercise_log()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_item public.workout_exercises;
  v_w    public.workouts;
begin
  select * into v_item from public.workout_exercises where id = new.workout_exercise_id;
  select * into v_w from public.workouts where id = v_item.workout_id;
  if v_item.id is null or v_w.id is null or v_w.deleted_at is not null then
    raise exception 'Exercício não encontrado na ficha';
  end if;
  new.workout_id := v_w.id;
  new.student_id := v_w.student_id;
  new.academy_id := v_w.academy_id;
  new.exercise_id := v_item.exercise_id;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists exercise_logs_check on public.exercise_logs;
create trigger exercise_logs_check before insert or update on public.exercise_logs
  for each row execute function public.check_exercise_log();

drop trigger if exists exercise_logs_modulo on public.exercise_logs;
create trigger exercise_logs_modulo before insert on public.exercise_logs
  for each row execute function public.check_module_insert('treinos');

-- aluno: o próprio registro
drop policy if exists exercise_logs_own on public.exercise_logs;
create policy exercise_logs_own on public.exercise_logs for all to authenticated
  using (student_id in (select public.my_student_ids()))
  with check (student_id in (select public.my_student_ids()) and public.is_member(academy_id));

-- equipe: leitura (professor acompanha a evolução)
drop policy if exists exercise_logs_staff_select on public.exercise_logs;
create policy exercise_logs_staff_select on public.exercise_logs for select to authenticated
  using (academy_id in (select public.academies_with_permission('treinos.ver')));

-- módulo de treinos desligado: tabela inacessível para a academia
drop policy if exists exercise_logs_modulo on public.exercise_logs;
create policy exercise_logs_modulo on public.exercise_logs as restrictive for all to authenticated
  using ((select public.is_super_admin()) or academy_id in (select public.academies_with_module('treinos')))
  with check ((select public.is_super_admin()) or academy_id in (select public.academies_with_module('treinos')));

grant select, insert, update, delete on public.exercise_logs to authenticated;

-- ---------------------------------------------------------------------
-- Meta semanal do aluno
-- ---------------------------------------------------------------------
alter table public.students add column if not exists meta_semanal smallint;
alter table public.students drop constraint if exists students_meta_semanal_check;
alter table public.students add constraint students_meta_semanal_check check (meta_semanal is null or meta_semanal between 1 and 7);

/** O aluno define a própria meta de treinos por semana */
create or replace function public.set_my_weekly_goal(p_student uuid, p_meta integer)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_student not in (select public.my_student_ids()) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if p_meta is not null and (p_meta < 1 or p_meta > 7) then
    raise exception 'A meta deve ser de 1 a 7 treinos por semana';
  end if;
  update public.students set meta_semanal = p_meta where id = p_student;
end $$;

-- ---------------------------------------------------------------------
-- Progresso: dias treinados por semana (check-in ou treino concluído) e totais
-- ---------------------------------------------------------------------
create or replace function public.my_progress(p_student uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_s     public.students;
  v_today date := public._today();
  v_ini   date := (date_trunc('week', public._today()) - interval '51 weeks')::date;
begin
  select * into v_s from public.students where id = p_student and deleted_at is null;
  if v_s.id is null
     or not (p_student in (select public.my_student_ids()) or public.has_permission(v_s.academy_id, 'alunos.ver')) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'meta_semanal', coalesce(v_s.meta_semanal, 3),
    'total_checkins', (select count(*) from public.checkins where student_id = p_student),
    'total_treinos', (select count(*) from public.workout_logs where student_id = p_student),
    'semanas', (
      select coalesce(jsonb_agg(jsonb_build_object('inicio', w.inicio, 'dias', w.dias) order by w.inicio), '[]'::jsonb)
        from (
          select date_trunc('week', d)::date as inicio, count(distinct d)::int as dias
            from (
              select (c.created_at at time zone 'America/Sao_Paulo')::date as d
                from public.checkins c where c.student_id = p_student
              union
              select (l.concluido_em at time zone 'America/Sao_Paulo')::date
                from public.workout_logs l where l.student_id = p_student
            ) x
           where d >= v_ini and d <= v_today
           group by 1
        ) w
    )
  );
end $$;

notify pgrst, 'reload schema';
