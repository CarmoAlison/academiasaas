-- =====================================================================
-- Migração 005 — Treino semanal (ficha com dias da semana)
--   • workout_days: dias da ficha (dia_semana 0=dom … 6=sáb; null = treino antigo sem dia fixo)
--   • workout_exercises.day_id: exercício pertence a um dia
--   • workout_logs.day_id: conclusão por dia (o aluno marca cada dia da semana)
--   • RPC save_workout: grava ficha + dias + exercícios em uma única transação
-- Treinos existentes viram uma ficha de 1 dia ("Treino"). Pode ser executada mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------
create table if not exists public.workout_days (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null references public.academies(id),
  workout_id  uuid not null references public.workouts(id) on delete cascade,
  dia_semana  smallint check (dia_semana between 0 and 6),
  nome        text,                -- foco do dia, ex.: "Peito e tríceps"
  ordem       integer not null default 0,
  created_at  timestamptz not null default now()
);
create unique index if not exists workout_days_workout_dia_uk on public.workout_days (workout_id, dia_semana)
  where dia_semana is not null;
create index if not exists workout_days_workout_idx on public.workout_days (workout_id, ordem);

alter table public.workout_exercises add column if not exists day_id uuid references public.workout_days(id) on delete cascade;
create index if not exists workout_exercises_day_idx on public.workout_exercises (day_id, ordem);

alter table public.workout_logs add column if not exists day_id uuid references public.workout_days(id) on delete set null;
create index if not exists workout_logs_day_idx on public.workout_logs (student_id, day_id, concluido_em desc);

-- Treinos antigos: exercícios sem dia → um dia "Treino" (sem dia da semana fixo)
with w as (
  select distinct workout_id, academy_id from public.workout_exercises where day_id is null
), d as (
  insert into public.workout_days (academy_id, workout_id, nome, ordem)
  select academy_id, workout_id, 'Treino', 0 from w
  returning id, workout_id
)
update public.workout_exercises we set day_id = d.id from d where we.workout_id = d.workout_id and we.day_id is null;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.workout_days enable row level security;

drop policy if exists workout_days_perm_select on public.workout_days;
create policy workout_days_perm_select on public.workout_days for select to authenticated
  using (public.has_permission(academy_id, 'treinos.ver'));

drop policy if exists workout_days_own_select on public.workout_days;
create policy workout_days_own_select on public.workout_days for select to authenticated
  using (workout_id in (select id from public.workouts where student_id in (select public.my_student_ids())));

drop policy if exists workout_days_perm_insert on public.workout_days;
create policy workout_days_perm_insert on public.workout_days for insert to authenticated
  with check (public.has_permission(academy_id, 'treinos.criar'));

drop policy if exists workout_days_perm_update on public.workout_days;
create policy workout_days_perm_update on public.workout_days for update to authenticated
  using (public.has_permission(academy_id, 'treinos.editar'))
  with check (public.has_permission(academy_id, 'treinos.editar'));

drop policy if exists workout_days_perm_delete on public.workout_days;
create policy workout_days_perm_delete on public.workout_days for delete to authenticated
  using (public.has_permission(academy_id, 'treinos.editar'));

-- Aluno registra a conclusão de um dia da própria ficha…
drop policy if exists workout_logs_own_insert on public.workout_logs;
create policy workout_logs_own_insert on public.workout_logs for insert to authenticated
  with check (
    student_id in (select public.my_student_ids())
    and public.is_member(academy_id)
    and workout_id in (select id from public.workouts where student_id in (select public.my_student_ids()))
    and (day_id is null or day_id in (select id from public.workout_days where workout_id = workout_logs.workout_id))
  );

-- …e pode desfazer (desmarcar)
drop policy if exists workout_logs_own_delete on public.workout_logs;
create policy workout_logs_own_delete on public.workout_logs for delete to authenticated
  using (student_id in (select public.my_student_ids()));

grant all on public.workout_days to authenticated;

-- ---------------------------------------------------------------------
-- Consistência: dia pertence à academia do treino; exercício ao mesmo treino do dia
-- ---------------------------------------------------------------------
create or replace function public.check_workout_day()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'workout_days' then
    if not exists (select 1 from public.workouts where id = new.workout_id and academy_id = new.academy_id) then
      raise exception 'Treino não pertence à academia';
    end if;
  elsif new.day_id is not null
     and not exists (select 1 from public.workout_days where id = new.day_id and workout_id = new.workout_id) then
    raise exception 'Dia não pertence ao treino';
  end if;
  return new;
end $$;

drop trigger if exists workout_days_check on public.workout_days;
create trigger workout_days_check before insert or update on public.workout_days
  for each row execute function public.check_workout_day();

drop trigger if exists workout_exercises_day_check on public.workout_exercises;
create trigger workout_exercises_day_check before insert or update on public.workout_exercises
  for each row execute function public.check_workout_day();

drop trigger if exists workout_days_audit on public.workout_days;
create trigger workout_days_audit after insert or update or delete on public.workout_days
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------
-- save_workout: ficha + dias + exercícios em um único lançamento (transação)
-- p_workout: { student_id, professor_id, nome, objetivo, data_inicio, data_fim, ativo }
-- p_days:    [ { id?, dia_semana, nome, items: [ { exercise_id, series, repeticoes, carga, descanso } ] } ]
-- Dias existentes (com id) são mantidos → as marcações de "concluído" da semana não se perdem.
-- ---------------------------------------------------------------------
create or replace function public.save_workout(p_academy uuid, p_workout_id uuid, p_workout jsonb, p_days jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id     uuid := p_workout_id;
  v_day    jsonb;
  v_day_id uuid;
  v_keep   uuid[] := '{}';
  v_ordem  integer := 0;
  v_item   jsonb;
  v_iordem integer;
begin
  if coalesce(jsonb_array_length(p_days), 0) = 0 then
    raise exception 'Adicione ao menos um dia de treino';
  end if;

  if v_id is null then
    if not public.has_permission(p_academy, 'treinos.criar') then
      raise exception 'Acesso negado' using errcode = '42501';
    end if;
    insert into public.workouts (academy_id, student_id, professor_id, nome, objetivo, data_inicio, data_fim, ativo)
    values (
      p_academy, (p_workout ->> 'student_id')::uuid, nullif(p_workout ->> 'professor_id', '')::uuid,
      p_workout ->> 'nome', nullif(p_workout ->> 'objetivo', ''),
      nullif(p_workout ->> 'data_inicio', '')::date, nullif(p_workout ->> 'data_fim', '')::date,
      coalesce((p_workout ->> 'ativo')::boolean, true)
    ) returning id into v_id;
  else
    if not public.has_permission(p_academy, 'treinos.editar') then
      raise exception 'Acesso negado' using errcode = '42501';
    end if;
    if not exists (select 1 from public.workouts where id = v_id and academy_id = p_academy and deleted_at is null) then
      raise exception 'Treino não encontrado';
    end if;
    update public.workouts set
      professor_id = nullif(p_workout ->> 'professor_id', '')::uuid,
      nome         = p_workout ->> 'nome',
      objetivo     = nullif(p_workout ->> 'objetivo', ''),
      data_inicio  = nullif(p_workout ->> 'data_inicio', '')::date,
      data_fim     = nullif(p_workout ->> 'data_fim', '')::date,
      ativo        = coalesce((p_workout ->> 'ativo')::boolean, true)
    where id = v_id;
    -- libera os dias da semana para permitir trocas (ex.: seg ↔ ter) sem violar o índice único
    update public.workout_days set dia_semana = null where workout_id = v_id;
  end if;

  for v_day in select * from jsonb_array_elements(p_days) loop
    v_day_id := nullif(v_day ->> 'id', '')::uuid;
    if v_day_id is not null and exists (select 1 from public.workout_days where id = v_day_id and workout_id = v_id) then
      update public.workout_days
         set dia_semana = nullif(v_day ->> 'dia_semana', '')::smallint, nome = nullif(v_day ->> 'nome', ''), ordem = v_ordem
       where id = v_day_id;
      delete from public.workout_exercises where day_id = v_day_id;
    else
      insert into public.workout_days (academy_id, workout_id, dia_semana, nome, ordem)
      values (p_academy, v_id, nullif(v_day ->> 'dia_semana', '')::smallint, nullif(v_day ->> 'nome', ''), v_ordem)
      returning id into v_day_id;
    end if;
    v_keep := v_keep || v_day_id;

    v_iordem := 0;
    for v_item in select * from jsonb_array_elements(coalesce(v_day -> 'items', '[]'::jsonb)) loop
      if nullif(v_item ->> 'exercise_id', '') is null then
        continue;
      end if;
      insert into public.workout_exercises (academy_id, workout_id, day_id, exercise_id, series, repeticoes, carga, descanso, ordem)
      values (
        p_academy, v_id, v_day_id, (v_item ->> 'exercise_id')::uuid,
        nullif(v_item ->> 'series', '')::integer, nullif(v_item ->> 'repeticoes', ''),
        nullif(v_item ->> 'carga', ''), nullif(v_item ->> 'descanso', ''), v_iordem
      );
      v_iordem := v_iordem + 1;
    end loop;
    if v_iordem = 0 then
      raise exception 'Cada dia de treino precisa de ao menos um exercício';
    end if;

    v_ordem := v_ordem + 1;
  end loop;

  delete from public.workout_days where workout_id = v_id and not (id = any (v_keep));
  delete from public.workout_exercises where workout_id = v_id and day_id is null;

  return v_id;
end $$;

notify pgrst, 'reload schema';
