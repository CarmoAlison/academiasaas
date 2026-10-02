import { onlyDigits } from '../utils/formatters'
import { nowISO, supabase, unwrap } from './supabaseClient'

// --- Academias ----------------------------------------------------------

const ACADEMY_SELECT = 'id, nome, cnpj, email, telefone, logo_url, status, created_at, saas_plan_id, saas_plan:saas_plans(id, nome, valor)'

export const listAcademies = () =>
  unwrap(supabase.from('academies').select(ACADEMY_SELECT).is('deleted_at', null).order('created_at', { ascending: false }))

export const getAcademy = (id) =>
  unwrap(supabase.from('academies').select(ACADEMY_SELECT).eq('id', id).is('deleted_at', null).single())

/** Cria academia + admin + unidade padrão + perfis padrão + fatura inicial */
export const createAcademy = (values) =>
  unwrap(
    supabase.rpc('create_academy', {
      p_nome: values.nome,
      p_cnpj: onlyDigits(values.cnpj) || null,
      p_saas_plan_id: values.saas_plan_id,
      p_admin_nome: values.admin_nome,
      p_admin_cpf: onlyDigits(values.admin_cpf),
      p_admin_telefone: onlyDigits(values.admin_telefone) || null,
      p_unidade_nome: values.unidade_nome || 'Unidade Principal',
    }),
  )

export const updateAcademy = (id, values) =>
  unwrap(
    supabase
      .from('academies')
      .update({
        nome: values.nome,
        cnpj: onlyDigits(values.cnpj) || null,
        email: values.email || null,
        telefone: onlyDigits(values.telefone) || null,
        saas_plan_id: values.saas_plan_id || null,
        status: values.status,
      })
      .eq('id', id),
  )

export const setAcademyStatus = (id, status) => unwrap(supabase.from('academies').update({ status }).eq('id', id))

export const removeAcademy = (id) =>
  unwrap(supabase.from('academies').update({ deleted_at: nowISO(), status: 'inativa' }).eq('id', id))

/** Números de uma academia (detalhe) */
export async function academyStats(id) {
  const count = async (table, extra = (q) => q) => {
    const { count: c, error } = await extra(
      supabase.from(table).select('id', { count: 'exact', head: true }).eq('academy_id', id).is('deleted_at', null),
    )
    if (error) throw error
    return c ?? 0
  }
  const [alunos, ativos, unidades, planos] = await Promise.all([
    count('students'),
    count('students', (q) => q.eq('status', 'ativo')),
    count('units'),
    count('plans'),
  ])
  return { alunos, ativos, unidades, planos }
}

export const listAcademyAdmins = async (academyId) => {
  const roles = await unwrap(
    supabase.from('roles').select('id').eq('academy_id', academyId).eq('slug', 'admin').is('deleted_at', null),
  )
  if (!roles.length) return []
  const links = await unwrap(supabase.from('user_roles').select('user_id').eq('role_id', roles[0].id))
  if (!links.length) return []
  return unwrap(
    supabase
      .from('profiles')
      .select('id, nome, cpf, telefone, status')
      .eq('academy_id', academyId)
      .in('user_id', links.map((l) => l.user_id))
      .is('deleted_at', null),
  )
}

// --- Planos SaaS -------------------------------------------------------

export const listSaasPlans = () =>
  unwrap(supabase.from('saas_plans').select('*').is('deleted_at', null).order('valor'))

export const saveSaasPlan = (id, values) => {
  const payload = {
    nome: values.nome,
    descricao: values.descricao || null,
    valor: Number(values.valor),
    limite_alunos: values.limite_alunos ? Number(values.limite_alunos) : null,
    ativo: values.ativo,
  }
  return unwrap(id ? supabase.from('saas_plans').update(payload).eq('id', id) : supabase.from('saas_plans').insert(payload))
}

export const removeSaasPlan = (id) =>
  unwrap(supabase.from('saas_plans').update({ deleted_at: nowISO(), ativo: false }).eq('id', id))

// --- Faturas SaaS --------------------------------------------------------

export function listSaasInvoices({ academyId, competencia } = {}) {
  let query = supabase
    .from('saas_invoices')
    .select('*, academy:academies(id, nome), saas_plan:saas_plans(nome)')
    .order('vencimento', { ascending: false })
  if (academyId) query = query.eq('academy_id', academyId)
  if (competencia) query = query.eq('competencia', competencia)
  return unwrap(query)
}

/** Baixa da fatura: gera o recibo (número e "recebido por" vêm do trigger no banco) */
export const markInvoicePaid = (id, forma) =>
  unwrap(supabase.from('saas_invoices').update({ status: 'pago', pago_em: nowISO(), forma_pagamento: forma }).eq('id', id))

export const reopenInvoice = (id) =>
  unwrap(supabase.from('saas_invoices').update({ status: 'pendente', pago_em: null, forma_pagamento: null }).eq('id', id))

export const cancelInvoice = (id) => unwrap(supabase.from('saas_invoices').update({ status: 'cancelado' }).eq('id', id))

/** @param {string} competencia YYYY-MM-01 */
export const generateInvoices = (competencia) =>
  unwrap(supabase.rpc('generate_saas_invoices', { p_competencia: competencia }))

// --- Super admins ------------------------------------------------------------

export const listSuperAdmins = () => unwrap(supabase.from('super_admins').select('*').order('nome'))

export const createSuperAdmin = (values) =>
  unwrap(
    supabase.rpc('create_super_admin', {
      p_nome: values.nome,
      p_cpf: onlyDigits(values.cpf),
      p_email: values.email || null,
      p_papel: values.papel || 'admin',
    }),
  )

export const updateSuperAdmin = (id, values) =>
  unwrap(supabase.from('super_admins').update({ nome: values.nome, email: values.email || null, papel: values.papel || 'admin' }).eq('id', id))

export const removeSuperAdmin = (id) => unwrap(supabase.from('super_admins').delete().eq('id', id))

export const resetSuperAdminPassword = (id) =>
  unwrap(supabase.rpc('reset_super_admin_password', { p_super_admin_id: id }))

/** Apaga logs mais antigos que a retenção configurada. Retorna { erros, acessos, auditoria } */
export const purgeOldLogs = () => unwrap(supabase.rpc('purge_old_logs'))

// --- Configurações -----------------------------------------------------------

export async function getSettings() {
  const row = await unwrap(supabase.from('saas_settings').select('dados').eq('id', 1).maybeSingle())
  return row?.dados ?? {}
}

/**
 * Salva as configurações gerais sem sobrescrever a personalização do recibo
 * (dados.recibo é gerenciado em Financeiro → Personalizar recibo).
 */
export async function saveSettings(dados) {
  const current = await getSettings()
  const rest = { ...dados }
  delete rest.recibo
  return unwrap(
    supabase.from('saas_settings').upsert({ id: 1, dados: { ...current, ...rest, recibo: current.recibo }, updated_at: nowISO() }),
  )
}
