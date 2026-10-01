-- =====================================================================
-- Migração 006 — Segurança
--   • Bloqueio de login por CPF após 5 senhas erradas em 15 min (bloqueia 15 min)
--   • verify_my_password: confere a senha atual na troca de senha (sem novo login,
--     compatível com CAPTCHA no login)
--   • Logs protegidos: erros repetidos viram contador, limite de gravação por
--     usuário/anônimo, IP preferindo cabeçalhos que o cliente não consegue forjar
--   • Retenção: purge_old_logs() apaga logs antigos (dias em saas_settings.dados.retencao);
--     agendada diariamente via pg_cron quando disponível
-- Pode ser executada mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Bloqueio de login
-- ---------------------------------------------------------------------
create table if not exists public.login_attempts (
  cpf            text primary key,
  falhas         integer not null default 0,
  primeira_falha timestamptz,
  bloqueado_ate  timestamptz,
  updated_at     timestamptz not null default now()
);
-- Sem policies: acesso só pelas funções abaixo
alter table public.login_attempts enable row level security;

create or replace function public._login_status_json(p_cpf text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'bloqueado', coalesce(bloqueado_ate > now(), false),
    'segundos', greatest(0, ceil(extract(epoch from (bloqueado_ate - now()))))::int,
    'tentativas_restantes', case when bloqueado_ate > now() then 0 else greatest(0, 5 - coalesce(falhas, 0)) end
  )
  from (select (select bloqueado_ate from public.login_attempts where cpf = p_cpf) bloqueado_ate,
               (select case when primeira_falha > now() - interval '15 minutes' then falhas else 0 end
                  from public.login_attempts where cpf = p_cpf) falhas) s;
$$;

/** Antes do login: o CPF está bloqueado? */
create or replace function public.login_status(p_cpf text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select public._login_status_json(p_cpf);
$$;

/** Após senha errada: conta a falha e bloqueia na 5ª dentro de 15 minutos */
create or replace function public.login_failed(p_cpf text)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_cpf is null or p_cpf !~ '^\d{11}$' then
    return null;
  end if;

  insert into public.login_attempts as la (cpf, falhas, primeira_falha, updated_at)
  values (p_cpf, 1, now(), now())
  on conflict (cpf) do update set
    falhas = case
      when la.primeira_falha is null or la.primeira_falha < now() - interval '15 minutes'
        or (la.bloqueado_ate is not null and la.bloqueado_ate <= now()) then 1
      else la.falhas + 1 end,
    primeira_falha = case
      when la.primeira_falha is null or la.primeira_falha < now() - interval '15 minutes'
        or (la.bloqueado_ate is not null and la.bloqueado_ate <= now()) then now()
      else la.primeira_falha end,
    bloqueado_ate = case when la.bloqueado_ate <= now() then null else la.bloqueado_ate end,
    updated_at = now();

  update public.login_attempts
     set bloqueado_ate = now() + interval '15 minutes', falhas = 5
   where cpf = p_cpf and falhas >= 5 and (bloqueado_ate is null or bloqueado_ate <= now());

  return public._login_status_json(p_cpf);
end $$;

/** Login bem-sucedido: zera as falhas do próprio CPF */
create or replace function public.login_succeeded()
returns void
language sql security definer set search_path = public, auth as $$
  delete from public.login_attempts
   where cpf = (select split_part(email, '@', 1) from auth.users where id = auth.uid());
$$;

/** Confere a senha atual do usuário logado (troca de senha). Erros contam para o bloqueio. */
create or replace function public.verify_my_password(p_password text)
returns boolean
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_cpf text;
  v_ok  boolean;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;
  select split_part(email, '@', 1), encrypted_password = crypt(p_password, encrypted_password)
    into v_cpf, v_ok
    from auth.users where id = auth.uid();

  if (public._login_status_json(v_cpf) ->> 'bloqueado')::boolean then
    raise exception 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
  end if;
  if not coalesce(v_ok, false) then
    perform public.login_failed(v_cpf);
  end if;
  return coalesce(v_ok, false);
end $$;

revoke execute on function public._login_status_json(text) from public, anon, authenticated;
grant execute on function public.login_status(text) to anon, authenticated;
grant execute on function public.login_failed(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- IP: cabeçalhos definidos pela infraestrutura vêm primeiro
-- (o 1º item de x-forwarded-for pode ser enviado pelo próprio cliente)
-- ---------------------------------------------------------------------
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
    nullif(v_headers ->> 'cf-connecting-ip', ''),
    nullif(v_headers ->> 'x-real-ip', ''),
    nullif(trim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), '')
  );
end $$;

-- ---------------------------------------------------------------------
-- Logs com limite e deduplicação
-- ---------------------------------------------------------------------
alter table public.errors add column if not exists ocorrencias integer not null default 1;
alter table public.errors add column if not exists ultima_em timestamptz;
create index if not exists errors_user_idx on public.errors (user_id, created_at desc);
create index if not exists access_logs_user_idx on public.access_logs (user_id, created_at desc);

create or replace function public.log_error(
  p_academy uuid, p_mensagem text, p_stack text default null, p_rota text default null, p_user_agent text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_msg text := left(coalesce(p_mensagem, 'Erro desconhecido'), 2000);
  v_rota text := left(p_rota, 500);
  v_dup bigint;
begin
  if p_academy is not null and not (public.is_member(p_academy) or public.is_super_admin()) then
    p_academy := null;
  end if;

  -- mesmo erro, mesmo usuário e rota na última hora → só incrementa o contador
  select id into v_dup from public.errors
   where mensagem = v_msg
     and user_id is not distinct from auth.uid()
     and rota is not distinct from v_rota
     and coalesce(ultima_em, created_at) > now() - interval '1 hour'
   order by id desc limit 1;
  if v_dup is not null then
    update public.errors set ocorrencias = ocorrencias + 1, ultima_em = now() where id = v_dup;
    return;
  end if;

  -- limites: anônimos 20 registros novos a cada 10 min (total); usuário 100 por hora
  if auth.uid() is null then
    if (select count(*) from public.errors where user_id is null and created_at > now() - interval '10 minutes') >= 20 then
      return;
    end if;
  elsif (select count(*) from public.errors where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 100 then
    return;
  end if;

  insert into public.errors (academy_id, user_id, user_nome, mensagem, stack, rota, user_agent, ultima_em)
  values (
    p_academy, auth.uid(), case when auth.uid() is not null then public._user_nome(p_academy) end,
    v_msg, left(p_stack, 8000), v_rota, left(p_user_agent, 500), now()
  );
end $$;

create or replace function public.log_access(p_academy uuid, p_evento text, p_user_agent text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return;
  end if;
  if (select count(*) from public.access_logs where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 60 then
    return;
  end if;
  if p_academy is not null and not (public.is_member(p_academy) or public.is_super_admin()) then
    p_academy := null;
  end if;
  insert into public.access_logs (academy_id, user_id, user_nome, evento, ip, user_agent)
  values (p_academy, auth.uid(), public._user_nome(p_academy), p_evento, public._client_ip(), left(p_user_agent, 500));
end $$;

-- ---------------------------------------------------------------------
-- Retenção de logs
-- ---------------------------------------------------------------------
/**
 * Apaga logs mais antigos que o configurado em saas_settings.dados.retencao
 * (padrão: erros 90 dias, acessos 180, auditoria 365). Retorna quantos apagou.
 * Executável pelo Super Admin ou pelo agendador (pg_cron, sem usuário logado).
 */
create or replace function public.purge_old_logs()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cfg jsonb;
  v_erros int; v_acessos int; v_auditoria int; v_tentativas int;
begin
  if auth.uid() is not null and not public.is_super_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  select coalesce(dados -> 'retencao', '{}'::jsonb) into v_cfg from public.saas_settings where id = 1;
  v_cfg := coalesce(v_cfg, '{}'::jsonb);

  delete from public.errors where coalesce(ultima_em, created_at) < now() - make_interval(days => greatest(coalesce((v_cfg ->> 'erros')::int, 90), 7));
  get diagnostics v_erros = row_count;
  delete from public.access_logs where created_at < now() - make_interval(days => greatest(coalesce((v_cfg ->> 'acessos')::int, 180), 7));
  get diagnostics v_acessos = row_count;
  delete from public.audit_logs where created_at < now() - make_interval(days => greatest(coalesce((v_cfg ->> 'auditoria')::int, 365), 30));
  get diagnostics v_auditoria = row_count;
  delete from public.login_attempts where updated_at < now() - interval '1 day';
  get diagnostics v_tentativas = row_count;

  return jsonb_build_object('erros', v_erros, 'acessos', v_acessos, 'auditoria', v_auditoria, 'tentativas', v_tentativas);
end $$;

-- Agendamento diário (03:00 UTC) se a extensão pg_cron estiver disponível no projeto
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron indisponível: a limpeza de logs pode ser feita manualmente pelo Super Admin';
    return;
  end;
  begin
    perform cron.unschedule('academia-purge-logs');
  exception when others then
    null;
  end;
  perform cron.schedule('academia-purge-logs', '0 3 * * *', 'select public.purge_old_logs()');
exception when others then
  raise notice 'Agendamento não criado: %', sqlerrm;
end $$;

notify pgrst, 'reload schema';
