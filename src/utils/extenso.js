const UNIDADES = [
  '', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez',
  'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove',
]
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos']

/** 1–999 por extenso */
function ate999(n) {
  if (n === 100) return 'cem'
  const c = Math.floor(n / 100)
  const r = n % 100
  const parts = []
  if (c) parts.push(CENTENAS[c])
  if (r) {
    if (r < 20) parts.push(UNIDADES[r])
    else {
      const d = Math.floor(r / 10)
      const u = r % 10
      parts.push(u ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d])
    }
  }
  return parts.join(' e ')
}

/** Inteiro (0 – 999.999.999) por extenso */
export function numeroPorExtenso(n) {
  if (n === 0) return 'zero'
  const grupos = [
    { valor: Math.floor(n / 1e6), um: 'um milhão', varios: (t) => `${t} milhões` },
    { valor: Math.floor((n % 1e6) / 1000), um: 'mil', varios: (t) => `${t} mil` },
    { valor: n % 1000, um: 'um', varios: (t) => t },
  ].filter((g) => g.valor > 0)

  return grupos
    .map((g, i) => {
      const texto = g.valor === 1 ? g.um : g.varios(ate999(g.valor))
      // "mil e cem", "mil e vinte", mas "mil duzentos e trinta"
      const conector = i === 0 ? '' : g.valor < 100 || g.valor % 100 === 0 ? ' e ' : ' '
      return conector + texto
    })
    .join('')
}

/**
 * Valor em reais por extenso.
 * @example valorPorExtenso(119.9) → "cento e dezenove reais e noventa centavos"
 */
export function valorPorExtenso(valor) {
  const total = Math.round(Number(valor || 0) * 100)
  const reais = Math.floor(total / 100)
  const centavos = total % 100

  const parteReais = reais
    ? `${numeroPorExtenso(reais)} ${reais === 1 ? 'real' : reais % 1e6 === 0 ? 'de reais' : 'reais'}`
    : ''
  const parteCentavos = centavos ? `${numeroPorExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}` : ''

  if (parteReais && parteCentavos) return `${parteReais} e ${parteCentavos}`
  return parteReais || parteCentavos || 'zero real'
}
