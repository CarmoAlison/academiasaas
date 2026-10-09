import { calcEncargos, pixText } from './cobranca'
import { firstName, formatCurrency, formatDate, onlyDigits } from './formatters'

/**
 * Modelos padrão (a academia pode trocar em Configurações). Variáveis entre chaves.
 * {pix_linha} e {encargos_linha} só aparecem quando a academia configurou PIX / multa e juros.
 */
export const DEFAULT_TEMPLATES = {
  lembrete:
    'Olá, {nome}! 👋 Passando para lembrar que sua mensalidade de {valor} na {academia} vence em {vencimento}. Qualquer dúvida, estamos à disposição!{pix_linha}',
  atraso:
    'Olá, {nome}! Identificamos que a mensalidade de {valor} na {academia}, vencida em {vencimento}, ainda está em aberto ({dias} dia(s) de atraso){encargos_linha}. Se já pagou, desconsidere. Podemos ajudar a regularizar?{pix_linha}',
  recibo:
    'Olá, {nome}! ✅ Recebemos seu pagamento de {valor} ({descricao}). Obrigado! O recibo nº {recibo} está disponível na sua área do aluno: {link}',
  sumido:
    'Oi, {nome}! Sentimos sua falta na {academia} 💪 Faz {dias} dias que você não aparece. Está tudo bem? Bora voltar a treinar!',
  aniversario:
    'Parabéns, {nome}! 🎉 Toda a equipe da {academia} deseja um feliz aniversário, muita saúde e ótimos treinos! 💪',
}

export const TEMPLATE_KEYS = {
  lembrete: 'msg_lembrete',
  atraso: 'msg_atraso',
  recibo: 'msg_recibo',
  sumido: 'msg_sumido',
  aniversario: 'msg_aniversario',
}

export const TEMPLATE_VARIABLES = {
  lembrete: ['nome', 'valor', 'vencimento', 'academia', 'descricao', 'pix'],
  atraso: ['nome', 'valor', 'total', 'vencimento', 'dias', 'academia', 'descricao', 'pix'],
  recibo: ['nome', 'valor', 'descricao', 'recibo', 'link', 'academia'],
  sumido: ['nome', 'dias', 'academia'],
  aniversario: ['nome', 'idade', 'academia'],
}

/** Modelo efetivo: o da academia ou o padrão */
export const templateFor = (settings, tipo) => settings?.[TEMPLATE_KEYS[tipo]]?.trim() || DEFAULT_TEMPLATES[tipo]

/** Troca {variavel} pelos valores (variável desconhecida fica como está) */
export const fillTemplate = (template, vars) =>
  template.replace(/\{(\w+)\}/g, (match, key) => (vars[key] === undefined || vars[key] === null ? match : String(vars[key])))

function chargeVars({ nome, valor, total, dias, vencimento, descricao, academia, settings }) {
  const pix = pixText(settings)
  return {
    nome: firstName(nome),
    valor: formatCurrency(valor),
    total: formatCurrency(total),
    vencimento: formatDate(vencimento),
    descricao: descricao ?? 'Mensalidade',
    dias,
    academia,
    pix,
    pix_linha: pix ? `\n\nPara pagar: ${pix}` : '',
    encargos_linha: total - valor > 0.004 ? `; com multa e juros, o total hoje é ${formatCurrency(total)}` : '',
  }
}

/**
 * Variáveis de uma cobrança (linha de v_payments).
 * `settings` = configurações da academia: multa/juros ({total}) e PIX ({pix}).
 */
export function paymentVars(p, academia, settings) {
  const enc = calcEncargos(p, settings)
  return {
    ...chargeVars({ nome: p.aluno_nome, valor: Number(p.valor), total: enc.total, dias: enc.dias, vencimento: p.vencimento, descricao: p.descricao, academia, settings }),
    recibo: p.recibo_numero ? String(p.recibo_numero).padStart(6, '0') : '—',
    link: `${window.location.origin}/client/financeiro`,
  }
}

/**
 * Variáveis da cobrança em lote: um aluno com uma ou mais parcelas em atraso vira uma mensagem só.
 * @param {{ aluno_nome: string, descricao?: string, vencimento: string, valor: number|string }[]} parcelas
 */
export function overdueVars(parcelas, academia, settings) {
  const ordered = [...parcelas].sort((a, b) => a.vencimento.localeCompare(b.vencimento))
  const encs = ordered.map((p) => calcEncargos(p, settings))
  return chargeVars({
    nome: ordered[0].aluno_nome,
    valor: ordered.reduce((acc, p) => acc + Number(p.valor), 0),
    total: encs.reduce((acc, e) => acc + e.total, 0),
    dias: encs[0].dias,
    vencimento: ordered[0].vencimento,
    descricao: ordered.length > 1 ? `${ordered.length} mensalidades` : ordered[0].descricao,
    academia,
    settings,
  })
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
