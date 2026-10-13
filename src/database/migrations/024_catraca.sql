-- =====================================================================
-- Migração 024 — Catraca Control iD (iDFace + iDBlock Next)
--
--   Como funciona
--   • O iDFace (primário do conjunto iDBlock Next) fica em MODO ONLINE e em
--     MODO PUSH apontando para a Edge Function "catraca" do Supabase:
--       https://<projeto>.supabase.co/functions/v1/catraca/<token-da-catraca>
--   • Modo online: a cada rosto/cartão reconhecido o aparelho pergunta ao
--     sistema se libera; a resposta segue as regras de cada academia e a
--     entrada vira check-in (origem "catraca").
--   • Modo push: o aparelho busca comandos (cadastrar aluno, foto do rosto,
--     liberar o giro, remover aluno) na fila catraca_comandos.
--
--   Quem faz o quê
--   • Super Admin: equipamentos, token, senha do painel (criptografada),
--     configuração técnica. A academia não vê nada disso.
--   • Academia (por permissão do perfil de acesso):
--       catraca.ver       → acessos (quem entrou / quem foi bloqueado)
--       catraca.liberar   → liberar o giro manualmente (com motivo)
--       catraca.biometria → cadastrar o rosto do aluno (câmera ou upload)
--   • Regras de bloqueio: cada academia escolhe nas Configurações.
--   • Módulo "catraca" só é ligado como adicional (engrenagem de módulos da
--     academia ou plano que o inclua explicitamente).
-- Requer a 023. Pode ser executada mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Módulo (somente como adicional) e permissões
-- ---------------------------------------------------------------------
alter table public.saas_modules add column if not exists somente_adicional boolean not null default false;

insert into public.saas_modules (slug, nome, descricao, grupo, essencial, ordem, somente_adicional)
values ('catraca', 'Catraca (Control iD)', 'Catraca com reconhecimento facial: entrada automática, bloqueios e check-in', 'gestao', false, 35, true)
on conflict (slug) do update set somente_adicional = true;

/** Módulos da academia: os "somente adicional" só entram se ligados na academia ou listados no plano */
create or replace function public._academy_modules(p_academy uuid)
returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(m.slug order by m.ordem, m.slug), '{}')
    from public.saas_modules m
    cross join public.academies a
    left join public.saas_plans p on p.id = a.saas_plan_id
   where a.id = p_academy
     and m.ativo
     and (
       m.essencial
       or case when a.modulos_override ? m.slug then (a.modulos_override ->> m.slug)::boolean
               when m.somente_adicional then m.slug = any (coalesce(p.modulos, '{}'))
               else p.modulos is null or m.slug = any (p.modulos) end
     );
$$;
revoke execute on function public._academy_modules(uuid) from public, anon, authenticated;

create or replace function public._module_of(p_perm text)
returns text language sql immutable as $$
  select case split_part(p_perm, '.', 1)
    when 'treinos' then 'treinos'
    when 'aulas' then 'aulas'
    when 'financeiro' then 'financeiro'
    when 'relatorios' then 'relatorios'
    when 'auditoria' then 'auditoria'
    when 'catraca' then 'catraca'
  end;
$$;

insert into public.permissions (recurso, acao, descricao) values
  ('catraca', 'ver', 'Ver acessos da catraca (quem entrou e quem foi bloqueado)'),
  ('catraca', 'liberar', 'Liberar a catraca manualmente'),
  ('catraca', 'biometria', 'Cadastrar o rosto do aluno na catraca')
on conflict (recurso, acao) do nothing;

-- check-in vindo da catraca
alter table public.checkins drop constraint if exists checkins_origem_check;
alter table public.checkins add constraint checkins_origem_check check (origem in ('qr', 'manual', 'catraca'));

-- regras de bloqueio de cada academia
alter table public.academy_settings add column if not exists catraca_bloquear_inadimplente boolean not null default true;
alter table public.academy_settings add column if not exists catraca_bloquear_vencido boolean not null default true;
alter table public.academy_settings add column if not exists catraca_bloquear_fora_horario boolean not null default false;

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------

-- chave para criptografar a senha do painel das catracas (ninguém lê pela API)
create table if not exists public.catraca_chave (
  id    integer primary key default 1 check (id = 1),
  chave text not null
);
alter table public.catraca_chave enable row level security;
revoke all on public.catraca_chave from anon, authenticated;

create or replace function public._catraca_chave()
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v text;
begin
  select chave into v from public.catraca_chave where id = 1;
  if v is null then
    insert into public.catraca_chave (id, chave) values (1, encode(extensions.gen_random_bytes(32), 'hex'))
    on conflict (id) do nothing;
    select chave into v from public.catraca_chave where id = 1;
  end if;
  return v;
end $$;
revoke execute on function public._catraca_chave() from public, anon, authenticated;

create table if not exists public.catraca_devices (
  id                uuid primary key default gen_random_uuid(),
  academy_id        uuid not null references public.academies(id) on delete cascade,
  unit_id           uuid references public.units(id) on delete set null,
  nome              text not null check (length(trim(nome)) between 1 and 80),
  sentido           text not null default 'entrada' check (sentido in ('entrada', 'saida', 'ambos')),
  modelo            text,
  leitor            text,
  metodos           text[] not null default '{facial}',
  numero_serie      text,
  firmware          text,
  hw_device_id      text,                 -- "ID do Dispositivo" que o aparelho informa
  ip_interno        text,
  painel_usuario    text,
  painel_senha      bytea,                -- criptografada (pgp_sym_encrypt)
  ligacao           text,
  outro_sistema     boolean not null default false,
  rostos_existentes boolean not null default false,
  observacoes       text,
  acao_liberar      text not null default 'catra' check (acao_liberar in ('catra', 'sec_box')),
  direcao           text not null default 'clockwise' check (direcao in ('clockwise', 'anticlockwise', 'both')),
  token_hash        text not null unique,
  token_inicio      text not null,        -- começo do token, só para conferência visual
  ativo             boolean not null default true,
  ultimo_sinal      timestamptz,
  ultima_rota       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists catraca_devices_academy_idx on public.catraca_devices (academy_id);
alter table public.catraca_devices enable row level security;

drop policy if exists catraca_devices_super on public.catraca_devices;
create policy catraca_devices_super on public.catraca_devices for select to authenticated
  using ((select public.is_super_admin()));
-- gravação só pelas funções (que conferem o papel); token e senha nunca saem pela API
revoke all on public.catraca_devices from anon, authenticated;
grant select (id, academy_id, unit_id, nome, sentido, modelo, leitor, metodos, numero_serie, firmware, hw_device_id,
              ip_interno, painel_usuario, ligacao, outro_sistema, rostos_existentes, observacoes, acao_liberar, direcao,
              token_inicio, ativo, ultimo_sinal, ultima_rota, created_at, updated_at)
  on public.catraca_devices to authenticated;

create sequence if not exists public.catraca_user_seq start 1000;

-- aluno ↔ usuário no aparelho (o iDFace usa números)
create table if not exists public.catraca_usuarios (
  student_id  uuid primary key references public.students(id) on delete cascade,
  academy_id  uuid not null references public.academies(id) on delete cascade,
  user_id     bigint not null unique default nextval('public.catraca_user_seq'),
  face_status text not null default 'sem' check (face_status in ('sem', 'pendente', 'ok', 'erro')),
  face_erro   text,
  face_em     timestamptz,
  foto_path   text,                       -- foto temporária até o aparelho confirmar (LGPD: apagada depois)
  cartao      bigint,
  updated_at  timestamptz not null default now()
);
create index if not exists catraca_usuarios_academy_idx on public.catraca_usuarios (academy_id);
alter table public.catraca_usuarios enable row level security;
drop policy if exists catraca_usuarios_select on public.catraca_usuarios;
create policy catraca_usuarios_select on public.catraca_usuarios for select to authenticated
  using ((select public.is_super_admin())
      or academy_id in (select public.academies_with_permission('alunos.ver'))
      or academy_id in (select public.academies_with_permission('catraca.biometria')));
revoke all on public.catraca_usuarios from anon, authenticated;
grant select (student_id, academy_id, user_id, face_status, face_erro, face_em, cartao, updated_at) on public.catraca_usuarios to authenticated;

-- log de acessos (o que a academia vê)
create table if not exists public.catraca_acessos (
  id          bigserial primary key,
  academy_id  uuid not null references public.academies(id) on delete cascade,
  device_id   uuid references public.catraca_devices(id) on delete set null,
  student_id  uuid references public.students(id) on delete cascade,
  nome        text,
  resultado   text not null check (resultado in ('liberado', 'bloqueado', 'manual', 'desistencia', 'nao_identificado')),
  motivo      text,
  metodo      text,
  checkin_id  uuid,
  por         uuid,
  por_nome    text,
  created_at  timestamptz not null default now()
);
create index if not exists catraca_acessos_academy_idx on public.catraca_acessos (academy_id, created_at desc);
create index if not exists catraca_acessos_device_idx on public.catraca_acessos (device_id, created_at desc);
alter table public.catraca_acessos enable row level security;
drop policy if exists catraca_acessos_select on public.catraca_acessos;
create policy catraca_acessos_select on public.catraca_acessos for select to authenticated
  using ((select public.is_super_admin())
      or academy_id in (select public.academies_with_permission('catraca.ver')));
revoke all on public.catraca_acessos from anon, authenticated;
grant select on public.catraca_acessos to authenticated;

-- fila de comandos do modo push
create table if not exists public.catraca_comandos (
  id           bigserial primary key,
  device_id    uuid not null references public.catraca_devices(id) on delete cascade,
  tipo         text not null check (tipo in ('usuario', 'rosto', 'liberar', 'remover', 'config')),
  student_id   uuid,
  payload      jsonb not null,
  status       text not null default 'pendente' check (status in ('pendente', 'enviado', 'ok', 'erro')),
  uuid         text,
  tentativas   integer not null default 0,
  resposta     text,
  created_at   timestamptz not null default now(),
  enviado_em   timestamptz,
  concluido_em timestamptz
);
create index if not exists catraca_comandos_fila_idx on public.catraca_comandos (device_id, status, id);
alter table public.catraca_comandos enable row level security;
drop policy if exists catraca_comandos_super on public.catraca_comandos;
create policy catraca_comandos_super on public.catraca_comandos for select to authenticated
  using ((select public.is_super_admin()));
revoke all on public.catraca_comandos from anon, authenticated;
grant select on public.catraca_comandos to authenticated;

-- fotos temporárias do cadastro facial (privado)
insert into storage.buckets (id, name, public)
values ('catraca-faces', 'catraca-faces', false)
on conflict (id) do nothing;
do $$
begin
  update storage.buckets set file_size_limit = 2097152, allowed_mime_types = array['image/jpeg', 'image/png']
   where id = 'catraca-faces';
exception when undefined_column then
  null;
end $$;

drop policy if exists catraca_faces_insert on storage.objects;
create policy catraca_faces_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'catraca-faces'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and ((storage.foldername(name))[1]::uuid in (select public.academies_with_permission('catraca.biometria'))
         or public.super_can('academias')));
drop policy if exists catraca_faces_update on storage.objects;
create policy catraca_faces_update on storage.objects for update to authenticated
  using (bucket_id = 'catraca-faces'
    and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and ((storage.foldername(name))[1]::uuid in (select public.academies_with_permission('catraca.biometria'))
         or public.super_can('academias')));

-- ---------------------------------------------------------------------
-- Funções auxiliares
-- ---------------------------------------------------------------------
create or replace function public._catraca_token_hash(p_token text)
returns text language sql immutable set search_path = public, extensions as $$
  select encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

/** Comando para liberar o giro conforme o equipamento */
create or replace function public._catraca_acao(p_dev public.catraca_devices)
returns jsonb language sql immutable as $$
  select case when p_dev.acao_liberar = 'sec_box'
    then jsonb_build_object('action', 'sec_box', 'parameters', 'id=65793,reason=1')
    else jsonb_build_object('action', 'catra', 'parameters', 'allow=' || p_dev.direcao) end;
$$;

/** Põe um comando na fila de cada catraca ativa da academia (ou de uma catraca específica) */
create or replace function public._catraca_enfileirar(p_academy uuid, p_device uuid, p_tipo text, p_student uuid, p_payload jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
begin
  insert into public.catraca_comandos (device_id, tipo, student_id, payload)
  select d.id, p_tipo, p_student, p_payload
    from public.catraca_devices d
   where d.academy_id = p_academy and d.ativo and (p_device is null or d.id = p_device);
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public._catraca_enfileirar(uuid, uuid, text, uuid, jsonb) from public, anon, authenticated;

/** Garante o número do aluno no aparelho e manda o cadastro (nome) para as catracas */
create or replace function public._catraca_usuario(p_student uuid)
returns public.catraca_usuarios
language plpgsql security definer set search_path = public as $$
declare
  v  public.catraca_usuarios;
  v_s public.students;
  v_nome text;
begin
  select * into v_s from public.students where id = p_student;
  if v_s.id is null then
    raise exception 'Aluno não encontrado';
  end if;
  insert into public.catraca_usuarios (student_id, academy_id) values (p_student, v_s.academy_id)
  on conflict (student_id) do nothing;
  select * into v from public.catraca_usuarios where student_id = p_student;
  select nome into v_nome from public.profiles where id = v_s.profile_id;
  perform public._catraca_enfileirar(v_s.academy_id, null, 'usuario', p_student, jsonb_build_object(
    'verb', 'POST', 'endpoint', 'create_or_modify_objects', 'contentType', 'application/json',
    'body', jsonb_build_object('object', 'users', 'values', jsonb_build_array(jsonb_build_object(
      'id', v.user_id, 'registration', v.user_id::text, 'name', left(coalesce(v_nome, 'Aluno'), 60))))));
  return v;
end $$;
revoke execute on function public._catraca_usuario(uuid) from public, anon, authenticated;

-- aluno apagado de vez: tira do aparelho também
create or replace function public.catraca_usuario_removido()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.catraca_comandos (device_id, tipo, payload)
  select d.id, 'remover', jsonb_build_object(
    'verb', 'POST', 'endpoint', 'destroy_objects', 'contentType', 'application/json',
    'body', jsonb_build_object('object', 'users', 'where', jsonb_build_object('users', jsonb_build_object('id', old.user_id))))
    from public.catraca_devices d
   where d.academy_id = old.academy_id and d.ativo;
  return old;
end $$;
drop trigger if exists catraca_usuarios_removido on public.catraca_usuarios;
create trigger catraca_usuarios_removido after delete on public.catraca_usuarios
  for each row execute function public.catraca_usuario_removido();

-- ---------------------------------------------------------------------
-- Super Admin: equipamentos
-- ---------------------------------------------------------------------

/**
 * Cria ou altera uma catraca. p_senha: null = mantém, '' = apaga, texto = grava criptografada.
 * Na criação devolve o token (mostrado uma única vez).
 */
create or replace function public.catraca_device_save(p_id uuid, p_academy uuid, p_dados jsonb, p_senha text default null)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id    uuid := p_id;
  v_token text;
  v_unit  uuid := nullif(p_dados ->> 'unit_id', '')::uuid;
begin
  if not public.super_can('academias') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if v_unit is not null and not exists (select 1 from public.units where id = v_unit and academy_id = p_academy) then
    raise exception 'Unidade não pertence à academia';
  end if;

  if v_id is null then
    v_token := encode(extensions.gen_random_bytes(24), 'hex');
    insert into public.catraca_devices (academy_id, nome, token_hash, token_inicio)
    values (p_academy, coalesce(nullif(trim(p_dados ->> 'nome'), ''), 'Catraca'), public._catraca_token_hash(v_token), left(v_token, 6))
    returning id into v_id;
  elsif not exists (select 1 from public.catraca_devices where id = v_id and academy_id = p_academy) then
    raise exception 'Catraca não encontrada';
  end if;

  update public.catraca_devices set
    nome = coalesce(nullif(trim(p_dados ->> 'nome'), ''), nome),
    unit_id = v_unit,
    sentido = coalesce(nullif(p_dados ->> 'sentido', ''), sentido),
    modelo = nullif(trim(p_dados ->> 'modelo'), ''),
    leitor = nullif(trim(p_dados ->> 'leitor'), ''),
    metodos = coalesce((select array_agg(x) from jsonb_array_elements_text(p_dados -> 'metodos') x), metodos),
    numero_serie = nullif(trim(p_dados ->> 'numero_serie'), ''),
    firmware = nullif(trim(p_dados ->> 'firmware'), ''),
    hw_device_id = nullif(trim(p_dados ->> 'hw_device_id'), ''),
    ip_interno = nullif(trim(p_dados ->> 'ip_interno'), ''),
    painel_usuario = nullif(trim(p_dados ->> 'painel_usuario'), ''),
    painel_senha = case when p_senha is null then painel_senha
                        when p_senha = '' then null
                        else extensions.pgp_sym_encrypt(p_senha, public._catraca_chave()) end,
    ligacao = nullif(trim(p_dados ->> 'ligacao'), ''),
    outro_sistema = coalesce((p_dados ->> 'outro_sistema')::boolean, false),
    rostos_existentes = coalesce((p_dados ->> 'rostos_existentes')::boolean, false),
    observacoes = nullif(trim(p_dados ->> 'observacoes'), ''),
    acao_liberar = coalesce(nullif(p_dados ->> 'acao_liberar', ''), acao_liberar),
    direcao = coalesce(nullif(p_dados ->> 'direcao', ''), direcao),
    updated_at = now()
  where id = v_id;

  return jsonb_build_object('id', v_id, 'token', v_token);
end $$;

/** Gera um token novo (o antigo para de funcionar na hora) */
create or replace function public.catraca_device_novo_token(p_id uuid)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if not public.super_can('academias') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  update public.catraca_devices set token_hash = public._catraca_token_hash(v_token), token_inicio = left(v_token, 6), updated_at = now()
   where id = p_id;
  if not found then
    raise exception 'Catraca não encontrada';
  end if;
  return v_token;
end $$;

/** Mostra a senha do painel (só Super Admin) */
create or replace function public.catraca_device_senha(p_id uuid)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v bytea;
begin
  if not public.super_can('academias') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  select painel_senha into v from public.catraca_devices where id = p_id;
  if v is null then
    return null;
  end if;
  return extensions.pgp_sym_decrypt(v, public._catraca_chave());
end $$;

create or replace function public.catraca_device_ativo(p_id uuid, p_ativo boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.super_can('academias') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  update public.catraca_devices set ativo = p_ativo, updated_at = now() where id = p_id;
end $$;

create or replace function public.catraca_device_excluir(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.super_can('academias') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  delete from public.catraca_devices where id = p_id;
end $$;

/** Reenvia todos os alunos (e rostos já cadastrados ficam como estão) para uma catraca nova */
create or replace function public.catraca_sincronizar(p_id uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_dev public.catraca_devices;
  v_n   integer;
begin
  if not public.super_can('academias') then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  select * into v_dev from public.catraca_devices where id = p_id;
  if v_dev.id is null then
    raise exception 'Catraca não encontrada';
  end if;
  -- todos os alunos ativos ganham número no aparelho
  insert into public.catraca_usuarios (student_id, academy_id)
  select s.id, s.academy_id from public.students s
   where s.academy_id = v_dev.academy_id and s.deleted_at is null and s.status = 'ativo'
  on conflict (student_id) do nothing;

  insert into public.catraca_comandos (device_id, tipo, student_id, payload)
  select v_dev.id, 'usuario', cu.student_id, jsonb_build_object(
    'verb', 'POST', 'endpoint', 'create_or_modify_objects', 'contentType', 'application/json',
    'body', jsonb_build_object('object', 'users', 'values', jsonb_build_array(jsonb_build_object(
      'id', cu.user_id, 'registration', cu.user_id::text, 'name', left(coalesce(p.nome, 'Aluno'), 60)))))
    from public.catraca_usuarios cu
    join public.students s on s.id = cu.student_id and s.deleted_at is null and s.status = 'ativo'
    join public.profiles p on p.id = s.profile_id
   where cu.academy_id = v_dev.academy_id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ---------------------------------------------------------------------
-- Academia
-- ---------------------------------------------------------------------

/** Catracas da academia sem dados técnicos (para o botão "Liberar giro") */
create or replace function public.catraca_lista_academia(p_academy uuid)
returns table (id uuid, nome text, sentido text, unidade text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_super_admin()
          or p_academy in (select public.academies_with_permission('catraca.ver'))
          or p_academy in (select public.academies_with_permission('catraca.liberar'))) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  return query
  select d.id, d.nome, d.sentido, u.nome
    from public.catraca_devices d left join public.units u on u.id = d.unit_id
   where d.academy_id = p_academy and d.ativo
   order by d.nome;
end $$;

/** Libera o giro pela recepção (com motivo) */
create or replace function public.catraca_liberar(p_device uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_dev public.catraca_devices;
begin
  select * into v_dev from public.catraca_devices where id = p_device and ativo;
  if v_dev.id is null then
    raise exception 'Catraca não encontrada';
  end if;
  if not (public.super_can('academias') or v_dev.academy_id in (select public.academies_with_permission('catraca.liberar'))) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da liberação';
  end if;
  perform public._catraca_enfileirar(v_dev.academy_id, v_dev.id, 'liberar', null, jsonb_build_object(
    'verb', 'POST', 'endpoint', 'execute_actions', 'contentType', 'application/json',
    'body', jsonb_build_object('actions', jsonb_build_array(public._catraca_acao(v_dev)))));
  insert into public.catraca_acessos (academy_id, device_id, resultado, motivo, por, por_nome)
  values (v_dev.academy_id, v_dev.id, 'manual', left(trim(p_motivo), 200), auth.uid(), public._user_nome(v_dev.academy_id));
end $$;

/** Cadastra o rosto: a foto (já enviada para catraca-faces/<academia>/...) vai para todas as catracas */
create or replace function public.catraca_cadastrar_rosto(p_student uuid, p_foto_path text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_s  public.students;
  v_cu public.catraca_usuarios;
begin
  select * into v_s from public.students where id = p_student and deleted_at is null;
  if v_s.id is null then
    raise exception 'Aluno não encontrado';
  end if;
  if not (public.super_can('academias') or v_s.academy_id in (select public.academies_with_permission('catraca.biometria'))) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if not public.has_module(v_s.academy_id, 'catraca') then
    raise exception 'A catraca não está habilitada para esta academia';
  end if;
  if p_foto_path is null or p_foto_path not like v_s.academy_id::text || '/%' then
    raise exception 'Foto inválida';
  end if;
  if not exists (select 1 from public.catraca_devices where academy_id = v_s.academy_id and ativo) then
    raise exception 'Nenhuma catraca ativa nesta academia';
  end if;

  v_cu := public._catraca_usuario(p_student);
  update public.catraca_usuarios set face_status = 'pendente', face_erro = null, foto_path = p_foto_path, updated_at = now()
   where student_id = p_student;
  -- comandos antigos de rosto deste aluno que ainda não foram: substituídos pelo novo
  update public.catraca_comandos set status = 'erro', resposta = 'Substituído por uma foto mais nova', concluido_em = now()
   where student_id = p_student and tipo = 'rosto' and status in ('pendente', 'enviado');
  perform public._catraca_enfileirar(v_s.academy_id, null, 'rosto', p_student, jsonb_build_object(
    'verb', 'POST', 'endpoint', 'user_set_image_list', 'contentType', 'application/json',
    'body', jsonb_build_object('match', false, 'user_images', jsonb_build_array(jsonb_build_object(
      'user_id', v_cu.user_id, 'timestamp', extract(epoch from now())::bigint, 'image', '__FOTO__')))));
end $$;

-- ---------------------------------------------------------------------
-- Aparelho → sistema (chamado pela Edge Function "catraca" com a chave de serviço)
-- ---------------------------------------------------------------------

/** Decide se libera o aluno e registra o acesso */
create or replace function public._catraca_decidir(p_dev public.catraca_devices, p_user_id bigint, p_metodo text, p_portal text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cu    public.catraca_usuarios;
  v_s     public.students;
  v_nome  text;
  v_cfg   jsonb := public._academy_cfg(p_dev.academy_id);
  v_msg   text;
  v_ck    jsonb;
  v_ckid  uuid;
begin
  select * into v_cu from public.catraca_usuarios where user_id = p_user_id and academy_id = p_dev.academy_id;
  if v_cu.student_id is not null then
    select * into v_s from public.students where id = v_cu.student_id;
    select nome into v_nome from public.profiles where id = v_s.profile_id;
  end if;

  if not public.has_module(p_dev.academy_id, 'catraca') then
    v_msg := 'Catraca não habilitada. Procure a recepção.';
  elsif v_s.id is null then
    v_msg := 'Cadastro não encontrado. Procure a recepção.';
  elsif v_s.deleted_at is not null or v_s.status <> 'ativo' then
    v_msg := 'Matrícula inativa. Procure a recepção.';
  elsif coalesce((v_cfg ->> 'catraca_bloquear_vencido')::boolean, true)
        and v_s.plano_valido_ate is not null and v_s.plano_valido_ate < public._today() then
    v_msg := 'Plano vencido em ' || to_char(v_s.plano_valido_ate, 'DD/MM') || '. Procure a recepção.';
  elsif coalesce((v_cfg ->> 'catraca_bloquear_inadimplente')::boolean, true) and public.is_inadimplente(v_s.id) then
    v_msg := 'Mensalidade em atraso. Procure a recepção.';
  elsif coalesce((v_cfg ->> 'catraca_bloquear_fora_horario')::boolean, false) and not public._academy_open(p_dev.academy_id) then
    v_msg := 'Academia fechada agora.';
  end if;

  if v_msg is not null then
    insert into public.catraca_acessos (academy_id, device_id, student_id, nome, resultado, motivo, metodo)
    values (p_dev.academy_id, p_dev.id, v_s.id,
            case when v_s.id is null then null else v_nome end,
            case when v_s.id is null then 'nao_identificado' else 'bloqueado' end, v_msg, p_metodo);
    return jsonb_build_object('result', jsonb_build_object(
      'event', 6, 'user_id', p_user_id, 'user_name', coalesce(v_nome, ''), 'user_image', false,
      'portal_id', p_portal, 'actions', '[]'::jsonb, 'message', v_msg));
  end if;

  -- liberado: entrada vira check-in (saída não)
  if p_dev.sentido <> 'saida' and public.has_module(p_dev.academy_id, 'checkin') then
    v_ck := public._register_checkin(p_dev.academy_id, v_s.id, 'catraca');
    if not coalesce((v_ck ->> 'repetido')::boolean, false) then
      v_ckid := (v_ck ->> 'id')::uuid;
    end if;
  end if;
  insert into public.catraca_acessos (academy_id, device_id, student_id, nome, resultado, metodo, checkin_id)
  values (p_dev.academy_id, p_dev.id, v_s.id, v_nome, 'liberado', p_metodo, v_ckid);

  return jsonb_build_object('result', jsonb_build_object(
    'event', 7, 'user_id', p_user_id, 'user_name', coalesce(v_nome, ''), 'user_image', false,
    'portal_id', p_portal, 'actions', jsonb_build_array(public._catraca_acao(p_dev)),
    'message', 'Bem-vindo(a), ' || split_part(coalesce(v_nome, ''), ' ', 1) || '!'));
end $$;
revoke execute on function public._catraca_decidir(public.catraca_devices, bigint, text, text) from public, anon, authenticated;

/** Erros do cadastro facial do aparelho → mensagem em português */
create or replace function public._catraca_erro_rosto(p_code int, p_msg text)
returns text language sql immutable as $$
  select case p_code
    when 1 then 'Foto em formato inválido (use JPG ou PNG)'
    when 2 then 'Nenhum rosto encontrado na foto'
    when 3 then 'Este rosto já está cadastrado para outra pessoa'
    when 4 then 'Rosto fora do centro da foto'
    when 5 then 'Rosto muito distante: aproxime a câmera'
    when 6 then 'Rosto muito próximo: afaste a câmera'
    when 7 then 'Rosto de lado ou inclinado: olhe para a câmera'
    when 8 then 'Foto sem nitidez: tire outra com mais luz e sem tremer'
    when 9 then 'Rosto muito perto da borda da foto'
    else coalesce(nullif(p_msg, ''), 'Erro no cadastro do rosto') end;
$$;

/**
 * Atende o aparelho. p_rota = caminho depois do token (ex.: "new_user_identified.fcgi", "push", "result").
 * Retorna { status, body } e, nos comandos de rosto, foto_path para a Edge Function.
 */
create or replace function public.catraca_request(p_token text, p_rota text, p_params jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_dev   public.catraca_devices;
  v_rota  text := regexp_replace(lower(coalesce(p_rota, '')), '^/+|/+$', '', 'g');
  v_cmd   public.catraca_comandos;
  v_resp  jsonb;
  v_ok    boolean;
  v_err   jsonb;
  v_foto  text;
  v_tipo  text;
  v_ac    public.catraca_acessos;
  v_hw    text := coalesce(p_params ->> 'device_id', p_params ->> 'deviceId');
begin
  select * into v_dev from public.catraca_devices where token_hash = public._catraca_token_hash(p_token);
  if v_dev.id is null then
    return jsonb_build_object('status', 404, 'body', jsonb_build_object('error', 'catraca desconhecida'));
  end if;

  update public.catraca_devices
     set ultimo_sinal = now(), ultima_rota = left(v_rota, 60),
         hw_device_id = coalesce(hw_device_id, nullif(v_hw, ''))
   where id = v_dev.id;

  -- catraca desativada pelo Super Admin: não libera ninguém e não recebe comandos
  if not v_dev.ativo then
    if v_rota in ('new_user_identified.fcgi', 'new_card.fcgi', 'new_qrcode.fcgi', 'new_user_id_and_password.fcgi') then
      return jsonb_build_object('status', 200, 'body', jsonb_build_object('result', jsonb_build_object(
        'event', 6, 'user_image', false, 'actions', '[]'::jsonb, 'message', 'Catraca desativada. Procure a recepção.')));
    end if;
    return jsonb_build_object('status', 200, 'body', null);
  end if;

  if v_rota = 'session_is_valid.fcgi' then
    return jsonb_build_object('status', 200, 'body', jsonb_build_object('session_is_valid', true));

  elsif v_rota in ('device_is_alive.fcgi', 'new_rex_log.fcgi') or v_rota like 'api/notifications/%' and v_rota <> 'api/notifications/catra_event' then
    return jsonb_build_object('status', 200, 'body', null);

  elsif v_rota = 'new_user_identified.fcgi' then
    return jsonb_build_object('status', 200, 'body', public._catraca_decidir(
      v_dev, nullif(p_params ->> 'user_id', '')::bigint,
      case when nullif(p_params ->> 'card_value', '') is not null and p_params ->> 'card_value' <> '0' then 'cartao'
           when nullif(p_params ->> 'qrcode_value', '') is not null then 'qrcode'
           when nullif(p_params ->> 'pin_value', '') is not null then 'senha'
           else 'facial' end,
      p_params ->> 'portal_id'));

  elsif v_rota = 'new_card.fcgi' then
    return jsonb_build_object('status', 200, 'body', public._catraca_decidir(
      v_dev,
      (select user_id from public.catraca_usuarios
        where academy_id = v_dev.academy_id and cartao = nullif(p_params ->> 'card_value', '')::bigint),
      'cartao', p_params ->> 'portal_id'));

  elsif v_rota in ('new_qrcode.fcgi', 'new_user_id_and_password.fcgi') then
    return jsonb_build_object('status', 200, 'body', jsonb_build_object('result', jsonb_build_object(
      'event', 6, 'user_image', false, 'portal_id', p_params ->> 'portal_id', 'actions', '[]'::jsonb,
      'message', 'Use o reconhecimento facial')));

  elsif v_rota = 'api/notifications/catra_event' then
    -- desistência: liberou mas a pessoa não passou → desfaz o check-in
    if upper(coalesce(p_params #>> '{event,type}', p_params #>> '{event,name}', '')) like '%GIVE%' then
      select * into v_ac from public.catraca_acessos
       where device_id = v_dev.id and resultado = 'liberado' and created_at > now() - interval '2 minutes'
       order by id desc limit 1;
      if v_ac.id is not null then
        if v_ac.checkin_id is not null then
          delete from public.checkins where id = v_ac.checkin_id;
        end if;
        update public.catraca_acessos set resultado = 'desistencia', motivo = 'Liberado, mas não passou', checkin_id = null
         where id = v_ac.id;
      end if;
    end if;
    return jsonb_build_object('status', 200, 'body', null);

  elsif v_rota = 'push' then
    -- comandos enviados há mais de 2 min sem resposta voltam para a fila (até 5 tentativas)
    update public.catraca_comandos set status = case when tentativas >= 5 then 'erro' else 'pendente' end,
           resposta = case when tentativas >= 5 then 'Sem resposta da catraca' else resposta end
     where device_id = v_dev.id and status = 'enviado' and enviado_em < now() - interval '2 minutes';

    select * into v_cmd from public.catraca_comandos
     where device_id = v_dev.id and status = 'pendente'
     order by case tipo when 'liberar' then 0 when 'usuario' then 1 when 'remover' then 2 else 3 end, id
     limit 1
     for update skip locked;
    if v_cmd.id is null then
      return jsonb_build_object('status', 200, 'body', null);
    end if;
    update public.catraca_comandos set status = 'enviado', enviado_em = now(), tentativas = tentativas + 1,
           uuid = coalesce(nullif(p_params ->> 'uuid', ''), id::text)
     where id = v_cmd.id;
    if v_cmd.tipo = 'rosto' then
      select foto_path into v_foto from public.catraca_usuarios where student_id = v_cmd.student_id;
      if v_foto is null then
        update public.catraca_comandos set status = 'erro', resposta = 'Foto não encontrada', concluido_em = now() where id = v_cmd.id;
        return jsonb_build_object('status', 200, 'body', null);
      end if;
    end if;
    return jsonb_build_object('status', 200, 'body', v_cmd.payload, 'comando', v_cmd.id, 'tipo', v_cmd.tipo, 'foto_path', v_foto);

  elsif v_rota = 'result' then
    select * into v_cmd from public.catraca_comandos
     where device_id = v_dev.id and status = 'enviado'
       and (uuid = nullif(p_params ->> 'uuid', '') or nullif(p_params ->> 'uuid', '') is null)
     order by enviado_em desc limit 1;
    if v_cmd.id is null then
      return jsonb_build_object('status', 200, 'body', null);
    end if;

    v_ok := nullif(p_params ->> 'error', '') is null;
    -- a resposta do aparelho vem como texto JSON
    begin
      v_resp := (p_params ->> 'response')::jsonb;
    exception when others then
      v_resp := null;
    end;
    if v_cmd.tipo = 'rosto' then
      v_ok := v_ok and coalesce((v_resp #>> '{results,0,success}')::boolean, (v_resp ->> 'success')::boolean, false);
      v_err := coalesce(v_resp #> '{results,0,errors,0}', v_resp #> '{errors,0}');
      select foto_path into v_foto from public.catraca_usuarios where student_id = v_cmd.student_id;
      update public.catraca_usuarios
         set face_status = case when v_ok then 'ok' else 'erro' end,
             face_erro = case when v_ok then null
                              else coalesce(public._catraca_erro_rosto((v_err ->> 'code')::int, v_err ->> 'message'),
                                            nullif(p_params ->> 'error', ''), 'Erro no cadastro do rosto') end,
             face_em = now(),
             -- foto sai do sistema quando não há mais envio pendente dela (LGPD)
             foto_path = case when exists (select 1 from public.catraca_comandos c
                                            where c.student_id = v_cmd.student_id and c.tipo = 'rosto'
                                              and c.status in ('pendente', 'enviado') and c.id <> v_cmd.id)
                              then foto_path else null end,
             updated_at = now()
       where student_id = v_cmd.student_id;
      v_tipo := 'rosto';
    end if;

    update public.catraca_comandos
       set status = case when v_ok then 'ok' else 'erro' end,
           resposta = left(coalesce(nullif(p_params ->> 'error', ''), p_params ->> 'response', ''), 2000),
           concluido_em = now()
     where id = v_cmd.id;

    return jsonb_build_object('status', 200, 'body', null,
      'apagar_foto', case when v_tipo = 'rosto'
                            and not exists (select 1 from public.catraca_usuarios where student_id = v_cmd.student_id and foto_path is not null)
                          then v_foto end);
  end if;

  return jsonb_build_object('status', 404, 'body', jsonb_build_object('error', 'rota desconhecida: ' || v_rota));
end $$;
revoke execute on function public.catraca_request(text, text, jsonb) from public, anon, authenticated;
do $$
begin
  execute 'grant execute on function public.catraca_request(text, text, jsonb) to service_role';
exception when undefined_object then
  null; -- ambiente sem o papel service_role (testes)
end $$;

-- ---------------------------------------------------------------------
-- Painel do Super Admin: equipamentos de todas as academias
-- ---------------------------------------------------------------------
create or replace function public.catraca_equipamentos()
returns table (
  id uuid, academy_id uuid, academia text, nome text, sentido text, modelo text, firmware text,
  ativo boolean, ultimo_sinal timestamptz, fila integer, erros integer, acessos_hoje integer
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  return query
  select d.id, d.academy_id, a.nome, d.nome, d.sentido, d.modelo, d.firmware, d.ativo, d.ultimo_sinal,
         (select count(*)::int from public.catraca_comandos c where c.device_id = d.id and c.status in ('pendente', 'enviado')),
         (select count(*)::int from public.catraca_comandos c where c.device_id = d.id and c.status = 'erro'
             and c.concluido_em > now() - interval '1 day'),
         (select count(*)::int from public.catraca_acessos x where x.device_id = d.id
             and x.created_at >= (public._today()::timestamp at time zone 'America/Sao_Paulo'))
    from public.catraca_devices d
    join public.academies a on a.id = d.academy_id
   order by a.nome, d.nome;
end $$;

-- acessos em tempo real na tela da academia
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'catraca_acessos') then
    execute 'alter publication supabase_realtime add table public.catraca_acessos';
  end if;
end $$;

notify pgrst, 'reload schema';
