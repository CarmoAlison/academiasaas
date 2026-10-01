import { onlyDigits } from '../utils/formatters'

/** Remove caracteres que quebram o filtro `.or()` do PostgREST (vírgula, parênteses, aspas…) */
export const sanitizeTerm = (term = '') => term.replace(/[,()"'\\%*]/g, ' ').trim()

/**
 * Aplica busca textual: termo só com dígitos procura também em CPF/telefone.
 * @param {any} query builder do supabase-js
 * @param {string} term
 * @param {{ text: string[], digits?: string[] }} columns
 */
export function applySearch(query, term, { text, digits = [] }) {
  const clean = sanitizeTerm(term)
  if (!clean) return query
  const nums = onlyDigits(clean)
  const parts = text.map((c) => `${c}.ilike.%${clean}%`)
  if (nums && nums.length >= 3) parts.push(...digits.map((c) => `${c}.ilike.%${nums}%`))
  return query.or(parts.join(','))
}

/**
 * Ordenação a partir da coluna da tabela (mapa coluna → campo do banco)
 * @param {any} query
 * @param {{key: string, dir: 'asc'|'desc'}|null} sort
 * @param {Record<string, string>} map
 * @param {{ column: string, ascending: boolean }} fallback
 */
export function applySort(query, sort, map, fallback) {
  const column = sort && map[sort.key]
  if (column) return query.order(column, { ascending: sort.dir === 'asc', nullsFirst: false }).order('id')
  return query.order(fallback.column, { ascending: fallback.ascending }).order('id')
}

/** Intervalo da página (base 0) */
export const pageRange = (page, pageSize) => [page * pageSize, page * pageSize + pageSize - 1]
