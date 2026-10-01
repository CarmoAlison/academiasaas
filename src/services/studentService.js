import { onlyDigits } from '../utils/formatters'
import { applySearch, applySort, pageRange } from './paging'
import { nowISO, supabase, unwrap, unwrapWithCount } from './supabaseClient'

const SELECT = `
  id, academy_id, profile_id, unit_id, plan_id, data_matricula, status, data_nascimento, responsavel,
  endereco, cidade, estado, cep, observacoes, created_at,
  profile:profiles(id, user_id, nome, cpf, telefone, email_contato, avatar_url, status, must_change_password),
  plan:plans(id, nome, valor),
  unit:units(id, nome)
`

const PROFILE_FIELDS = ['nome', 'telefone', 'email_contato']
const STUDENT_FIELDS = [
  'unit_id', 'plan_id', 'data_matricula', 'status', 'data_nascimento', 'responsavel',
  'endereco', 'cidade', 'estado', 'cep', 'observacoes',
]

const pick = (obj, keys) =>
  Object.fromEntries(keys.map((k) => [k, obj[k] === '' || obj[k] === undefined ? null : obj[k]]))

const normalize = (values) => ({
  ...values,
  cpf: onlyDigits(values.cpf),
  telefone: onlyDigits(values.telefone),
  cep: onlyDigits(values.cep),
})

const STUDENT_SORT = {
  nome: 'nome',
  cpf: 'cpf',
  telefone: 'telefone',
  plano_nome: 'plano_nome',
  data_matricula: 'data_matricula',
  status: 'status',
}

/** Monta a consulta de alunos (view v_students) com busca e filtros */
function studentsQuery(academyId, { search = '', filters = {} } = {}, options) {
  let query = supabase.from('v_students').select('*', options).eq('academy_id', academyId)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.plan_id) query = query.eq('plan_id', filters.plan_id)
  if (filters.unit_id) query = query.eq('unit_id', filters.unit_id)
  return applySearch(query, search, { text: ['nome', 'email_contato'], digits: ['cpf', 'telefone'] })
}

/**
 * Página de alunos (paginação, busca e ordenação no servidor)
 * @returns {Promise<{ data: object[], count: number }>}
 */
export function listStudentsPage(academyId, { page, pageSize, search, sort, filters }) {
  const query = applySort(studentsQuery(academyId, { search, filters }, { count: 'exact' }), sort, STUDENT_SORT, {
    column: 'created_at',
    ascending: false,
  })
  return unwrapWithCount(query.range(...pageRange(page, pageSize)))
}

/** Todos os alunos do filtro atual (exportação CSV), até 10 mil */
export const exportStudents = (academyId, { search, filters }) =>
  unwrap(studentsQuery(academyId, { search, filters }).order('nome').limit(10000))

/** @param {string} academyId */
export const listStudents = (academyId) =>
  unwrap(
    supabase
      .from('students')
      .select(SELECT)
      .eq('academy_id', academyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  )

/** Lista enxuta para selects (id + nome) */
export async function listStudentOptions(academyId) {
  const rows = await unwrap(
    supabase
      .from('students')
      .select('id, status, profile:profiles(nome)')
      .eq('academy_id', academyId)
      .is('deleted_at', null),
  )
  return rows
    .map((s) => ({ value: s.id, label: s.profile?.nome ?? '—', status: s.status }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export const getStudent = (id) =>
  unwrap(supabase.from('students').select(SELECT).eq('id', id).is('deleted_at', null).single())

/**
 * Cria usuário Auth (CPF) + profile + aluno via RPC
 * @param {string} academyId
 * @param {object} values campos do formulário
 */
export function createStudent(academyId, values) {
  const v = normalize(values)
  return unwrap(
    supabase.rpc('create_student', {
      p_academy: academyId,
      p_profile: { ...pick(v, PROFILE_FIELDS), cpf: v.cpf },
      p_student: pick(v, STUDENT_FIELDS),
    }),
  )
}

/** @param {{ id: string, profile_id: string }} student @param {object} values */
export async function updateStudent(student, values) {
  const v = normalize(values)
  await unwrap(supabase.from('profiles').update(pick(v, PROFILE_FIELDS)).eq('id', student.profile_id))
  await unwrap(supabase.from('students').update(pick(v, STUDENT_FIELDS)).eq('id', student.id))
}

/** Soft delete do aluno e do seu profile */
export async function removeStudent(student) {
  const deleted_at = nowISO()
  await unwrap(supabase.from('students').update({ deleted_at, status: 'inativo' }).eq('id', student.id))
  await unwrap(supabase.from('profiles').update({ deleted_at, status: 'inativo' }).eq('id', student.profile_id))
}

/** Aluno logado: dados do próprio cadastro */
export const getMyStudent = (studentId) => getStudent(studentId)
