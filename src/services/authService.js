import { CPF_EMAIL_DOMAIN } from '../utils/constants'
import { onlyDigits } from '../utils/formatters'
import { supabase, unwrap } from './supabaseClient'

/** CPF → e-mail interno usado no Supabase Auth */
export const cpfToEmail = (cpf) => `${onlyDigits(cpf)}@${CPF_EMAIL_DOMAIN}`

export const defaultPasswordFor = (cpf) => onlyDigits(cpf).slice(0, 6)

/** Erro de login com informações do bloqueio por tentativas */
export class LoginError extends Error {
  /** @param {string} message @param {{ bloqueado?: boolean, segundos?: number, tentativas_restantes?: number }} [status] */
  constructor(message, status = {}) {
    super(message)
    this.name = 'LoginError'
    this.status = status
  }
}

const minutes = (s) => Math.max(1, Math.ceil((s ?? 0) / 60))

/**
 * Login por CPF + senha.
 * Bloqueio: após 5 senhas erradas em 15 min o CPF fica bloqueado por 15 min (controlado no banco).
 * @param {string} cpf
 * @param {string} password
 * @param {string} [captchaToken] token do Cloudflare Turnstile, quando o CAPTCHA estiver ativo
 */
export async function signInWithCPF(cpf, password, captchaToken) {
  const digits = onlyDigits(cpf)

  const { data: status } = await supabase.rpc('login_status', { p_cpf: digits })
  if (status?.bloqueado) {
    throw new LoginError(`Acesso bloqueado por excesso de tentativas. Tente novamente em ${minutes(status.segundos)} min.`, status)
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: cpfToEmail(digits),
    password,
    options: captchaToken ? { captchaToken } : undefined,
  })

  if (error) {
    if (/invalid login credentials/i.test(error.message)) {
      const { data: after } = await supabase.rpc('login_failed', { p_cpf: digits })
      if (after?.bloqueado) {
        throw new LoginError(`Muitas tentativas. Acesso bloqueado por ${minutes(after.segundos)} min.`, after)
      }
      const rest = after?.tentativas_restantes
      throw new LoginError(
        rest != null && rest <= 2
          ? `CPF ou senha incorretos. Mais ${rest} tentativa(s) antes do bloqueio temporário.`
          : 'CPF ou senha incorretos',
        after ?? {},
      )
    }
    if (/captcha/i.test(error.message)) throw new LoginError('Confirme a verificação de segurança e tente novamente.')
    throw error
  }

  // zera o contador de falhas deste CPF (não bloqueia o login se falhar)
  supabase.rpc('login_succeeded').then(() => {}, () => {})
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
 * Troca a senha validando a senha atual no banco (sem novo login: compatível com CAPTCHA).
 * Erros de senha atual contam para o bloqueio por tentativas.
 * @param {{ current: string, next: string }} params
 */
export async function changePassword({ current, next }) {
  const ok = await unwrap(supabase.rpc('verify_my_password', { p_password: current }))
  if (!ok) throw new Error('Senha atual incorreta')
  await unwrap(supabase.auth.updateUser({ password: next }))
  await unwrap(supabase.rpc('mark_password_changed'))
}

/**
 * Regras da nova senha (mais forte que a senha padrão de 6 dígitos).
 * @returns {string|undefined} mensagem de erro
 */
export function passwordProblem(next, { cpf = '', current = '' } = {}) {
  const digits = onlyDigits(cpf)
  if (!next || next.length < 8) return 'Use pelo menos 8 caracteres'
  if (!/[A-Za-z]/.test(next) || !/\d/.test(next)) return 'Use letras e números'
  if (next === current) return 'A nova senha deve ser diferente da atual'
  if (digits && (next.includes(digits.slice(0, 6)) || next.includes(digits))) return 'Não use o seu CPF na senha'
  if (/^(.)\1+$/.test(next) || /^(12345678|abcdefgh|senha123|password)/i.test(next)) return 'Senha muito fácil de adivinhar'
  return undefined
}

/** Admin: volta a senha para os 6 primeiros dígitos do CPF */
export const resetPassword = (profileId) => unwrap(supabase.rpc('reset_password', { p_profile_id: profileId }))
