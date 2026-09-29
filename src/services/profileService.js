import { onlyDigits } from '../utils/formatters'
import { supabase, unwrap } from './supabaseClient'

/**
 * Atualiza os dados do próprio perfil numa academia
 * @param {string} profileId
 * @param {{ nome: string, telefone?: string, email_contato?: string, avatar_url?: string }} values
 */
export const updateMyProfile = (profileId, values) =>
  unwrap(
    supabase
      .from('profiles')
      .update({
        nome: values.nome,
        telefone: onlyDigits(values.telefone) || null,
        email_contato: values.email_contato || null,
        ...(values.avatar_url !== undefined ? { avatar_url: values.avatar_url } : {}),
      })
      .eq('id', profileId),
  )

export const updateSuperAdminProfile = (id, values) =>
  unwrap(supabase.from('super_admins').update({ nome: values.nome, email: values.email || null }).eq('id', id))

/**
 * Upload do avatar em storage://avatars/{userId}/...
 * @param {string} userId
 * @param {File} file
 * @returns {Promise<string>} URL pública
 */
export async function uploadAvatar(userId, file) {
  if (file.size > 2 * 1024 * 1024) throw new Error('Imagem deve ter no máximo 2 MB')
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${userId}/avatar-${Date.now()}.${ext}`
  await unwrap(supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type }))
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
}
