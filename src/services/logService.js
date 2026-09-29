import { supabase } from './supabaseClient'

let currentAcademyId = null

/** Define a academia usada como contexto nos logs de erro */
export function setLogContext(academyId) {
  currentAcademyId = academyId || null
}

/**
 * Registra login/logout em access_logs (IP capturado no servidor)
 * @param {string|null} academyId
 * @param {'login'|'logout'} evento
 */
export async function logAccess(academyId, evento) {
  try {
    await supabase.rpc('log_access', {
      p_academy: academyId || null,
      p_evento: evento,
      p_user_agent: navigator.userAgent,
    })
  } catch {
    // log nunca deve quebrar o fluxo
  }
}

const recent = new Map()

/**
 * Registra erro do frontend na tabela errors
 * @param {unknown} error
 * @param {{ rota?: string }} [extra]
 */
export async function logError(error, extra = {}) {
  const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error))
  const key = err.message
  const last = recent.get(key)
  if (last && Date.now() - last < 10_000) return // evita flood do mesmo erro
  recent.set(key, Date.now())

  try {
    await supabase.rpc('log_error', {
      p_academy: currentAcademyId,
      p_mensagem: err.message,
      p_stack: err.stack || null,
      p_rota: extra.rota || window.location.pathname,
      p_user_agent: navigator.userAgent,
    })
  } catch {
    // ignora
  }
}

/** Captura erros globais não tratados */
export function installGlobalErrorHandlers() {
  window.addEventListener('error', (event) => logError(event.error || event.message))
  window.addEventListener('unhandledrejection', (event) => logError(event.reason))
}
