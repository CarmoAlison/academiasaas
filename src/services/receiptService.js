import { supabase, unwrap } from './supabaseClient'

/**
 * Dados completos do recibo (pagamento, aluno, academia, unidade e personalização).
 * Disponível para o próprio aluno ou para quem tem financeiro.ver; somente pagamentos quitados.
 * @param {string} paymentId
 */
export const getReceipt = (paymentId) => unwrap(supabase.rpc('get_receipt', { p_payment_id: paymentId }))

/** Personalização do recibo da academia (null = padrão) */
export const getReceiptSettings = (academyId) =>
  unwrap(supabase.from('receipt_settings').select('*').eq('academy_id', academyId).maybeSingle())

const FIELDS = [
  'logo_url', 'cor', 'estilo', 'titulo', 'mensagem', 'rodape', 'cidade',
  'exibir_cnpj', 'exibir_endereco', 'exibir_contato', 'exibir_assinatura', 'exibir_selo',
  'assinatura_nome', 'assinatura_cargo',
]

export function saveReceiptSettings(academyId, values) {
  const payload = Object.fromEntries(FIELDS.map((k) => [k, values[k] === '' ? null : values[k]]))
  return unwrap(supabase.from('receipt_settings').upsert({ ...payload, academy_id: academyId }))
}

/**
 * Upload da logo do recibo em storage://academy-assets/{academyId}/...
 * @returns {Promise<string>} URL pública
 */
export async function uploadReceiptLogo(academyId, file) {
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) throw new Error('Use uma imagem PNG, JPG ou WEBP')
  if (file.size > 2 * 1024 * 1024) throw new Error('A logo deve ter no máximo 2 MB')
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
  const path = `${academyId}/recibo-logo-${Date.now()}.${ext}`
  await unwrap(supabase.storage.from('academy-assets').upload(path, file, { upsert: true, contentType: file.type }))
  return supabase.storage.from('academy-assets').getPublicUrl(path).data.publicUrl
}
