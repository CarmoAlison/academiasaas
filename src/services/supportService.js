import { supabase, unwrap } from './supabaseClient'

const FIELDS =
  'id, numero, academy_id, assunto, categoria, prioridade, status, aberto_por_nome, responsavel, lido_academia, lido_suporte, ultima_msg_em, created_at, academy:academies(id, nome)'

export const TICKET_CATEGORIES = [
  { value: 'duvida', label: 'Dúvida' },
  { value: 'problema', label: 'Problema / erro' },
  { value: 'financeiro', label: 'Financeiro / assinatura' },
  { value: 'sugestao', label: 'Sugestão' },
]

export const TICKET_PRIORITIES = [
  { value: 'baixa', label: 'Baixa' },
  { value: 'normal', label: 'Normal' },
  { value: 'alta', label: 'Alta' },
]

export const TICKET_STATUS = [
  { value: 'aberto', label: 'Aberto', tone: 'warning' },
  { value: 'em_andamento', label: 'Em andamento', tone: 'info' },
  { value: 'respondido', label: 'Respondido', tone: 'success' },
  { value: 'resolvido', label: 'Finalizado', tone: 'neutral' },
]

/** Chamados (a RLS limita: equipe vê os da academia; suporte do SaaS vê todos) */
export function listTickets({ academyId, status } = {}) {
  let q = supabase.from('support_tickets').select(FIELDS).order('ultima_msg_em', { ascending: false }).limit(300)
  if (academyId) q = q.eq('academy_id', academyId)
  if (status === 'abertos') q = q.neq('status', 'resolvido')
  else if (status) q = q.eq('status', status)
  return unwrap(q)
}

export const getTicket = (id) => unwrap(supabase.from('support_tickets').select(FIELDS).eq('id', id).single())

export const listMessages = (ticketId) =>
  unwrap(supabase.from('support_messages').select('id, autor_nome, do_suporte, mensagem, created_at').eq('ticket_id', ticketId).order('created_at'))

export const openTicket = (academyId, { assunto, categoria, prioridade, mensagem }) =>
  unwrap(
    supabase.rpc('open_ticket', {
      p_academy: academyId,
      p_assunto: assunto,
      p_categoria: categoria,
      p_mensagem: mensagem,
      p_prioridade: prioridade,
    }),
  )

export const replyTicket = (ticketId, mensagem) => unwrap(supabase.rpc('reply_ticket', { p_ticket: ticketId, p_mensagem: mensagem }))

export const setTicketStatus = (ticketId, status) => unwrap(supabase.rpc('set_ticket_status', { p_ticket: ticketId, p_status: status }))

export const markTicketRead = (ticketId) => unwrap(supabase.rpc('mark_ticket_read', { p_ticket: ticketId }))

/** Contador para o menu: academia = respostas não lidas; suporte = chamados aguardando o suporte */
export async function unreadTickets({ academyId, suporte }) {
  let q = supabase.from('support_tickets').select('id', { count: 'exact', head: true })
  q = suporte ? q.eq('lido_suporte', false).neq('status', 'resolvido') : q.eq('academy_id', academyId).eq('lido_academia', false)
  const { count, error } = await q
  if (error) throw error
  return count ?? 0
}
