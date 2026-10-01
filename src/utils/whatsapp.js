import { firstName, formatCurrency, formatDate, onlyDigits } from './formatters'

/** Modelos padrão (a academia pode trocar em Configurações). Variáveis entre chaves. */
export const DEFAULT_TEMPLATES = {
  lembrete:
    'Olá, {nome}! 👋 Passando para lembrar que sua mensalidade de {valor} na {academia} vence em {vencimento}. Qualquer dúvida, estamos à disposição!',
  atraso:
    'Olá, {nome}! Identificamos que a mensalidade de {valor} na {academia}, vencida em {vencimento}, ainda está em aberto ({dias} dia(s) de atraso). Se já pagou, desconsidere. Podemos ajudar a regularizar?',
  recibo:
    'Olá, {nome}! ✅ Recebemos seu pagamento de {valor} ({descricao}). Obrigado! O recibo nº {recibo} está disponível na sua área do aluno: {link}',
  sumido:
    'Oi, {nome}! Sentimos sua falta na {academia} 💪 Faz {dias} dias que você não aparece. Está tudo bem? Bora voltar a treinar!',
}

export const TEMPLATE_KEYS = { lembrete: 'msg_lembrete', atraso: 'msg_atraso', recibo: 'msg_recibo', sumido: 'msg_sumido' }

export const TEMPLATE_VARIABLES = {
  lembrete: ['nome', 'valor', 'vencimento', 'academia', 'descricao'],
  atraso: ['nome', 'valor', 'vencimento', 'dias', 'academia', 'descricao'],
  recibo: ['nome', 'valor', 'descricao', 'recibo', 'link', 'academia'],
  sumido: ['nome', 'dias', 'academia'],
}

/** Modelo efetivo: o da academia ou o padrão */
export const templateFor = (settings, tipo) => settings?.[TEMPLATE_KEYS[tipo]]?.trim() || DEFAULT_TEMPLATES[tipo]

/** Troca {variavel} pelos valores (variável desconhecida fica como está) */
export const fillTemplate = (template, vars) =>
  template.replace(/\{(\w+)\}/g, (match, key) => (vars[key] === undefined || vars[key] === null ? match : String(vars[key])))

/** Variáveis de uma cobrança (linha de v_payments) */
export function paymentVars(p, academia) {
  const venc = p.vencimento ? new Date(`${p.vencimento}T00:00:00`) : null
  const dias = venc ? Math.max(0, Math.floor((Date.now() - venc.getTime()) / 86400000)) : 0
  return {
    nome: firstName(p.aluno_nome),
    valor: formatCurrency(p.valor),
    vencimento: formatDate(p.vencimento),
    descricao: p.descricao ?? 'Mensalidade',
    recibo: p.recibo_numero ? String(p.recibo_numero).padStart(6, '0') : '—',
    dias,
    academia,
    link: `${window.location.origin}/client/financeiro`,
  }
}

/** Telefone no formato internacional (assume Brasil quando vier só DDD + número) */
export function waPhone(phone) {
  const d = onlyDigits(phone)
  if (!d) return null
  if (d.length === 10 || d.length === 11) return `55${d}`
  return d.length >= 12 ? d : null
}

/** Link "clique para conversar" do WhatsApp com a mensagem pronta */
export const waLink = (phone, text) => `https://wa.me/${waPhone(phone)}?text=${encodeURIComponent(text)}`
