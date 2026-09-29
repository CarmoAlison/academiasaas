import { Outlet } from 'react-router-dom'
import NoPermission from '../components/feedback/NoPermission'
import { usePermissions } from '../hooks/usePermissions'

/**
 * Exige uma permissão granular (recurso.acao) na academia ativa.
 * @param {{ perm?: string, any?: string[], children?: any }} props
 */
export default function PermissionGuard({ perm, any, children }) {
  const { can, canAny } = usePermissions()
  const allowed = perm ? can(perm) : any ? canAny(any) : true
  if (!allowed) return <NoPermission />
  return children ?? <Outlet />
}
