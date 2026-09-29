import { supabase, unwrap } from './supabaseClient'

/**
 * Dados completos do recibo (pagamento, aluno, academia, unidade e personalização).
 * Disponível para o próprio aluno ou para quem tem financeiro.ver; somente pagamentos quitados.
 * @param {string} paymentId
 */
export const getReceipt = (paymentId) => unwrap(supabase.rpc('get_receipt', { p_payment_id: paymentId }))

/**
 * Recibo de uma fatura da assinatura SaaS (Super Admin ou Admin da academia pagadora).
 * Mesmo formato de getReceipt: emissor = empresa do SaaS, pagador = academia.
 * @param {string} invoiceId
 */
export const getSaasReceipt = (invoiceId) => unwrap(supabase.rpc('get_saas_receipt', { p_invoice_id: invoiceId }))

/** Personalização do recibo SaaS (fica em saas_settings.dados.recibo) */
export async function getSaasReceiptSettings() {
  const row = await unwrap(supabase.from('saas_settings').select('dados').eq('id', 1).maybeSingle())
  return { recibo: row?.dados?.recibo ?? null, dados: row?.dados ?? {} }
}

/** Salva só a chave "recibo", preservando o restante das configurações do SaaS */
export async function saveSaasReceiptSettings(values) {
  const row = await unwrap(supabase.from('saas_settings').select('dados').eq('id', 1).maybeSingle())
  const recibo = Object.fromEntries(FIELDS.map((k) => [k, values[k] === '' ? null : values[k]]))
  return unwrap(
    supabase.from('saas_settings').upsert({ id: 1, dados: { ...(row?.dados ?? {}), recibo }, updated_at: new Date().toISOString() }),
  )
}

/** Personalização do recibo da academia (null = padrão) */
export const getReceiptSettings = (academyId) =>
  unwrap(supabase.from('receipt_settings').select('*').eq('academy_id', academyId).maybeSingle())

const FIELDS = [
  'logo_url', 'cor', 'estilo', 'titulo', 'mensagem', 'rodape', 'cidade',
  'exibir_cnpj', 'exibir_endereco', 'exibir_contato', 'exibir_assinatura', 'exibir_selo',
  'assinatura_nome', 'assinatura_cargo', 'assinatura_modo', 'assinatura_url',
]

export function saveReceiptSettings(academyId, values) {
  const payload = Object.fromEntries(FIELDS.map((k) => [k, values[k] === '' ? null : values[k]]))
  return unwrap(supabase.from('receipt_settings').upsert({ ...payload, academy_id: academyId }))
}

const IMAGE_RULES = {
  logo: { types: /^image\/(png|jpe?g|webp)$/, typeMsg: 'Use uma imagem PNG, JPG ou WEBP', maxMb: 2 },
  assinatura: { types: /^image\/(png|webp)$/, typeMsg: 'Use uma imagem PNG (de preferência com fundo transparente)', maxMb: 1 },
}

/**
 * Upload de imagem do recibo (logo ou assinatura) em storage://academy-assets/{pasta}/...
 * @param {string} folder id da academia, ou 'saas' para o recibo da assinatura (somente Super Admin)
 * @param {File} file
 * @param {'logo'|'assinatura'} kind
 * @returns {Promise<string>} URL pública
 */
export async function uploadReceiptImage(folder, file, kind) {
  const rule = IMAGE_RULES[kind]
  if (!rule.types.test(file.type)) throw new Error(rule.typeMsg)
  if (file.size > rule.maxMb * 1024 * 1024) throw new Error(`A imagem deve ter no máximo ${rule.maxMb} MB`)
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
  const path = `${folder}/recibo-${kind}-${Date.now()}.${ext}`
  await unwrap(supabase.storage.from('academy-assets').upload(path, file, { upsert: true, contentType: file.type }))
  return supabase.storage.from('academy-assets').getPublicUrl(path).data.publicUrl
}
