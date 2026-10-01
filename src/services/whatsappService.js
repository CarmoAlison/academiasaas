import { supabase, unwrap } from './supabaseClient'

const PAYMENT_FIELDS = 'id, student_id, descricao, valor, vencimento, pago_em, status, situacao, recibo_numero, aluno_nome, aluno_telefone, plano_nome'

/**
 * Fila de mensagens do financeiro.
 * @param {'lembrete'|'atraso'|'recibo'} tipo
 * @param {{ hoje: string, diasLembrete: number, desdeRecibo: string, ateLembrete: string }} p
 */
export function listPaymentQueue(academyId, tipo, { hoje, ateLembrete, desdeRecibo }) {
  let q = supabase.from('v_payments').select(PAYMENT_FIELDS).eq('academy_id', academyId)
  if (tipo === 'lembrete') q = q.eq('status', 'pendente').gte('vencimento', hoje).lte('vencimento', ateLembrete).order('vencimento')
  if (tipo === 'atraso') q = q.eq('status', 'pendente').lt('vencimento', hoje).order('vencimento')
  if (tipo === 'recibo') q = q.eq('status', 'pago').gte('pago_em', desdeRecibo).order('pago_em', { ascending: false })
  return unwrap(q.limit(300))
}

/** Último envio por cobrança/aluno para os tipos informados → { [chave]: created_at } */
export async function lastSent(academyId, tipo, { paymentIds = [], studentIds = [] }) {
  if (!paymentIds.length && !studentIds.length) return {}
  let q = supabase.from('whatsapp_logs').select('payment_id, student_id, created_at').eq('academy_id', academyId).eq('tipo', tipo)
  q = paymentIds.length ? q.in('payment_id', paymentIds) : q.in('student_id', studentIds)
  const rows = await unwrap(q.order('created_at', { ascending: false }).limit(1000))
  const map = {}
  for (const r of rows ?? []) {
    const key = r.payment_id ?? r.student_id
    if (!map[key]) map[key] = r.created_at
  }
  return map
}

/** Registra que a mensagem foi aberta no WhatsApp */
export const logWhatsapp = (academyId, { studentId = null, paymentId = null, tipo, telefone, mensagem }) =>
  unwrap(
    supabase.from('whatsapp_logs').insert({
      academy_id: academyId,
      student_id: studentId,
      payment_id: paymentId,
      tipo,
      telefone,
      mensagem,
    }),
  )
