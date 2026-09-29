/** Remove tudo que não for dígito */
export const onlyDigits = (value = '') => String(value ?? '').replace(/\D/g, '')

/** @param {string} value */
export function formatCPF(value) {
  const d = onlyDigits(value).slice(0, 11)
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

/** @param {string} value */
export function formatCNPJ(value) {
  const d = onlyDigits(value).slice(0, 14)
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

/** @param {string} value */
export function formatPhone(value) {
  const d = onlyDigits(value).slice(0, 11)
  if (d.length <= 10) {
    return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2')
  }
  return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2')
}

/** @param {string} value */
export function formatCEP(value) {
  return onlyDigits(value).slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2')
}

export const MASKS = {
  cpf: formatCPF,
  cnpj: formatCNPJ,
  phone: formatPhone,
  cep: formatCEP,
}

const currencyFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** @param {number|string|null|undefined} value */
export function formatCurrency(value) {
  return currencyFmt.format(Number(value || 0))
}

/**
 * Converte 'YYYY-MM-DD' (date do Postgres) sem sofrer com fuso horário.
 * @param {string|Date} value
 */
export function toDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(value)
}

export function formatDate(value) {
  const d = toDate(value)
  return d ? d.toLocaleDateString('pt-BR') : '—'
}

export function formatDateTime(value) {
  const d = toDate(value)
  return d ? d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

/** 'HH:MM:SS' → 'HH:MM' */
export function formatTime(value) {
  return value ? String(value).slice(0, 5) : '—'
}

/** Date → 'YYYY-MM-DD' no fuso local */
export function toISODate(date = new Date()) {
  const d = toDate(date)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function addDays(date, days) {
  const d = new Date(toDate(date))
  d.setDate(d.getDate() + days)
  return d
}

/** 'YYYY-MM' → 'mar/26' */
export function formatMonth(value) {
  if (!value) return ''
  const [y, m] = value.split('-').map(Number)
  return new Date(y, m - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
    .replace('. de ', '/')
    .replace(' de ', '/')
}

export function initials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')
}

export function firstName(name = '') {
  return name.trim().split(/\s+/)[0] || ''
}

/** Status de pagamento considerando atraso */
export function paymentStatus(payment) {
  if (payment.status === 'pendente' && toDate(payment.vencimento) < toDate(toISODate())) return 'atrasado'
  return payment.status
}
