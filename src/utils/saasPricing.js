/**
 * Cálculo do preço da assinatura no navegador (pré-visualização).
 * Mesma regra de _academy_price() no banco, que é quem vale na fatura:
 *   plano × meses − desconto anual − desconto da oferta + adicionais × meses
 */
const round2 = (n) => Math.round(n * 100) / 100

/**
 * @param {{ plan?: object, ciclo: 'mensal'|'anual', addons?: object[], offer?: object|null, offerMonthsLeft?: number|null }} p
 *   addons: { nome, valor } (valor mensal); offer: { nome, desconto_pct, meses };
 *   offerMonthsLeft: meses restantes de uma oferta já aplicada (padrão: duração da oferta)
 */
export function calcSubscription({ plan, ciclo, addons = [], offer = null, offerMonthsLeft = null }) {
  if (!plan) return null
  const meses = ciclo === 'anual' ? 12 : 1
  const bruto = round2(Number(plan.valor) * meses)
  const descontoAnualPct = meses === 12 ? Number(plan.desconto_anual_pct ?? 0) : 0
  const descontoAnual = round2((bruto * descontoAnualPct) / 100)
  // a oferta só desconta os meses do período que ela cobre (ex.: 3 de 12 no anual)
  const restantes = offerMonthsLeft ?? offer?.meses ?? null
  const ofertaMeses = offer ? (restantes == null ? meses : Math.max(0, Math.min(meses, restantes))) : 0
  const descontoOferta = offer ? round2((((bruto - descontoAnual) / meses) * ofertaMeses * Number(offer.desconto_pct)) / 100) : 0
  const adicionais = addons.map((a) => ({ nome: a.nome, valor_mensal: Number(a.valor), valor: round2(Number(a.valor) * meses) }))
  const adicionaisTotal = round2(adicionais.reduce((s, a) => s + a.valor, 0))
  const total = Math.max(0, round2(bruto - descontoAnual - descontoOferta + adicionaisTotal))
  return {
    plano: plan.nome,
    ciclo,
    meses,
    plano_bruto: bruto,
    desconto_anual_pct: descontoAnualPct,
    desconto_anual: descontoAnual,
    oferta: offer?.nome ?? null,
    oferta_pct: offer ? Number(offer.desconto_pct) : 0,
    oferta_meses: ofertaMeses,
    desconto_oferta: descontoOferta,
    adicionais,
    adicionais_total: adicionaisTotal,
    total,
    mensal_equivalente: round2(total / meses),
  }
}

/** Preço mensal equivalente do plano no anual (para os cartões de plano) */
export const annualMonthly = (plan) => round2(Number(plan.valor) * (1 - Number(plan.desconto_anual_pct ?? 0) / 100))

export const CICLOS = [
  { value: 'mensal', label: 'Mensal' },
  { value: 'anual', label: 'Anual (com desconto)' },
]
