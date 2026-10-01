import { VIDEO_MAX_MB, VIDEO_TYPES } from '../utils/video'
import { createTenantCrud } from './crudFactory'
import { supabase, unwrap } from './supabaseClient'

/** Unidades da academia */
export const unitService = createTenantCrud('units')

/** Planos da academia */
export const planService = createTenantCrud('plans')

/** Biblioteca de exercícios */
export const exerciseService = createTenantCrud('exercises')

/**
 * Envia o vídeo de um exercício (exercise-videos/{academia}/...) e retorna a URL pública
 * @param {string} academyId
 * @param {File} file
 */
export async function uploadExerciseVideo(academyId, file) {
  if (!VIDEO_TYPES.test(file.type)) throw new Error('Envie um vídeo MP4, WEBM ou MOV')
  if (file.size > VIDEO_MAX_MB * 1024 * 1024) throw new Error(`O vídeo deve ter no máximo ${VIDEO_MAX_MB} MB`)
  const ext = file.name.split('.').pop()?.toLowerCase() || 'mp4'
  const path = `${academyId}/${crypto.randomUUID()}.${ext}`
  await unwrap(supabase.storage.from('exercise-videos').upload(path, file, { contentType: file.type, cacheControl: '31536000' }))
  return supabase.storage.from('exercise-videos').getPublicUrl(path).data.publicUrl
}
