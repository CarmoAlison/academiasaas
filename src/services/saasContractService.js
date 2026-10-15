import { supabase, unwrap } from './supabaseClient'

/** Variáveis do modelo do contrato do SaaS (entre chaves no texto) */
export const SAAS_CONTRACT_VARIABLES = [
  { key: 'academia', label: 'Nome da academia', exemplo: 'Academia Exemplo' },
  { key: 'cnpj', label: 'CNPJ da academia', exemplo: '11.444.777/0001-61' },
  { key: 'endereco', label: 'Endereço da academia', exemplo: 'Rua das Flores, 100, Centro, Recife/PE' },
  { key: 'plano', label: 'Plano do sistema', exemplo: 'Profissional' },
  { key: 'valor', label: 'Valor da assinatura', exemplo: 'R$ 299,90 por mês' },
  { key: 'ciclo', label: 'Ciclo de cobrança', exemplo: 'mensal' },
  { key: 'empresa', label: 'Sua empresa', exemplo: 'Sua empresa' },
  { key: 'empresa_cnpj', label: 'CNPJ da sua empresa', exemplo: '00.000.000/0001-00' },
  { key: 'cidade', label: 'Cidade (foro e assinatura)', exemplo: 'Recife' },
  { key: 'data', label: 'Data de emissão', exemplo: new Date().toLocaleDateString('pt-BR') },
]

/** Campos do modelo (saas_settings.dados.contrato) */
export const SAAS_CONTRACT_DEFAULTS = {
  titulo: '',
  texto: '',
  logo_url: null,
  logo_completa: false,
  cor: '#006EB8',
  estilo: 'moderno',
  assinatura_modo: 'linha',
  assinatura_nome: '',
  assinatura_cargo: 'Diretor(a)',
  assinatura_url: null,
}

export async function getSaasContractSettings() {
  const row = await unwrap(supabase.from('saas_settings').select('dados').eq('id', 1).maybeSingle())
  return { contrato: row?.dados?.contrato ?? null, dados: row?.dados ?? {} }
}

/** Salva só a chave "contrato", preservando o restante das configurações do SaaS */
export async function saveSaasContractSettings(values) {
  const row = await unwrap(supabase.from('saas_settings').select('dados').eq('id', 1).maybeSingle())
  const contrato = Object.fromEntries(
    Object.keys(SAAS_CONTRACT_DEFAULTS).map((k) => [k, typeof values[k] === 'string' ? values[k].trim() || null : (values[k] ?? null)]),
  )
  return unwrap(
    supabase.from('saas_settings').upsert({ id: 1, dados: { ...(row?.dados ?? {}), contrato }, updated_at: new Date().toISOString() }),
  )
}

export const defaultSaasContractText = () => unwrap(supabase.rpc('default_saas_contract_text'))

/** Contratos de uma academia (mais recentes primeiro) */
export const listSaasContracts = (academyId) =>
  unwrap(
    supabase
      .from('saas_contracts')
      .select('id, titulo, status, hash, created_at, aceito_em, aceite_nome, aceite_ip')
      .eq('academy_id', academyId)
      .order('created_at', { ascending: false })
      .limit(30),
  )

export const issueSaasContract = (academyId) => unwrap(supabase.rpc('issue_saas_contract', { p_academy: academyId }))
export const cancelSaasContract = (id) => unwrap(supabase.rpc('cancel_saas_contract', { p_contract: id }))
export const getSaasContract = (id) => unwrap(supabase.rpc('get_saas_contract', { p_contract: id }))

/** Assinatura eletrônica pelo Admin da academia */
export const acceptSaasContract = (id) =>
  unwrap(supabase.rpc('accept_saas_contract', { p_contract: id, p_user_agent: navigator.userAgent }))

/** Troca as variáveis por valores de exemplo (pré-visualização); `valores` substitui os exemplos (ex.: dados reais da empresa) */
export const fillSampleVariables = (text, valores = {}) =>
  SAAS_CONTRACT_VARIABLES.reduce((t, v) => t.split(`{${v.key}}`).join(valores[v.key] || v.exemplo), text ?? '')
