import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase = createClient(url || 'http://localhost:54321', anonKey || 'missing-anon-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'academia.auth',
  },
})

/**
 * Desembrulha a resposta do supabase-js lançando o erro, se houver.
 * @template T
 * @param {PromiseLike<{ data: T, error: any, count?: number | null }>} promise
 * @returns {Promise<T>}
 */
export async function unwrap(promise) {
  const { data, error } = await promise
  if (error) throw error
  return data
}

/** Igual a unwrap, mas retorna { data, count } (consultas paginadas) */
export async function unwrapWithCount(promise) {
  const { data, error, count } = await promise
  if (error) throw error
  return { data: data ?? [], count: count ?? 0 }
}

/** Timestamp usado no soft delete */
export const nowISO = () => new Date().toISOString()
