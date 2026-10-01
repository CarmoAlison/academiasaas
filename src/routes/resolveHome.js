import { ROLE_SLUGS } from '../utils/constants'
import { getPreferredArea } from './accessOptions'

/**
 * Define a rota inicial do usuário conforme seus vínculos.
 * @param {import('../contexts/AuthContext').UserContext|undefined} context
 * @param {string|null} academyId academia ativa
 */
export function resolveHome(context, academyId) {
  if (!context) return '/login'
  const { memberships, super_admin } = context
  const membership =
    memberships.find((m) => m.academy_id === academyId) ?? (memberships.length === 1 && !super_admin ? memberships[0] : null)

  // Super Admin com academia selecionada ("acessar como") → gestão da academia
  if (super_admin && academyId) return '/admin'

  if (membership) {
    const isStaff = membership.roles.some((r) => r.slug !== ROLE_SLUGS.ALUNO)
    // equipe que também treina: respeita o acesso escolhido no login
    if (isStaff && membership.student_id && getPreferredArea() === 'client') return '/client/dashboard'
    if (isStaff) return '/admin'
    if (membership.student_id) return '/client/dashboard'
  }
  if (super_admin) return '/super-admin/dashboard'
  if (memberships.length > 1) return '/selecionar-academia'
  return '/sem-acesso'
}
