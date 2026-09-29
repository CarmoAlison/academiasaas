import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import FullPageLoader from '../components/feedback/FullPageLoader'
import { useAuth, useTenant } from '../hooks/useAuth'
import { adminRoutes } from '../pages/admin/AdminRoutes'
import { clientRoutes } from '../pages/client/ClientRoutes'
import { superAdminRoutes } from '../pages/super-admin/SuperAdminRoutes'
import { AREAS } from '../utils/constants'
import ProtectedRoute from './ProtectedRoute'
import { resolveHome } from './resolveHome'
import RoleGuard from './RoleGuard'

const Login = lazy(() => import('../pages/auth/Login'))
const RecuperarSenha = lazy(() => import('../pages/auth/RecuperarSenha'))
const TrocarSenha = lazy(() => import('../pages/auth/TrocarSenha'))
const SelecionarAcademia = lazy(() => import('../pages/auth/SelecionarAcademia'))
const SemAcesso = lazy(() => import('../pages/auth/SemAcesso'))
const NotFound = lazy(() => import('../pages/NotFound'))

/** "/" → área inicial do usuário */
function HomeRedirect() {
  const { session, context, loading } = useAuth()
  const { academyId } = useTenant()
  if (loading) return <FullPageLoader />
  if (!session) return <Navigate to="/login" replace />
  return <Navigate to={resolveHome(context, academyId)} replace />
}

export default function AppRoutes() {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <Routes>
        {/* Públicas */}
        <Route path="/login" element={<Login />} />
        <Route path="/recuperar-senha" element={<RecuperarSenha />} />

        {/* Autenticadas */}
        <Route element={<ProtectedRoute />}>
          <Route path="/trocar-senha" element={<TrocarSenha />} />
          <Route path="/selecionar-academia" element={<SelecionarAcademia />} />
          <Route path="/sem-acesso" element={<SemAcesso />} />

          <Route element={<RoleGuard allow={[AREAS.SUPER_ADMIN]} />}>{superAdminRoutes}</Route>
          <Route element={<RoleGuard allow={[AREAS.STAFF]} />}>{adminRoutes}</Route>
          <Route element={<RoleGuard allow={[AREAS.STUDENT]} />}>{clientRoutes}</Route>
        </Route>

        <Route path="/" element={<HomeRedirect />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}
