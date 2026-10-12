-- =====================================================================
-- Migração 023 — Uma ficha de treino por aluno
--   • O banco recusa criar uma segunda ficha para o mesmo aluno
--     (vale também para restaurar uma ficha da lixeira quando o aluno já tem outra).
--     Para mudar o treino, edita-se a ficha existente.
--   • Fichas que já existem em duplicidade NÃO são alteradas; a regra vale daqui
--     para frente.
--   • O nome da ficha deixa de ser pedido na tela (fica "Treino da semana").
-- Requer a 022. Pode ser executada mais de uma vez.
-- =====================================================================

create or replace function public.check_one_workout()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- excluída não conta
  if new.deleted_at is not null then
    return new;
  end if;
  -- voltando junto com o aluno restaurado da lixeira: volta como estava
  if coalesce(current_setting('app.lixeira_cascata', true), '') = 'on'
     and exists (select 1 from public.lixeira where tipo = 'aluno' and registro_id = new.student_id) then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.deleted_at is null and old.student_id = new.student_id then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('ficha:' || new.student_id::text));
  if exists (select 1 from public.workouts where student_id = new.student_id and deleted_at is null and id <> new.id) then
    raise exception 'Este aluno já tem uma ficha de treino. Abra a ficha dele para alterar os exercícios.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists workouts_one_per_student on public.workouts;
create trigger workouts_one_per_student before insert or update of student_id, deleted_at on public.workouts
  for each row execute function public.check_one_workout();

-- nome padrão quando a tela não envia
alter table public.workouts alter column nome set default 'Treino da semana';

notify pgrst, 'reload schema';
