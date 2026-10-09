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
  unwrap(supabase.from('support_messages').select('id, autor_nome, do_suporte, mensagem, anexos, created_at').eq('ticket_id', ticketId).order('created_at'))

export const openTicket = (academyId, { assunto, categoria, prioridade, mensagem, anexos = [] }) =>
  unwrap(
    supabase.rpc('open_ticket', {
      p_academy: academyId,
      p_assunto: assunto,
      p_categoria: categoria,
      p_mensagem: mensagem,
      p_prioridade: prioridade,
      p_anexos: anexos,
    }),
  )

export const replyTicket = (ticketId, mensagem, anexos = []) =>
  unwrap(supabase.rpc('reply_ticket', { p_ticket: ticketId, p_mensagem: mensagem, p_anexos: anexos }))

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

// --- Anexos (bucket privado support-files/{academia}/...) ---------------------

export const ATTACHMENT_MAX_MB = 10
const ATTACHMENT_TYPES = /^(image\/(png|jpe?g|webp|gif)|application\/pdf|text\/plain)$/

/** Envia um anexo e devolve { path, nome, tipo, tamanho } */
export async function uploadAttachment(academyId, file) {
  if (!ATTACHMENT_TYPES.test(file.type)) throw new Error('Anexe imagens (PNG, JPG, WEBP, GIF), PDF ou TXT')
  if (file.size > ATTACHMENT_MAX_MB * 1024 * 1024) throw new Error(`Cada anexo pode ter até ${ATTACHMENT_MAX_MB} MB`)
  const safe = file.name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.-]+/g, '_')
    .slice(-80)
  const path = `${academyId}/${crypto.randomUUID()}/${safe}`
  await unwrap(supabase.storage.from('support-files').upload(path, file, { contentType: file.type }))
  return { path, nome: file.name, tipo: file.type, tamanho: file.size }
}

/** Link temporário (10 min) para abrir um anexo */
export async function attachmentUrl(path) {
  const { data, error } = await supabase.storage.from('support-files').createSignedUrl(path, 600)
  if (error) throw error
  return data.signedUrl
}

// --- Respostas prontas (suporte do SaaS) -------------------------------------

export const listMacros = () => unwrap(supabase.from('support_macros').select('*').order('titulo'))

export const saveMacro = (id, { titulo, texto }) =>
  unwrap(
    id
      ? supabase.from('support_macros').update({ titulo: titulo.trim(), texto: texto.trim() }).eq('id', id)
      : supabase.from('support_macros').insert({ titulo: titulo.trim(), texto: texto.trim() }),
  )

export const removeMacro = (id) => unwrap(supabase.from('support_macros').delete().eq('id', id))
