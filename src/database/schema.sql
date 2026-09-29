-- =====================================================================
-- SaaS Academia — SCHEMA
-- Ordem de execução no SQL Editor do Supabase:
--   1. schema.sql  2. functions.sql  3. rls.sql  4. triggers.sql  5. seed.sql
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- GLOBAIS
-- ---------------------------------------------------------------------

create table if not exists public.saas_plans (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  descricao     text,
  valor         numeric(12,2) not null default 0,
  limite_alunos integer,
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create table if not exists public.academies (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  cnpj         text check (cnpj is null or cnpj ~ '^\d{14}$'),
  email        text,
  telefone     text,
  logo_url     text,
  saas_plan_id uuid references public.saas_plans(id),
  status       text not null default 'ativa' check (status in ('ativa', 'inativa', 'suspensa')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create unique index if not exists academies_cnpj_uk on public.academies (cnpj)
  where deleted_at is null and cnpj is not null;

create table if not exists public.super_admins (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null unique references auth.users(id) on delete cascade,
  nome                 text not null,
  cpf                  text not null unique check (cpf ~ '^\d{11}$'),
  email                text,
  must_change_password boolean not null default true,
  created_at           timestamptz not null default now()
);

create table if not exists public.permissions (
  id        uuid primary key default gen_random_uuid(),
  recurso   text not null,
  acao      text not null,
  descricao text,
  unique (recurso, acao)
);

create table if not exists public.saas_invoices (
  id           uuid primary key default gen_random_uuid(),
  academy_id   uuid not null references public.academies(id),
  saas_plan_id uuid references public.saas_plans(id),
  valor        numeric(12,2) not null,
  competencia  date not null,
  vencimento   date not null,
  pago_em      timestamptz,
  status       text not null default 'pendente' check (status in ('pendente', 'pago', 'cancelado')),
  created_at   timestamptz not null default now(),
  unique (academy_id, competencia)
);

create table if not exists public.saas_settings (
  id         integer primary key default 1 check (id = 1),
  dados      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- POR ACADEMIA
-- ---------------------------------------------------------------------

create table if not exists public.profiles (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  academy_id           uuid not null references public.academies(id),
  nome                 text not null,
  cpf                  text not null check (cpf ~ '^\d{11}$'),
  email_fake           text not null,
  email_contato        text,
  telefone             text,
  avatar_url           text,
  status               text not null default 'ativo' check (status in ('ativo', 'inativo')),
  must_change_password boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz
);
-- CPF único por academia (a mesma pessoa pode estar em várias academias)
create unique index if not exists profiles_academy_cpf_uk on public.profiles (academy_id, cpf) where deleted_at is null;
create unique index if not exists profiles_academy_user_uk on public.profiles (academy_id, user_id) where deleted_at is null;
create index if not exists profiles_user_idx on public.profiles (user_id);

create table if not exists public.roles (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null references public.academies(id),
  nome        text not null,
  descricao   text,
  slug        text,               -- 'admin' | 'instrutor' | 'recepcao' | 'aluno' para perfis do sistema
  is_system   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (id, academy_id)
);
create unique index if not exists roles_academy_nome_uk on public.roles (academy_id, lower(nome)) where deleted_at is null;
create unique index if not exists roles_academy_slug_uk on public.roles (academy_id, slug) where deleted_at is null and slug is not null;

create table if not exists public.role_permissions (
  role_id       uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table if not exists public.user_roles (
  user_id    uuid not null references auth.users(id) on delete cascade,
  role_id    uuid not null,
  academy_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id),
  foreign key (role_id, academy_id) references public.roles(id, academy_id) on delete cascade
);
create index if not exists user_roles_academy_idx on public.user_roles (academy_id, user_id);

create table if not exists public.units (
  id         uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id),
  nome       text not null,
  endereco   text,
  cidade     text,
  estado     text,
  cep        text,
  telefone   text,
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists units_academy_idx on public.units (academy_id);

create table if not exists public.plans (
  id             uuid primary key default gen_random_uuid(),
  academy_id     uuid not null references public.academies(id),
  nome           text not null,
  descricao      text,
  valor          numeric(12,2) not null default 0,
  duracao_meses  integer not null default 1 check (duracao_meses > 0),
  ativo          boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create index if not exists plans_academy_idx on public.plans (academy_id);

create table if not exists public.students (
  id              uuid primary key default gen_random_uuid(),
  academy_id      uuid not null references public.academies(id),
  profile_id      uuid not null unique references public.profiles(id),
  unit_id         uuid references public.units(id),
  plan_id         uuid references public.plans(id),
  data_matricula  date not null default current_date,
  status          text not null default 'ativo' check (status in ('ativo', 'inativo', 'trancado')),
  data_nascimento date,
  responsavel     text,
  endereco        text,
  cidade          text,
  estado          text,
  cep             text,
  observacoes     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index if not exists students_academy_idx on public.students (academy_id, status);

create table if not exists public.exercises (
  id             uuid primary key default gen_random_uuid(),
  academy_id     uuid not null references public.academies(id),
  nome           text not null,
  grupo_muscular text,
  video_url      text,
  instrucoes     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create index if not exists exercises_academy_idx on public.exercises (academy_id);

create table if not exists public.workouts (
  id           uuid primary key default gen_random_uuid(),
  academy_id   uuid not null references public.academies(id),
  student_id   uuid not null references public.students(id),
  professor_id uuid references public.profiles(id),
  nome         text not null,
  objetivo     text,
  data_inicio  date,
  data_fim     date,
  ativo        boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index if not exists workouts_academy_idx on public.workouts (academy_id, student_id);

create table if not exists public.workout_exercises (
  id          uuid primary key default gen_random_uuid(),
  academy_id  uuid not null references public.academies(id),
  workout_id  uuid not null references public.workouts(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id),
  series      integer,
  repeticoes  text,
  carga       text,
  descanso    text,
  ordem       integer not null default 0
);
create index if not exists workout_exercises_workout_idx on public.workout_exercises (workout_id, ordem);

create table if not exists public.workout_logs (
  id           uuid primary key default gen_random_uuid(),
  academy_id   uuid not null references public.academies(id),
  workout_id   uuid not null references public.workouts(id) on delete cascade,
  student_id   uuid not null references public.students(id),
  concluido_em timestamptz not null default now()
);
create index if not exists workout_logs_student_idx on public.workout_logs (student_id, concluido_em desc);

create table if not exists public.classes (
  id           uuid primary key default gen_random_uuid(),
  academy_id   uuid not null references public.academies(id),
  nome         text not null,
  descricao    text,
  professor_id uuid references public.profiles(id),
  unit_id      uuid references public.units(id),
  horario      time not null,
  duracao_min  integer not null default 60,
  capacidade   integer not null default 20 check (capacidade > 0),
  dias_semana  smallint[] not null default '{}', -- 0 = domingo ... 6 = sábado
  ativo        boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index if not exists classes_academy_idx on public.classes (academy_id);

create table if not exists public.class_bookings (
  id         uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.academies(id),
  class_id   uuid not null references public.classes(id),
  student_id uuid not null references public.students(id),
  data       date not null,
  status     text not null default 'reservado' check (status in ('reservado', 'cancelado', 'presente', 'falta')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, student_id, data)
);
create index if not exists class_bookings_class_idx on public.class_bookings (class_id, data);

create table if not exists public.payments (
  id              uuid primary key default gen_random_uuid(),
  academy_id      uuid not null references public.academies(id),
  student_id      uuid not null references public.students(id),
  plan_id         uuid references public.plans(id),
  descricao       text,
  valor           numeric(12,2) not null,
  vencimento      date not null,
  pago_em         timestamptz,
  forma_pagamento text,
  status          text not null default 'pendente' check (status in ('pendente', 'pago', 'cancelado')),
  recibo_numero   integer,          -- sequencial por academia, gerado ao quitar (trigger payments_receipt)
  recebido_por    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index if not exists payments_academy_idx on public.payments (academy_id, status, vencimento);
create index if not exists payments_student_idx on public.payments (student_id);
create unique index if not exists payments_recibo_uk on public.payments (academy_id, recibo_numero)
  where recibo_numero is not null;

-- Personalização do recibo (uma linha por academia; ausente = padrão)
create table if not exists public.receipt_settings (
  academy_id        uuid primary key references public.academies(id) on delete cascade,
  logo_url          text,
  cor               text not null default '#006EB8' check (cor ~ '^#[0-9A-Fa-f]{6}$'),
  estilo            text not null default 'moderno' check (estilo in ('moderno', 'classico')),
  titulo            text not null default 'Recibo de pagamento',
  mensagem          text default 'Obrigado por treinar conosco!',
  rodape            text,
  cidade            text,
  exibir_cnpj       boolean not null default true,
  exibir_endereco   boolean not null default true,
  exibir_contato    boolean not null default true,
  exibir_assinatura boolean not null default true,
  exibir_selo       boolean not null default true,
  assinatura_nome   text,
  assinatura_cargo  text default 'Responsável financeiro',
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- AUDITORIA / LOGS
-- ---------------------------------------------------------------------

create table if not exists public.audit_logs (
  id           bigint generated always as identity primary key,
  academy_id   uuid references public.academies(id) on delete set null,
  user_id      uuid,
  user_nome    text,
  acao         text not null,          -- insert | update | delete | soft_delete
  tabela       text not null,
  registro_id  text,
  dados_antes  jsonb,
  dados_depois jsonb,
  ip           text,
  created_at   timestamptz not null default now()
);
create index if not exists audit_logs_academy_idx on public.audit_logs (academy_id, created_at desc);
create index if not exists audit_logs_tabela_idx on public.audit_logs (tabela, created_at desc);

create table if not exists public.access_logs (
  id          bigint generated always as identity primary key,
  academy_id  uuid references public.academies(id) on delete set null,
  user_id     uuid,
  user_nome   text,
  evento      text not null default 'login' check (evento in ('login', 'logout')),
  ip          text,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index if not exists access_logs_academy_idx on public.access_logs (academy_id, created_at desc);

create table if not exists public.errors (
  id          bigint generated always as identity primary key,
  academy_id  uuid references public.academies(id) on delete set null,
  user_id     uuid,
  user_nome   text,
  mensagem    text not null,
  stack       text,
  rota        text,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index if not exists errors_academy_idx on public.errors (academy_id, created_at desc);

-- ---------------------------------------------------------------------
-- STORAGE (avatars)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true), ('academy-assets', 'academy-assets', true)
on conflict (id) do nothing;
