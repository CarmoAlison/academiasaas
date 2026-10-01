import { lazy } from 'react'
import { Navigate, Route } from 'react-router-dom'
import ClientLayout from './layout/ClientLayout'

const Dashboard = lazy(() => import('./dashboard/Dashboard'))
const Treinos = lazy(() => import('./treinos/Treinos'))
const Aulas = lazy(() => import('./aulas/Aulas'))
const Financeiro = lazy(() => import('./financeiro/Financeiro'))
const Perfil = lazy(() => import('./perfil/Perfil'))
const Checkin = lazy(() => import('./checkin/Checkin'))

/** Rotas /client/* (protegidas por RoleGuard em AppRoutes) */
export const clientRoutes = (
  <Route path="/client" element={<ClientLayout />}>
    <Route index element={<Navigate to="dashboard" replace />} />
    <Route path="dashboard" element={<Dashboard />} />
    <Route path="treinos" element={<Treinos />} />
    <Route path="aulas" element={<Aulas />} />
    <Route path="financeiro" element={<Financeiro />} />
    <Route path="perfil" element={<Perfil />} />
    <Route path="checkin" element={<Checkin />} />
  </Route>
)
