-- =====================================================================
-- SaaS Academia — SEED
-- Executar por último. Pode ser executado mais de uma vez (idempotente).
--
-- Usuários criados (login = CPF · senha = 6 primeiros dígitos):
--   Super Admin ........ CPF 123.456.789-09  senha 123456
--   Admin (demo) ....... CPF 111.444.777-35  senha 111444
--   Instrutor (demo) ... CPF 390.533.447-05  senha 390533
--   Aluno (demo) ....... CPF 529.982.247-25  senha 529982
-- TROQUE A SENHA DO SUPER ADMIN NO PRIMEIRO ACESSO.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Permissões globais (recurso.ação)
-- ---------------------------------------------------------------------
insert into public.permissions (recurso, acao, descricao)
select r.recurso, a.acao, initcap(a.acao) || ' ' || r.label
  from (values
    ('alunos', 'alunos'), ('treinos', 'treinos'), ('aulas', 'aulas'),
    ('planos', 'planos'), ('unidades', 'unidades'), ('financeiro', 'financeiro'),
    ('equipe', 'equipe'), ('perfis', 'perfis de acesso')
  ) as r(recurso, label)
  cross join (values ('ver'), ('criar'), ('editar'), ('excluir')) as a(acao)
on conflict (recurso, acao) do nothing;

insert into public.permissions (recurso, acao, descricao) values
  ('dashboard',  'ver',      'Ver dashboard'),
  ('financeiro', 'exportar', 'Exportar financeiro (CSV)'),
  ('auditoria',  'ver',      'Ver auditoria e logs')
on conflict (recurso, acao) do nothing;

-- ---------------------------------------------------------------------
-- Configurações do SaaS
-- ---------------------------------------------------------------------
insert into public.saas_settings (id, dados)
values (1, '{"nome": "Academia SaaS", "email_suporte": "suporte@academiasaas.com", "telefone": "", "dias_vencimento": 10}'::jsonb)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Planos SaaS
-- ---------------------------------------------------------------------
insert into public.saas_plans (nome, descricao, valor, limite_alunos)
select * from (values
  ('Starter',  'Até 100 alunos, 1 unidade',       149.90, 100),
  ('Pro',      'Até 500 alunos, múltiplas unidades', 299.90, 500),
  ('Business', 'Alunos ilimitados',                 599.90, null::integer)
) as v(nome, descricao, valor, limite_alunos)
where not exists (select 1 from public.saas_plans);

-- ---------------------------------------------------------------------
-- Super Admin
-- ---------------------------------------------------------------------
do $$
declare
  v_user uuid;
begin
  v_user := public._ensure_auth_user('12345678909', 'Super Admin');
  insert into public.super_admins (user_id, nome, cpf, email)
  values (v_user, 'Super Admin', '12345678909', null)
  on conflict (user_id) do nothing;
end $$;

-- ---------------------------------------------------------------------
-- Academia demo com dados de exemplo
-- ---------------------------------------------------------------------
do $$
declare
  v_academy   uuid;
  v_unit      uuid;
  v_plan_m    uuid;
  v_plan_t    uuid;
  v_role_inst uuid;
  v_role_aluno uuid;
  v_prof      uuid;
  v_aluno_p   uuid;
  v_student   uuid;
  v_workout   uuid;
  v_ex        uuid[];
  v_today     date := public._today();
begin
  if exists (select 1 from public.academies where nome = 'Academia Demo') then
    return;
  end if;

  v_academy := public._create_academy(
    'Academia Demo', '11222333000181',
    (select id from public.saas_plans where nome = 'Pro' limit 1),
    'Admin Demo', '11144477735', '11999990000', 'Unidade Centro'
  );

  select id into v_unit from public.units where academy_id = v_academy limit 1;
  update public.units set endereco = 'Av. Paulista, 1000', cidade = 'São Paulo', estado = 'SP', cep = '01310100'
   where id = v_unit;

  insert into public.plans (academy_id, nome, descricao, valor, duracao_meses)
  values (v_academy, 'Mensal', 'Acesso livre à musculação', 119.90, 1)
  returning id into v_plan_m;
  insert into public.plans (academy_id, nome, descricao, valor, duracao_meses)
  values (v_academy, 'Trimestral', 'Musculação + aulas coletivas', 329.90, 3)
  returning id into v_plan_t;

  -- Instrutor
  select id into v_role_inst from public.roles where academy_id = v_academy and slug = 'instrutor';
  v_prof := public._create_member(v_academy, 'Carlos Instrutor', '39053344705', '11988887777', null, v_role_inst);
  insert into public.role_permissions (role_id, permission_id)
  select v_role_inst, id from public.permissions
   where recurso || '.' || acao in ('dashboard.ver', 'alunos.ver', 'treinos.ver', 'treinos.criar', 'treinos.editar', 'aulas.ver');

  -- Aluno
  select id into v_role_aluno from public.roles where academy_id = v_academy and slug = 'aluno';
  v_aluno_p := public._create_member(v_academy, 'Maria Aluna', '52998224725', '11977776666', 'maria@exemplo.com', v_role_aluno);
  insert into public.students (academy_id, profile_id, unit_id, plan_id, data_matricula, data_nascimento, cidade, estado)
  values (v_academy, v_aluno_p, v_unit, v_plan_m, v_today - 45, '1995-04-12', 'São Paulo', 'SP')
  returning id into v_student;

  -- Exercícios
  with ins as (
    insert into public.exercises (academy_id, nome, grupo_muscular, instrucoes)
    values
      (v_academy, 'Supino reto',        'Peito',   'Desça a barra até o peito controlando o movimento.'),
      (v_academy, 'Agachamento livre',  'Pernas',  'Mantenha a coluna neutra e desça até 90°.'),
      (v_academy, 'Remada curvada',     'Costas',  'Tronco inclinado, puxe a barra em direção ao abdômen.'),
      (v_academy, 'Desenvolvimento',    'Ombros',  'Empurre os halteres acima da cabeça.'),
      (v_academy, 'Rosca direta',       'Bíceps',  'Cotovelos fixos ao lado do corpo.'),
      (v_academy, 'Tríceps corda',      'Tríceps', 'Estenda os cotovelos abrindo a corda no final.')
    returning id
  )
  select array_agg(id) into v_ex from ins;

  insert into public.workouts (academy_id, student_id, professor_id, nome, objetivo, data_inicio, data_fim)
  values (v_academy, v_student, v_prof, 'Treino A — Full body', 'Hipertrofia', v_today - 7, v_today + 53)
  returning id into v_workout;

  insert into public.workout_exercises (academy_id, workout_id, exercise_id, series, repeticoes, carga, descanso, ordem)
  select v_academy, v_workout, v_ex[i], 3 + (i % 2), '10-12', (10 * i)::text || ' kg', '60s', i
    from generate_series(1, array_length(v_ex, 1)) i;

  -- Aulas
  insert into public.classes (academy_id, nome, descricao, professor_id, unit_id, horario, capacidade, dias_semana)
  values
    (v_academy, 'Spinning',  'Aula de bike indoor',   v_prof, v_unit, '07:00', 15, '{1,3,5}'),
    (v_academy, 'Funcional', 'Treino funcional em grupo', v_prof, v_unit, '18:30', 20, '{2,4}'),
    (v_academy, 'Yoga',      'Alongamento e respiração',  v_prof, v_unit, '09:00', 12, '{6}');

  -- Pagamentos
  insert into public.payments (academy_id, student_id, plan_id, descricao, valor, vencimento, pago_em, forma_pagamento, status)
  values
    (v_academy, v_student, v_plan_m, 'Mensalidade', 119.90, v_today - 40, now() - interval '40 days', 'pix', 'pago'),
    (v_academy, v_student, v_plan_m, 'Mensalidade', 119.90, v_today - 10, null, null, 'pendente'),
    (v_academy, v_student, v_plan_m, 'Mensalidade', 119.90, v_today + 20, null, null, 'pendente');
end $$;
