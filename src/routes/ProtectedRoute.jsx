import { AlertTriangle } from 'lucide-react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import FullPageLoader from '../components/feedback/FullPageLoader'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import { useAuth } from '../hooks/useAuth'
import { errorMessage } from '../utils/errors'

/** Exige sessão ativa. Força a troca de senha no primeiro acesso. */
export default function ProtectedRoute() {
  const { session, loading, mustChangePassword, contextError, refresh, signOut } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageLoader />
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />

  if (contextError) {
    return (
      <div style={{ paddingTop: 96 }}>
        <EmptyState
          icon={AlertTriangle}
          title="Não foi possível carregar seu acesso"
          description={errorMessage(contextError)}
          action={
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="outline" onClick={signOut}>
                Sair
              </Button>
              <Button onClick={refresh}>Tentar novamente</Button>
            </div>
          }
        />
      </div>
    )
  }

  if (mustChangePassword && location.pathname !== '/trocar-senha') {
    return <Navigate to="/trocar-senha" replace state={{ from: location }} />
  }

  return <Outlet />
}
