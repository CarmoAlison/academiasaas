import { supabase, unwrap, unwrapWithCount } from './supabaseClient'

/**
 * @typedef {object} LogQuery
 * @property {string|null} academyId  null = global (super admin)
 * @property {number} page            base 0
 * @property {number} pageSize
 * @property {Record<string, string>} [filters]
 */

function applyCommon(query, { academyId, filters = {} }) {
  if (academyId) query = query.eq('academy_id', academyId)
  if (filters.academy_id) query = query.eq('academy_id', filters.academy_id)
  if (filters.de) query = query.gte('created_at', `${filters.de}T00:00:00`)
  if (filters.ate) query = query.lte('created_at', `${filters.ate}T23:59:59`)
  if (filters.usuario) query = query.ilike('user_nome', `%${filters.usuario}%`)
  return query
}

function paginate(query, { page, pageSize }) {
  const from = page * pageSize
  return query.order('created_at', { ascending: false }).range(from, from + pageSize - 1)
}

/** @param {LogQuery} params */
export function listAuditLogs(params) {
  let query = supabase
    .from('audit_logs')
    .select('id, academy_id, user_id, user_nome, acao, tabela, registro_id, ip, created_at, academies(nome)', {
      count: 'exact',
    })
  query = applyCommon(query, params)
  const { filters = {} } = params
  if (filters.acao) query = query.eq('acao', filters.acao)
  if (filters.tabela) query = query.eq('tabela', filters.tabela)
  if (filters.registro_id) query = query.eq('registro_id', filters.registro_id)
  return unwrapWithCount(paginate(query, params))
}

/** Log completo com diffs (antes/depois) */
export const getAuditLog = (id) => unwrap(supabase.from('audit_logs').select('*, academies(nome)').eq('id', id).single())

/** @param {LogQuery} params */
export function listErrors(params) {
  let query = supabase.from('errors').select('*, academies(nome)', { count: 'exact' })
  query = applyCommon(query, params)
  if (params.filters?.busca) query = query.ilike('mensagem', `%${params.filters.busca}%`)
  return unwrapWithCount(paginate(query, params))
}

/** @param {LogQuery} params */
export function listAccessLogs(params) {
  let query = supabase.from('access_logs').select('*, academies(nome)', { count: 'exact' })
  query = applyCommon(query, params)
  if (params.filters?.evento) query = query.eq('evento', params.filters.evento)
  return unwrapWithCount(paginate(query, params))
}

/** Contadores dos últimos 7 dias para a visão geral */
export async function auditSummary(academyId) {
  const since = new Date(Date.now() - 7 * 86400_000).toISOString()
  const count = async (table) => {
    let q = supabase.from(table).select('id', { count: 'exact', head: true }).gte('created_at', since)
    if (academyId) q = q.eq('academy_id', academyId)
    const { count: c, error } = await q
    if (error) throw error
    return c ?? 0
  }
  const [eventos, erros, acessos] = await Promise.all([count('audit_logs'), count('errors'), count('access_logs')])
  return { eventos, erros, acessos }
}
