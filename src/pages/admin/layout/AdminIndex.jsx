import { Navigate } from 'react-router-dom'
import { PageLoader } from '../../../components/feedback/FullPageLoader'
import { useModules } from '../../../hooks/useModules'
import { usePermissions } from '../../../hooks/usePermissions'
import { visibleNav } from './adminNav'

/** /admin → primeira página liberada para o usuário */
export default function AdminIndex() {
  const { canAny } = usePermissions()
  const { has, loaded } = useModules()
  if (!loaded) return <PageLoader />
  const first = visibleNav(canAny, { hasModule: has })[0]?.items[0]
  return <Navigate to={first?.to ?? '/admin/perfil'} replace />
}
