import { supabase, unwrap } from './supabaseClient'

/**
 * Padrões das configurações da academia (valem enquanto o admin não salva nada).
 * Cada chave corresponde a uma coluna de academy_settings.
 */
export const ACADEMY_DEFAULTS = {
  // Financeiro
  dias_tolerancia: 5,
  bloquear_reservas_inadimplente: true,
}

/** Configurações efetivas (padrões + o que a academia salvou) */
export async function getAcademySettings(academyId) {
  const row = await unwrap(supabase.from('academy_settings').select('*').eq('academy_id', academyId).maybeSingle())
  return { ...ACADEMY_DEFAULTS, ...(row ?? {}) }
}

/** Salva as configurações (somente o perfil Admin — regra no banco) */
export function saveAcademySettings(academyId, values) {
  const payload = Object.fromEntries(Object.keys(ACADEMY_DEFAULTS).map((k) => [k, values[k] === '' ? null : values[k]]))
  return unwrap(supabase.from('academy_settings').upsert({ ...payload, academy_id: academyId }))
}
