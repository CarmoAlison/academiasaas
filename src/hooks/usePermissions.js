import { useMemo } from 'react'
import { AREAS, ROLE_SLUGS } from '../utils/constants'
import { useAuth, useTenant } from './useAuth'

/**
 * Permissões do usuário na academia ativa.
 * Super Admin e perfil "admin" têm todas as permissões.
 */
export function usePermissions() {
  const { isSuperAdmin } = useAuth()
  const { membership, impersonating, academyId } = useTenant()

  return useMemo(() => {
    const roles = membership?.roles ?? []
    const permissions = new Set(membership?.permissions ?? [])
    const isAdmin = isSuperAdmin || roles.some((r) => r.slug === ROLE_SLUGS.ADMIN)
    // Super Admin dentro de uma academia ("acessar como") sempre tem a área de gestão,
    // mesmo que o CPF dele também tenha perfil de aluno nessa academia
    const isStaff = impersonating || (isSuperAdmin && Boolean(academyId)) || roles.some((r) => r.slug !== ROLE_SLUGS.ALUNO)
    const isStudent = Boolean(membership?.student_id) && roles.some((r) => r.slug === ROLE_SLUGS.ALUNO)

    /** @param {string} perm ex.: 'alunos.criar' */
    const can = (perm) => isAdmin || permissions.has(perm)
    /** @param {string[]} perms */
    const canAny = (perms) => perms.some(can)

    /** Áreas que o usuário pode acessar */
    const areas = new Set()
    if (isSuperAdmin) areas.add(AREAS.SUPER_ADMIN)
    if (academyId && isStaff) areas.add(AREAS.STAFF)
    if (academyId && isStudent) areas.add(AREAS.STUDENT)

    return { can, canAny, isAdmin, isStaff, isStudent, isSuperAdmin, areas, roles }
  }, [isSuperAdmin, membership, impersonating, academyId])
}
