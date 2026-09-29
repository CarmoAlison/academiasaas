export const CPF_EMAIL_DOMAIN = 'academia.internal'
export const TENANT_STORAGE_KEY = 'academia.tenant'
export const THEME_STORAGE_KEY = 'academia.theme' // lido também pelo script inline do index.html

/** Áreas do sistema */
export const AREAS = {
  SUPER_ADMIN: 'super_admin',
  STAFF: 'staff',
  STUDENT: 'student',
}

export const ROLE_SLUGS = {
  ADMIN: 'admin',
  INSTRUTOR: 'instrutor',
  RECEPCAO: 'recepcao',
  ALUNO: 'aluno',
}

/** Recursos da matriz de permissões (ordem de exibição) */
export const RESOURCES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'alunos', label: 'Alunos' },
  { key: 'treinos', label: 'Treinos' },
  { key: 'aulas', label: 'Aulas' },
  { key: 'planos', label: 'Planos' },
  { key: 'unidades', label: 'Unidades' },
  { key: 'financeiro', label: 'Financeiro' },
  { key: 'equipe', label: 'Equipe' },
  { key: 'perfis', label: 'Perfis de acesso' },
  { key: 'auditoria', label: 'Auditoria' },
]

export const ACTIONS = [
  { key: 'ver', label: 'Ver' },
  { key: 'criar', label: 'Criar' },
  { key: 'editar', label: 'Editar' },
  { key: 'excluir', label: 'Excluir' },
  { key: 'exportar', label: 'Exportar' },
]

export const STUDENT_STATUS = [
  { value: 'ativo', label: 'Ativo' },
  { value: 'inativo', label: 'Inativo' },
  { value: 'trancado', label: 'Trancado' },
]

export const PAYMENT_STATUS = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'pago', label: 'Pago' },
  { value: 'cancelado', label: 'Cancelado' },
]

export const PAYMENT_METHODS = [
  { value: 'pix', label: 'Pix' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'cartao_credito', label: 'Cartão de crédito' },
  { value: 'cartao_debito', label: 'Cartão de débito' },
  { value: 'boleto', label: 'Boleto' },
]

export const ACADEMY_STATUS = [
  { value: 'ativa', label: 'Ativa' },
  { value: 'inativa', label: 'Inativa' },
  { value: 'suspensa', label: 'Suspensa' },
]

export const WEEKDAYS = [
  { value: 0, label: 'Domingo', short: 'Dom' },
  { value: 1, label: 'Segunda', short: 'Seg' },
  { value: 2, label: 'Terça', short: 'Ter' },
  { value: 3, label: 'Quarta', short: 'Qua' },
  { value: 4, label: 'Quinta', short: 'Qui' },
  { value: 5, label: 'Sexta', short: 'Sex' },
  { value: 6, label: 'Sábado', short: 'Sáb' },
]

export const MUSCLE_GROUPS = [
  'Peito', 'Costas', 'Ombros', 'Bíceps', 'Tríceps', 'Antebraço',
  'Pernas', 'Glúteos', 'Panturrilha', 'Abdômen', 'Cardio', 'Corpo inteiro',
]

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

export const AUDIT_ACTIONS = [
  { value: 'insert', label: 'Criação' },
  { value: 'update', label: 'Alteração' },
  { value: 'soft_delete', label: 'Exclusão' },
  { value: 'delete', label: 'Exclusão definitiva' },
]

export const AUDIT_TABLES = [
  { value: 'students', label: 'Alunos' },
  { value: 'profiles', label: 'Usuários' },
  { value: 'workouts', label: 'Treinos' },
  { value: 'workout_exercises', label: 'Itens de treino' },
  { value: 'exercises', label: 'Exercícios' },
  { value: 'classes', label: 'Aulas' },
  { value: 'class_bookings', label: 'Reservas' },
  { value: 'plans', label: 'Planos' },
  { value: 'units', label: 'Unidades' },
  { value: 'payments', label: 'Pagamentos' },
  { value: 'roles', label: 'Perfis de acesso' },
  { value: 'role_permissions', label: 'Permissões' },
  { value: 'user_roles', label: 'Vínculos de perfil' },
  { value: 'academies', label: 'Academias' },
  { value: 'saas_plans', label: 'Planos SaaS' },
  { value: 'saas_invoices', label: 'Faturas SaaS' },
  { value: 'super_admins', label: 'Super admins' },
  { value: 'saas_settings', label: 'Configurações' },
]
