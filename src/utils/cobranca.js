import { formatCNPJ, formatCPF, formatPhone, toISODate } from './formatters'

export const PIX_TIPOS = [
  { value: 'cpf', label: 'CPF' },
  { value: 'cnpj', label: 'CNPJ' },
  { value: 'telefone', label: 'Celular' },
  { value: 'email', label: 'E-mail' },
  { value: 'aleatoria', label: 'Chave aleatória' },
]

const round2 = (v) => Math.round(v * 100) / 100

/**
 * Multa e juros de uma parcela vencida (juros simples, proporcionais aos dias).
 * @param {{ valor: number|string, vencimento: string }} p
 * @param {{ multa_percent?: number, juros_mes_percent?: number }} [cfg] configurações da academia
 * @returns {{ dias: number, multa: number, juros: number, encargos: number, total: number }}
 */
export function calcEncargos(p, cfg, hoje = toISODate()) {
  const valor = Number(p.valor) || 0
  const dias = p.vencimento && p.vencimento < hoje ? Math.round((new Date(`${hoje}T12:00:00`) - new Date(`${p.vencimento}T12:00:00`)) / 86400000) : 0
  const multaPct = Number(cfg?.multa_percent) || 0
  const jurosPct = Number(cfg?.juros_mes_percent) || 0
  if (!dias) return { dias: 0, multa: 0, juros: 0, encargos: 0, total: valor }
  const multa = round2((valor * multaPct) / 100)
  const juros = round2((valor * jurosPct * dias) / 100 / 30)
  return { dias, multa, juros, encargos: round2(multa + juros), total: round2(valor + multa + juros) }
}

/** A academia cobra multa ou juros? */
export const temEncargos = (cfg) => Number(cfg?.multa_percent) > 0 || Number(cfg?.juros_mes_percent) > 0

/** Chave PIX formatada para exibição (ou null se não configurada) */
export function pixDisplay(cfg) {
  const chave = cfg?.pix_chave?.trim()
  if (!chave) return null
  if (cfg.pix_tipo === 'cpf') return formatCPF(chave)
  if (cfg.pix_tipo === 'cnpj') return formatCNPJ(chave)
  if (cfg.pix_tipo === 'telefone') return formatPhone(chave)
  return chave
}

/** Texto do PIX para mensagens: "PIX (CNPJ): 11.222.333/0001-81 · Favorecido" */
export function pixText(cfg) {
  const chave = pixDisplay(cfg)
  if (!chave) return ''
  const tipo = PIX_TIPOS.find((t) => t.value === cfg.pix_tipo)?.label
  return `PIX${tipo ? ` (${tipo})` : ''}: ${chave}${cfg.pix_favorecido ? ` · ${cfg.pix_favorecido}` : ''}`
}
