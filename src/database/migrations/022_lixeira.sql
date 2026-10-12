-- =====================================================================
-- Migração 022 — Lixeira geral
--   Vale para tudo que a academia exclui: mensalidades, alunos, equipe,
--   planos, unidades, exercícios, treinos, aulas e perfis de acesso.
--
--   • Ao excluir: o item some de todas as telas e deixa de contar em
--     qualquer total. Ele entra na lixeira (tabela public.lixeira), que só
--     a equipe do SaaS (Super Admin) vê.
--       - Aluno excluído leva junto as mensalidades e os treinos dele
--         (também deixam de contar) e cancela as reservas futuras de aulas.
--   • Restaurar (Super Admin, durante 15 dias): o item volta como estava,
--     com o que foi junto (mensalidades, treinos, perfis da equipe…).
--   • Após 15 dias o item é APAGADO DE VEZ, com tudo ligado a ele:
--       - aluno: mensalidades (inclusive pagas), recibos, contratos, check-ins,
--         reservas, treinos e registros de carga; a conta de login some se a
--         pessoa não tiver vínculo com outra academia
--       - plano/unidade: alunos e aulas que usavam ficam sem plano/unidade
--       - exercício: sai das fichas de treino
--       - equipe: deixa de aparecer como professor em treinos e aulas
--     A limpeza roda todo dia (pg_cron, quando disponível) e a cada exclusão.
--   • Itens que já estavam excluídos entram na lixeira com 15 dias contando
--     a partir de agora (nada é apagado ao rodar esta migração).
-- Requer a 021. Pode ser executada mais de uma vez.
-- =====================================================================

create table if not exists public.lixeira (
  id                uuid primary key default gen_random_uuid(),
  tipo              text not null check (tipo in ('mensalidade', 'aluno', 'equipe', 'plano', 'unidade', 'exercicio', 'treino', 'aula', 'perfil')),
  registro_id       uuid not null,
  academy_id        uuid not null references public.academies(id) on delete cascade,
  titulo            text,
  subtitulo         text,
  dependentes       jsonb not null default '{}'::jsonb,  -- o que foi junto (para restaurar)
  excluido_em       timestamptz not null default now(),
  excluido_por      uuid,
  excluido_por_nome text,
  constraint lixeira_item_uk unique (tipo, registro_id)
);
create index if not exists lixeira_data_idx on public.lixeira (excluido_em);
create index if not exists lixeira_academy_idx on public.lixeira (academy_id, excluido_em desc);
alter table public.lixeira enable row level security;

drop policy if exists lixeira_select on public.lixeira;
create policy lixeira_select on public.lixeira for select to authenticated
  using ((select public.is_super_admin()));
revoke all on public.lixeira from anon;
grant select on public.lixeira to authenticated;

/** Tipo da lixeira de cada tabela */
create or replace function public._lixeira_tipo(p_tabela text)
returns text language sql immutable as $$
  select case p_tabela
    when 'payments' then 'mensalidade' when 'students' then 'aluno' when 'profiles' then 'equipe'
    when 'plans' then 'plano' when 'units' then 'unidade' when 'exercises' then 'exercicio'
    when 'workouts' then 'treino' when 'classes' then 'aula' when 'roles' then 'perfil' end;
$$;

create or replace function public._brl(v numeric)
returns text language sql immutable as $$
  select 'R$ ' || replace(to_char(coalesce(v, 0), 'FM999999990.00'), '.', ',');
$$;

create or replace function public._nome_aluno(p_student uuid)
returns text language sql stable security definer set search_path = public as $$
  select pr.nome from public.students s join public.profiles pr on pr.id = s.profile_id where s.id = p_student;
$$;

/** Aluno indo para a lixeira: esconde mensalidades e treinos dele e cancela reservas futuras */
create or replace function public._lixeira_cascata_aluno(p_student uuid, p_quando timestamptz, p_status text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_pay jsonb;
  v_w   jsonb;
begin
  perform set_config('app.lixeira_cascata', 'on', true);

  select coalesce(jsonb_agg(id order by vencimento), '[]'::jsonb) into v_pay
    from public.payments where student_id = p_student and deleted_at is null;
  update public.payments set deleted_at = p_quando where student_id = p_student and deleted_at is null;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'ativo', ativo)), '[]'::jsonb) into v_w
    from public.workouts where student_id = p_student and deleted_at is null;
  update public.workouts set deleted_at = p_quando, ativo = false where student_id = p_student and deleted_at is null;

  update public.class_bookings set status = 'cancelado'
   where student_id = p_student and data >= public._today() and status in ('reservado', 'espera');

  perform set_config('app.lixeira_cascata', 'off', true);
  return jsonb_build_object('status', p_status, 'payments', v_pay, 'workouts', v_w);
end $$;
revoke execute on function public._lixeira_cascata_aluno(uuid, timestamptz, text) from public, anon, authenticated;

/** Registra na lixeira o que foi excluído (e tira de lá o que foi restaurado) */
create or replace function public.lixeira_track()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_tipo text := public._lixeira_tipo(tg_table_name);
  j      jsonb := to_jsonb(new);
  v_tit  text;
  v_sub  text;
  v_dep  jsonb := '{}'::jsonb;
begin
  if coalesce(current_setting('app.lixeira_cascata', true), '') = 'on' then
    return null;  -- itens que foram junto com outro (ex.: mensalidades do aluno)
  end if;

  if old.deleted_at is null and new.deleted_at is not null then
    -- perfil de quem é aluno: quem representa na lixeira é o aluno
    if tg_table_name = 'profiles' and exists (select 1 from public.students where profile_id = new.id) then
      return null;
    end if;

    case tg_table_name
      when 'payments' then
        v_tit := coalesce(j ->> 'descricao', 'Mensalidade') || ' · ' || coalesce(public._nome_aluno((j ->> 'student_id')::uuid), 'aluno');
        v_sub := public._brl((j ->> 'valor')::numeric) || ' · venc. ' || to_char((j ->> 'vencimento')::date, 'DD/MM/YYYY')
                 || ' · ' || coalesce(j ->> 'status', '');
        -- período que ela cobria (se paga): volta para a validade do plano ao restaurar
        v_dep := jsonb_build_object('periodo_inicio', to_jsonb(old) ->> 'periodo_inicio', 'periodo_fim', to_jsonb(old) ->> 'periodo_fim');
      when 'students' then
        v_tit := public._nome_aluno(new.id);
        v_sub := 'Aluno';
        v_dep := public._lixeira_cascata_aluno(new.id, new.deleted_at, j ->> 'status');
        -- a exclusão do aluno já marcou o status como inativo; guarda o anterior
        v_dep := jsonb_set(v_dep, '{status}', to_jsonb(coalesce(to_jsonb(old) ->> 'status', 'ativo')));
      when 'profiles' then
        v_tit := j ->> 'nome';
        v_sub := 'Equipe';
      when 'plans' then
        v_tit := j ->> 'nome';
        v_sub := 'Plano · ' || public._brl((j ->> 'valor')::numeric);
      when 'units' then
        v_tit := j ->> 'nome';
        v_sub := 'Unidade' || coalesce(' · ' || (j ->> 'cidade'), '');
      when 'exercises' then
        v_tit := j ->> 'nome';
        v_sub := 'Exercício' || coalesce(' · ' || (j ->> 'grupo_muscular'), '');
      when 'workouts' then
        v_tit := j ->> 'nome';
        v_sub := 'Treino de ' || coalesce(public._nome_aluno((j ->> 'student_id')::uuid), 'aluno');
        v_dep := jsonb_build_object('ativo', coalesce((to_jsonb(old) ->> 'ativo')::boolean, true));
      when 'classes' then
        v_tit := j ->> 'nome';
        v_sub := 'Aula' || coalesce(' · ' || left(j ->> 'horario', 5), '');
      when 'roles' then
        v_tit := j ->> 'nome';
        v_sub := 'Perfil de acesso';
    end case;

    insert into public.lixeira (tipo, registro_id, academy_id, titulo, subtitulo, dependentes, excluido_em, excluido_por, excluido_por_nome)
    values (v_tipo, new.id, (j ->> 'academy_id')::uuid, v_tit, v_sub, v_dep, new.deleted_at, auth.uid(),
            case when auth.uid() is null then null else public._user_nome((j ->> 'academy_id')::uuid) end)
    on conflict (tipo, registro_id) do update
      set excluido_em = excluded.excluido_em, excluido_por = excluded.excluido_por,
          excluido_por_nome = excluded.excluido_por_nome, dependentes = excluded.dependentes,
          titulo = excluded.titulo, subtitulo = excluded.subtitulo;

  elsif old.deleted_at is not null and new.deleted_at is null then
    delete from public.lixeira where tipo = v_tipo and registro_id = new.id;
  end if;
  return null;
end $$;

do $$
declare
  t text;
begin
  -- versão anterior desta migração (não executada em produção)
  execute 'drop trigger if exists payments_to_trash on public.payments';
  foreach t in array array['payments', 'students', 'profiles', 'plans', 'units', 'exercises', 'workouts', 'classes', 'roles'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_lixeira', t);
    execute format('create trigger %I after update of deleted_at on public.%I for each row execute function public.lixeira_track()', t || '_lixeira', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Exclusões feitas por funções do sistema
-- ---------------------------------------------------------------------

/** Exclui uma mensalidade (vai para a lixeira) */
create or replace function public.delete_payment(p_payment uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_academy uuid;
begin
  select academy_id into v_academy from public.payments where id = p_payment and deleted_at is null;
  if v_academy is null then
    raise exception 'Mensalidade não encontrada';
  end if;
  if not public.has_permission(v_academy, 'financeiro.excluir') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  update public.payments set deleted_at = now() where id = p_payment;
  perform public.purge_trash();
end $$;

/** Remove da equipe guardando os perfis de acesso (para poder restaurar) */
create or replace function public.remove_staff(p_profile uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_p     public.profiles;
  v_roles jsonb;
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

  select coalesce(jsonb_agg(ur.role_id), '[]'::jsonb) into v_roles
    from public.user_roles ur join public.roles r on r.id = ur.role_id
   where ur.user_id = v_p.user_id and ur.academy_id = v_p.academy_id and coalesce(r.slug, '') <> 'aluno';

  delete from public.user_roles ur using public.roles r
   where r.id = ur.role_id and ur.user_id = v_p.user_id and ur.academy_id = v_p.academy_id
     and coalesce(r.slug, '') <> 'aluno';

  if not exists (select 1 from public.students where profile_id = v_p.id and deleted_at is null) then
    update public.profiles set deleted_at = now(), status = 'inativo' where id = v_p.id;
    update public.lixeira set dependentes = jsonb_build_object('roles', v_roles)
     where tipo = 'equipe' and registro_id = v_p.id;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Restaurar (Super Admin)
-- ---------------------------------------------------------------------

/**
 * Devolve uma mensalidade exatamente como estava.
 * p_dep = período que ela cobria (exclusão avulsa de mensalidade paga): a validade do plano volta a cobri-lo.
 * Mensalidades que foram junto com o aluno não mexeram na validade, então nada a recalcular.
 */
create or replace function public._restore_payment(p_payment uuid, p_dep jsonb default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ini date := nullif(p_dep ->> 'periodo_inicio', '')::date;
  v_fim date := nullif(p_dep ->> 'periodo_fim', '')::date;
  v_p   public.payments;
begin
  update public.payments
     set deleted_at = null,
         periodo_inicio = coalesce(v_ini, periodo_inicio),
         periodo_fim = coalesce(v_fim, periodo_fim)
   where id = p_payment
  returning * into v_p;
  if v_p.id is not null and v_p.status = 'pago' and v_fim is not null then
    update public.students
       set plano_valido_ate = greatest(coalesce(plano_valido_ate, v_fim), v_fim)
     where id = v_p.student_id;
  end if;
end $$;
drop function if exists public._restore_payment(uuid);
revoke execute on function public._restore_payment(uuid, jsonb) from public, anon, authenticated;

/** Validade do plano pelas mensalidades (versão da 008) — não mexe em itens que vão/voltam junto com o aluno */
create or replace function public.payment_plan_period()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_meses    integer;
  v_validade date;
  v_inicio   date;
  v_today    date := public._today();
begin
  if coalesce(current_setting('app.lixeira_cascata', true), '') = 'on' then
    return new;
  end if;

  -- quitado agora (com plano): calcula o período coberto e estende a validade
  if new.status = 'pago' and new.plan_id is not null and new.deleted_at is null
     and (tg_op = 'INSERT' or old.status is distinct from 'pago') then
    select duracao_meses into v_meses from public.plans where id = new.plan_id;
    select plano_valido_ate into v_validade from public.students where id = new.student_id;
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

create or replace function public.restore_trash(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v       public.lixeira;
  v_prof  uuid;
  v_user  uuid;
  x       jsonb;
begin
  if not public.super_can('academias') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  select * into v from public.lixeira where id = p_id;
  if v.id is null then
    raise exception 'Item não encontrado na lixeira';
  end if;

  perform set_config('app.lixeira_cascata', 'on', true);
  case v.tipo
    when 'mensalidade' then
      perform public._restore_payment(v.registro_id, v.dependentes);
    when 'aluno' then
      update public.students set deleted_at = null, status = coalesce(v.dependentes ->> 'status', 'ativo')
       where id = v.registro_id returning profile_id into v_prof;
      update public.profiles set deleted_at = null, status = 'ativo' where id = v_prof returning user_id into v_user;
      insert into public.user_roles (user_id, role_id, academy_id)
      select v_user, r.id, r.academy_id from public.roles r
       where r.academy_id = v.academy_id and r.slug = 'aluno' and r.deleted_at is null
      on conflict do nothing;
      for x in select * from jsonb_array_elements(coalesce(v.dependentes -> 'payments', '[]'::jsonb)) loop
        perform public._restore_payment((x #>> '{}')::uuid);
      end loop;
      for x in select * from jsonb_array_elements(coalesce(v.dependentes -> 'workouts', '[]'::jsonb)) loop
        update public.workouts set deleted_at = null, ativo = coalesce((x ->> 'ativo')::boolean, true) where id = (x ->> 'id')::uuid;
      end loop;
    when 'equipe' then
      update public.profiles set deleted_at = null, status = 'ativo' where id = v.registro_id returning user_id into v_user;
      insert into public.user_roles (user_id, role_id, academy_id)
      select v_user, r.id, r.academy_id from public.roles r
       where r.id in (select (e #>> '{}')::uuid from jsonb_array_elements(coalesce(v.dependentes -> 'roles', '[]'::jsonb)) e)
         and r.deleted_at is null
      on conflict do nothing;
    when 'treino' then
      update public.workouts set deleted_at = null, ativo = coalesce((v.dependentes ->> 'ativo')::boolean, true) where id = v.registro_id;
    when 'plano' then update public.plans set deleted_at = null where id = v.registro_id;
    when 'unidade' then update public.units set deleted_at = null where id = v.registro_id;
    when 'exercicio' then update public.exercises set deleted_at = null where id = v.registro_id;
    when 'aula' then update public.classes set deleted_at = null where id = v.registro_id;
    when 'perfil' then update public.roles set deleted_at = null where id = v.registro_id;
  end case;
  perform set_config('app.lixeira_cascata', 'off', true);

  delete from public.lixeira where id = p_id;
end $$;

-- ---------------------------------------------------------------------
-- Apagar de vez (após 15 dias ou pelo botão do Super Admin)
-- ---------------------------------------------------------------------

/** Apaga a conta de login quando a pessoa não tem mais nenhum vínculo */
create or replace function public._drop_orphan_user(p_user uuid)
returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if p_user is null
     or exists (select 1 from public.profiles where user_id = p_user)
     or exists (select 1 from public.super_admins where user_id = p_user) then
    return;
  end if;
  begin
    delete from auth.identities where user_id = p_user;
    delete from auth.users where id = p_user;
  exception when others then
    null; -- algum registro ainda aponta para a conta: ela fica, sem acesso a nada
  end;
end $$;
revoke execute on function public._drop_orphan_user(uuid) from public, anon, authenticated;

create or replace function public._purge_trash_item(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v      public.lixeira;
  r      uuid := null;
  v_prof public.profiles;
begin
  select * into v from public.lixeira where id = p_id;
  if v.id is null then
    return;
  end if;
  r := v.registro_id;

  case v.tipo
    when 'mensalidade' then
      update public.whatsapp_logs set payment_id = null where payment_id = r;
      delete from public.payments where id = r;

    when 'aluno' then
      select p.* into v_prof from public.students s join public.profiles p on p.id = s.profile_id where s.id = r;
      delete from public.exercise_logs where student_id = r;
      delete from public.workout_logs where student_id = r;
      delete from public.workouts where student_id = r;
      update public.whatsapp_logs set payment_id = null where payment_id in (select id from public.payments where student_id = r);
      delete from public.whatsapp_logs where student_id = r;
      delete from public.payments where student_id = r;
      delete from public.checkins where student_id = r;
      delete from public.class_bookings where student_id = r;
      delete from public.contracts where student_id = r;
      delete from public.students where id = r;
      -- perfil: só se não for da equipe nem aparecer como professor
      if v_prof.id is not null
         and not exists (select 1 from public.user_roles where user_id = v_prof.user_id and academy_id = v_prof.academy_id)
         and not exists (select 1 from public.workouts where professor_id = v_prof.id)
         and not exists (select 1 from public.classes where professor_id = v_prof.id) then
        delete from public.profiles where id = v_prof.id;
        perform public._drop_orphan_user(v_prof.user_id);
      end if;

    when 'equipe' then
      select * into v_prof from public.profiles where id = r;
      update public.workouts set professor_id = null where professor_id = r;
      update public.classes set professor_id = null where professor_id = r;
      if v_prof.id is not null and not exists (select 1 from public.students where profile_id = r) then
        delete from public.user_roles where user_id = v_prof.user_id and academy_id = v_prof.academy_id;
        delete from public.profiles where id = r;
        perform public._drop_orphan_user(v_prof.user_id);
      end if;

    when 'plano' then
      update public.students set plan_id = null where plan_id = r;
      update public.payments set plan_id = null where plan_id = r;
      delete from public.plans where id = r;

    when 'unidade' then
      update public.students set unit_id = null where unit_id = r;
      update public.classes set unit_id = null where unit_id = r;
      delete from public.units where id = r;

    when 'exercicio' then
      delete from public.exercise_logs where exercise_id = r;
      delete from public.workout_exercises where exercise_id = r;
      delete from public.exercises where id = r;

    when 'treino' then
      delete from public.workouts where id = r;

    when 'aula' then
      delete from public.class_bookings where class_id = r;
      delete from public.classes where id = r;

    when 'perfil' then
      delete from public.roles where id = r;
  end case;

  delete from public.lixeira where id = p_id;
end $$;
revoke execute on function public._purge_trash_item(uuid) from public, anon, authenticated;

/** Apaga de vez o que está na lixeira há mais de 15 dias (agendador, exclusões e Super Admin) */
create or replace function public.purge_trash()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_n  integer := 0;
begin
  for v_id in select id from public.lixeira where excluido_em < now() - interval '15 days' order by excluido_em loop
    begin
      perform public._purge_trash_item(v_id);
      v_n := v_n + 1;
    exception when others then
      raise notice 'Lixeira: não foi possível apagar % (%)', v_id, sqlerrm;
    end;
  end loop;
  return v_n;
end $$;
revoke execute on function public.purge_trash() from public, anon, authenticated;

/** Botão "Apagar agora" do Super Admin */
create or replace function public.purge_trash_item(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.super_can('academias') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  perform public._purge_trash_item(p_id);
end $$;

-- ---------------------------------------------------------------------
-- O que já estava excluído entra na lixeira (15 dias a partir de agora)
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  v_tipo text;
begin
  foreach t in array array['payments', 'students', 'profiles', 'plans', 'units', 'exercises', 'workouts', 'classes', 'roles'] loop
    v_tipo := public._lixeira_tipo(t);
    execute format($q$
      insert into public.lixeira (tipo, registro_id, academy_id, titulo, subtitulo, excluido_em)
      select %L, x.id, x.academy_id,
             coalesce(to_jsonb(x) ->> 'nome', to_jsonb(x) ->> 'descricao', %L),
             'Excluído antes da lixeira', now()
        from public.%I x
       where x.deleted_at is not null
         and (%L <> 'profiles' or not exists (select 1 from public.students s where s.profile_id = x.id))
      on conflict (tipo, registro_id) do nothing
    $q$, v_tipo, initcap(v_tipo), t, t);
  end loop;
end $$;

-- títulos melhores para mensalidades e alunos já excluídos
update public.lixeira l set titulo = coalesce(p.descricao, 'Mensalidade') || ' · ' || coalesce(public._nome_aluno(p.student_id), 'aluno'),
       subtitulo = public._brl(p.valor) || ' · venc. ' || to_char(p.vencimento, 'DD/MM/YYYY') || ' · ' || p.status
  from public.payments p
 where l.tipo = 'mensalidade' and l.registro_id = p.id and l.subtitulo = 'Excluído antes da lixeira';
update public.lixeira l set titulo = public._nome_aluno(l.registro_id), subtitulo = 'Aluno'
 where l.tipo = 'aluno' and l.subtitulo = 'Excluído antes da lixeira';

-- alunos já excluídos: as mensalidades e os treinos deles também deixam de contar
update public.lixeira l
   set dependentes = public._lixeira_cascata_aluno(l.registro_id, now(), 'ativo')
 where l.tipo = 'aluno' and l.dependentes = '{}'::jsonb;

-- Limpeza diária (03:15 UTC) se a extensão pg_cron estiver disponível
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron indisponível: a lixeira é limpa a cada nova exclusão de mensalidade';
    return;
  end;
  begin
    perform cron.unschedule('academia-purge-lixeira');
  exception when others then
    null;
  end;
  perform cron.schedule('academia-purge-lixeira', '15 3 * * *', 'select public.purge_trash()');
exception when others then
  raise notice 'Agendamento não criado: %', sqlerrm;
end $$;

notify pgrst, 'reload schema';
