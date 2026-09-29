import { toISODate } from '../utils/formatters'
import { nowISO, supabase, unwrap } from './supabaseClient'

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
