import { Navigate } from 'react-router-dom'
import { usePermissions } from '../../../hooks/usePermissions'
import { visibleNav } from './adminNav'

/** /admin → primeira página liberada para o usuário */
export default function AdminIndex() {
  const { canAny } = usePermissions()
  const first = visibleNav(canAny)[0]?.items[0]
  return <Navigate to={first?.to ?? '/admin/perfil'} replace />
}
