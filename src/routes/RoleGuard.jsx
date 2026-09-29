import { Ban } from 'lucide-react'
import { Navigate, Outlet } from 'react-router-dom'
import FullPageLoader from '../components/feedback/FullPageLoader'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import { useAuth, useLogout, useTenant } from '../hooks/useAuth'
import { usePermissions } from '../hooks/usePermissions'
import { AREAS } from '../utils/constants'
import { resolveHome } from './resolveHome'

/**
 * Restringe um grupo de rotas por área (super_admin | staff | student).
 * @param {{ allow: string[] }} props
 */
export default function RoleGuard({ allow }) {
  const { context, isSuperAdmin } = useAuth()
  const { academyId, membership } = useTenant()
  const { areas } = usePermissions()
  const logout = useLogout()

  // aguardando auto-seleção da única academia do usuário
  if (!academyId && !isSuperAdmin && context?.memberships.length === 1) return <FullPageLoader />

  const tenantArea = allow.includes(AREAS.STAFF) || allow.includes(AREAS.STUDENT)
  if (tenantArea && membership && membership.academy_status !== 'ativa' && !isSuperAdmin) {
    return (
      <div style={{ paddingTop: 96 }}>
        <EmptyState
          icon={Ban}
          title="Academia indisponível"
          description={`O acesso à ${membership.academy_nome} está ${membership.academy_status}. Entre em contato com a administração.`}
          action={<Button variant="outline" onClick={logout}>Sair</Button>}
        />
      </div>
    )
  }

  if (allow.some((area) => areas.has(area))) return <Outlet />

  return <Navigate to={resolveHome(context, academyId)} replace />
}
