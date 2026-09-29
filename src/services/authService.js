import { CPF_EMAIL_DOMAIN } from '../utils/constants'
import { onlyDigits } from '../utils/formatters'
import { supabase, unwrap } from './supabaseClient'

/** CPF → e-mail interno usado no Supabase Auth */
export const cpfToEmail = (cpf) => `${onlyDigits(cpf)}@${CPF_EMAIL_DOMAIN}`

export const defaultPasswordFor = (cpf) => onlyDigits(cpf).slice(0, 6)

/**
 * Login por CPF + senha
 * @param {string} cpf
 * @param {string} password
 */
export async function signInWithCPF(cpf, password) {
  const data = await unwrap(supabase.auth.signInWithPassword({ email: cpfToEmail(cpf), password }))
  return data.session
}

export async function signOut() {
  await supabase.auth.signOut()
}

/**
 * Contexto do usuário: super admin + vínculos com academias (perfis e permissões)
 * @returns {Promise<import('../contexts/AuthContext').UserContext>}
 */
export const getContext = () => unwrap(supabase.rpc('get_my_context'))

/**
 * Troca a senha validando a senha atual.
 * @param {{ email: string, current: string, next: string }} params
 */
export async function changePassword({ email, current, next }) {
  const { error: authError } = await supabase.auth.signInWithPassword({ email, password: current })
  if (authError) throw new Error('Senha atual incorreta')
  await unwrap(supabase.auth.updateUser({ password: next }))
  await unwrap(supabase.rpc('mark_password_changed'))
}

/** Admin: volta a senha para os 6 primeiros dígitos do CPF */
export const resetPassword = (profileId) => unwrap(supabase.rpc('reset_password', { p_profile_id: profileId }))
