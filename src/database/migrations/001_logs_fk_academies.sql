-- =====================================================================
-- Migração 001 — FK dos logs para academies
-- Corrige: "Could not find a relationship between 'access_logs' and 'academies'"
-- Necessária apenas em bancos criados antes desta correção
-- (o schema.sql atual já contém as FKs). Pode ser executada mais de uma vez.
-- =====================================================================

-- Logs que apontam para academias inexistentes ficam sem academia
update public.audit_logs  set academy_id = null where academy_id is not null and academy_id not in (select id from public.academies);
update public.access_logs set academy_id = null where academy_id is not null and academy_id not in (select id from public.academies);
update public.errors      set academy_id = null where academy_id is not null and academy_id not in (select id from public.academies);

alter table public.audit_logs  drop constraint if exists audit_logs_academy_id_fkey;
alter table public.access_logs drop constraint if exists access_logs_academy_id_fkey;
alter table public.errors      drop constraint if exists errors_academy_id_fkey;

alter table public.audit_logs  add constraint audit_logs_academy_id_fkey
  foreign key (academy_id) references public.academies(id) on delete set null;
alter table public.access_logs add constraint access_logs_academy_id_fkey
  foreign key (academy_id) references public.academies(id) on delete set null;
alter table public.errors      add constraint errors_academy_id_fkey
  foreign key (academy_id) references public.academies(id) on delete set null;

-- Auditoria: DELETE físico de academia não referencia mais a academia removida
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
    if (v_old - 'updated_at') = (v_new - 'updated_at') then
      return new;
    end if;
    if v_old ->> 'deleted_at' is null and v_new ->> 'deleted_at' is not null then
      v_acao := 'soft_delete';
    end if;
  end if;

  if tg_table_name = 'academies' then
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

-- Recarrega o cache de schema da API (PostgREST)
notify pgrst, 'reload schema';
