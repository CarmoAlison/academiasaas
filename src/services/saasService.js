import { onlyDigits } from '../utils/formatters'
import { nowISO, supabase, unwrap } from './supabaseClient'

// --- Academias ----------------------------------------------------------

const ACADEMY_SELECT =
  'id, nome, cnpj, email, telefone, logo_url, status, created_at, saas_plan_id, ciclo, ciclo_inicio, uf, cidade, offer_id, oferta_ate, modulos_override, saas_plan:saas_plans(id, nome, valor, desconto_anual_pct), academy_addons(addon_id, valor, addon:saas_addons(id, nome, slug))'

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
        uf: values.uf || null,
        cidade: values.cidade?.trim() || null,
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
  unwrap(supabase.from('saas_plans').select('*').is('deleted_at', null).order('ordem').order('valor'))

export const saveSaasPlan = (id, values) => {
  const payload = {
    nome: values.nome,
    descricao: values.descricao || null,
    valor: Number(values.valor),
    limite_alunos: values.limite_alunos ? Number(values.limite_alunos) : null,
    limite_unidades: values.limite_unidades ? Number(values.limite_unidades) : null,
    desconto_anual_pct: Number(values.desconto_anual_pct || 0),
    recursos: String(values.recursos ?? '')
      .split('\n')
      .map((r) => r.trim())
      .filter(Boolean),
    destaque: Boolean(values.destaque),
    // null = todos os módulos (inclusive os criados depois)
    modulos: values.modulos_todos ? null : values.modulos ?? [],
    ordem: Number(values.ordem || 0),
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
    .select('*, academy:academies(id, nome, telefone, email), saas_plan:saas_plans(id, nome)')
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

// --- Adicionais e ofertas ---------------------------------------------------

export const listSaasAddons = () => unwrap(supabase.from('saas_addons').select('*').order('nome'))

export const saveSaasAddon = (id, v) => {
  const payload = {
    nome: v.nome.trim(),
    slug:
      v.slug?.trim() ||
      v.nome
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, ''),
    descricao: v.descricao?.trim() || null,
    valor: Number(v.valor),
    ativo: Boolean(v.ativo),
  }
  return unwrap(id ? supabase.from('saas_addons').update(payload).eq('id', id) : supabase.from('saas_addons').insert(payload))
}

export const listSaasOffers = () => unwrap(supabase.from('saas_offers').select('*').order('created_at', { ascending: false }))

export const saveSaasOffer = (id, v) => {
  const payload = {
    nome: v.nome.trim(),
    descricao: v.descricao?.trim() || null,
    desconto_pct: Number(v.desconto_pct),
    meses: v.meses ? Number(v.meses) : null,
    limite_academias: v.limite_academias ? Number(v.limite_academias) : null,
    uf: v.uf || null,
    cidade: v.cidade?.trim() || null,
    valido_ate: v.valido_ate || null,
    ativo: Boolean(v.ativo),
  }
  return unwrap(id ? supabase.from('saas_offers').update(payload).eq('id', id) : supabase.from('saas_offers').insert(payload))
}

export const removeSaasOffer = (id) => unwrap(supabase.from('saas_offers').delete().eq('id', id))

/** Quantas academias usam cada oferta → { [offer_id]: n } */
export async function offerUsage() {
  const rows = await unwrap(supabase.from('academies').select('offer_id').not('offer_id', 'is', null).is('deleted_at', null))
  return rows.reduce((acc, r) => ({ ...acc, [r.offer_id]: (acc[r.offer_id] ?? 0) + 1 }), {})
}

/** Plano, ciclo, adicionais e oferta da academia (recalcula a fatura pendente do mês) */
export const setAcademySubscription = (academyId, { plan, ciclo, addons = [], offer = null }) =>
  unwrap(
    supabase.rpc('set_academy_subscription', {
      p_academy: academyId,
      p_plan: plan,
      p_ciclo: ciclo,
      p_addons: addons,
      p_offer: offer || null,
    }),
  )

/** Composição do preço atual (Super Admin ou Admin da academia) */
export const academyPrice = (academyId) => unwrap(supabase.rpc('academy_price', { p_academy: academyId }))

/** Cria a academia e já aplica região, ciclo, adicionais e oferta */
export async function createAcademyWithSubscription(values, subscription) {
  const id = await createAcademy({ ...values, saas_plan_id: subscription.plan })
  if (values.uf || values.cidade) {
    await unwrap(supabase.from('academies').update({ uf: values.uf || null, cidade: values.cidade?.trim() || null }).eq('id', id))
  }
  if (subscription.ciclo !== 'mensal' || subscription.addons.length || subscription.offer) {
    await setAcademySubscription(id, subscription)
  }
  return id
}

// --- Gestão (migração 018) -------------------------------------------------

/** Por academia: alunos x limite, último acesso do admin, atraso, módulos e MRR → { [academy_id]: {...} } */
export async function academiesOverview() {
  const rows = await unwrap(supabase.rpc('super_academies_overview'))
  return Object.fromEntries((rows ?? []).map((r) => [r.academy_id, r]))
}

/** Busca global (academias, alunos/equipe por nome ou CPF, chamados por nº ou assunto) */
export const superSearch = (q) => unwrap(supabase.rpc('super_search', { p_q: q }))

/** Linha do tempo da academia: auditoria (academia, assinatura, adicionais, faturas) + entradas do Super Admin */
export async function academyTimeline(academyId) {
  const [audit, access] = await Promise.all([
    unwrap(
      supabase
        .from('audit_logs')
        .select('id, acao, tabela, user_nome, dados_antes, dados_depois, created_at')
        .eq('academy_id', academyId)
        .in('tabela', ['academies', 'academy_addons', 'saas_invoices', 'academy_settings'])
        .order('created_at', { ascending: false })
        .limit(200),
    ),
    unwrap(
      supabase
        .from('access_logs')
        .select('id, evento, user_nome, created_at')
        .eq('academy_id', academyId)
        .eq('evento', 'acesso_super')
        .order('created_at', { ascending: false })
        .limit(100),
    ),
  ])
  return { audit: audit ?? [], access: access ?? [] }
}

/** Dados do próprio usuário do SaaS */
export const updateMySuperProfile = ({ nome, email, avatar_url, alertas }) =>
  unwrap(supabase.rpc('update_my_super_profile', { p_nome: nome, p_email: email, p_avatar_url: avatar_url, p_alertas: alertas }))

/** Duplica um plano (cópia inativa, para ajustar antes de oferecer) */
export async function duplicateSaasPlan(plan) {
  const rest = { ...plan }
  for (const k of ['id', 'created_at', 'updated_at', 'deleted_at', 'slug']) delete rest[k]
  return unwrap(supabase.from('saas_plans').insert({ ...rest, nome: `${plan.nome} (cópia)`, ativo: false, destaque: false }))
}

/** Duplica uma oferta (cópia inativa) */
export async function duplicateSaasOffer(offer) {
  const rest = { ...offer }
  for (const k of ['id', 'created_at', 'updated_at']) delete rest[k]
  return unwrap(supabase.from('saas_offers').insert({ ...rest, nome: `${offer.nome} (cópia)`, ativo: false }))
}
