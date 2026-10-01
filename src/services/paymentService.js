import { toISODate } from '../utils/formatters'
import { applySearch, applySort, pageRange } from './paging'
import { nowISO, supabase, unwrap, unwrapWithCount } from './supabaseClient'

const PAYMENT_SORT = {
  aluno_nome: 'aluno_nome',
  valor: 'valor',
  vencimento: 'vencimento',
  situacao: 'situacao',
  pago_em: 'pago_em',
  descricao: 'descricao',
}

/** Consulta de pagamentos (view v_payments) com período, situação e busca */
function paymentsQuery(academyId, { search = '', filters = {} } = {}, options) {
  let query = supabase.from('v_payments').select('*', options).eq('academy_id', academyId)
  if (filters.de) query = query.gte('vencimento', filters.de)
  if (filters.ate) query = query.lte('vencimento', filters.ate)
  if (filters.situacao) query = query.eq('situacao', filters.situacao)
  if (filters.student_id) query = query.eq('student_id', filters.student_id)
  return applySearch(query, search, { text: ['aluno_nome', 'descricao'], digits: ['aluno_cpf'] })
}

/** Página de pagamentos (paginação, busca e ordenação no servidor) */
export function listPaymentsPage(academyId, { page, pageSize, search, sort, filters }) {
  const query = applySort(paymentsQuery(academyId, { search, filters }, { count: 'exact' }), sort, PAYMENT_SORT, {
    column: 'vencimento',
    ascending: true,
  })
  return unwrapWithCount(query.range(...pageRange(page, pageSize)))
}

/** Pagamentos do filtro atual para exportação (até 10 mil) */
export const exportPayments = (academyId, { search, filters }) =>
  unwrap(paymentsQuery(academyId, { search, filters }).order('vencimento').limit(10000))

/** Totais do período (cards do financeiro), calculados no banco */
export const paymentsSummary = (academyId, de, ate) =>
  unwrap(supabase.rpc('payments_summary', { p_academy: academyId, p_de: de, p_ate: ate }))

/** Últimos pagamentos de um aluno (painel lateral do cadastro) */
export const listStudentPaymentsAdmin = (academyId, studentId, limit = 5) =>
  unwrap(
    paymentsQuery(academyId, { filters: { student_id: studentId } })
      .order('vencimento', { ascending: false })
      .limit(limit),
  )

const SELECT = `
  id, academy_id, student_id, plan_id, descricao, valor, vencimento, pago_em, forma_pagamento, status, recibo_numero, created_at,
  student:students(id, profile:profiles(nome, cpf)),
  plan:plans(id, nome)
`

/**
 * @param {string} academyId
 * @param {{ de?: string, ate?: string, status?: string }} [filters] período de vencimento / status
 */
export function listPayments(academyId, filters = {}) {
  let query = supabase.from('payments').select(SELECT).eq('academy_id', academyId).is('deleted_at', null)
  if (filters.de) query = query.gte('vencimento', filters.de)
  if (filters.ate) query = query.lte('vencimento', filters.ate)
  if (filters.status) query = query.eq('status', filters.status)
  return unwrap(query.order('vencimento', { ascending: false }))
}

export const createPayment = (academyId, values) =>
  unwrap(
    supabase.from('payments').insert({
      academy_id: academyId,
      student_id: values.student_id,
      plan_id: values.plan_id || null,
      descricao: values.descricao || 'Mensalidade',
      valor: Number(values.valor),
      vencimento: values.vencimento,
      status: 'pendente',
    }),
  )

export const markPaid = (id, forma) =>
  unwrap(supabase.from('payments').update({ status: 'pago', pago_em: nowISO(), forma_pagamento: forma }).eq('id', id))

export const reopenPayment = (id) =>
  unwrap(supabase.from('payments').update({ status: 'pendente', pago_em: null, forma_pagamento: null }).eq('id', id))

export const cancelPayment = (id) => unwrap(supabase.from('payments').update({ status: 'cancelado' }).eq('id', id))

export const removePayment = (id) => unwrap(supabase.from('payments').update({ deleted_at: nowISO() }).eq('id', id))

/**
 * Gera cobranças do mês para alunos ativos com plano (ignora quem já tem cobrança no mês).
 * @param {string} academyId
 * @param {string} vencimento YYYY-MM-DD
 * @returns {Promise<number>} quantidade criada
 */
export async function generateMonthlyCharges(academyId, vencimento) {
  const [y, m] = vencimento.split('-').map(Number)
  const inicio = toISODate(new Date(y, m - 1, 1))
  const fim = toISODate(new Date(y, m, 0))

  const students = await unwrap(
    supabase
      .from('students')
      .select('id, plan:plans(id, valor, ativo)')
      .eq('academy_id', academyId)
      .eq('status', 'ativo')
      .is('deleted_at', null)
      .not('plan_id', 'is', null),
  )
  const existing = await unwrap(
    supabase
      .from('payments')
      .select('student_id')
      .eq('academy_id', academyId)
      .is('deleted_at', null)
      .neq('status', 'cancelado')
      .gte('vencimento', inicio)
      .lte('vencimento', fim),
  )
  const already = new Set(existing.map((p) => p.student_id))
  const rows = students
    .filter((s) => s.plan && !already.has(s.id))
    .map((s) => ({
      academy_id: academyId,
      student_id: s.id,
      plan_id: s.plan.id,
      descricao: 'Mensalidade',
      valor: s.plan.valor,
      vencimento,
      status: 'pendente',
    }))
  if (rows.length) await unwrap(supabase.from('payments').insert(rows))
  return rows.length
}

/** Área do aluno */
export const listStudentPayments = (studentId) =>
  unwrap(
    supabase
      .from('payments')
      .select('id, descricao, valor, vencimento, pago_em, forma_pagamento, status, recibo_numero, plan:plans(nome)')
      .eq('student_id', studentId)
      .is('deleted_at', null)
      .neq('status', 'cancelado')
      .order('vencimento', { ascending: false }),
  )
