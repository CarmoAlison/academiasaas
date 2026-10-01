import { ROLE_SLUGS } from '../utils/constants'

const AREA_KEY = 'academia.area'

/** Área preferida ('admin' | 'client') de quem é equipe e aluno ao mesmo tempo */
export function getPreferredArea() {
  try {
    return localStorage.getItem(AREA_KEY)
  } catch {
    return null
  }
}

export function setPreferredArea(area) {
  try {
    if (area) localStorage.setItem(AREA_KEY, area)
    else localStorage.removeItem(AREA_KEY)
  } catch {
    // storage indisponível
  }
}

/**
 * Lista os acessos possíveis do usuário após o login: painel Super Admin,
 * gestão (equipe) e área do aluno — um por academia.
 * @param {import('../contexts/AuthContext').UserContext} context
 * @returns {{ key: string, area: 'super'|'admin'|'client', academyId: string|null, membership?: object }[]}
 */
export function accessOptions(context) {
  if (!context) return []
  const options = []
  if (context.super_admin) options.push({ key: 'super', area: 'super', academyId: null })
  for (const m of context.memberships) {
    if (m.roles.some((r) => r.slug !== ROLE_SLUGS.ALUNO)) {
      options.push({ key: `admin-${m.academy_id}`, area: 'admin', academyId: m.academy_id, membership: m })
    }
    if (m.student_id) {
      options.push({ key: `client-${m.academy_id}`, area: 'client', academyId: m.academy_id, membership: m })
    }
  }
  return options
}

export const optionPath = (option) =>
  option.area === 'super' ? '/super-admin/dashboard' : option.area === 'admin' ? '/admin' : '/client/dashboard'
