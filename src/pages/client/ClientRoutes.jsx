import { lazy } from 'react'
import { Navigate, Route } from 'react-router-dom'
import ModuleGuard from '../../routes/ModuleGuard'
import ClientLayout from './layout/ClientLayout'

const Dashboard = lazy(() => import('./dashboard/Dashboard'))
const Treinos = lazy(() => import('./treinos/Treinos'))
const Aulas = lazy(() => import('./aulas/Aulas'))
const Financeiro = lazy(() => import('./financeiro/Financeiro'))
const Perfil = lazy(() => import('./perfil/Perfil'))
const Checkin = lazy(() => import('./checkin/Checkin'))
const Contratos = lazy(() => import('./contrato/Contratos'))

/** Rotas /client/* (protegidas por RoleGuard em AppRoutes) */
export const clientRoutes = (
  <Route path="/client" element={<ClientLayout />}>
    <Route index element={<Navigate to="dashboard" replace />} />
    <Route path="dashboard" element={<Dashboard />} />
    <Route path="treinos" element={<ModuleGuard module="treinos"><Treinos /></ModuleGuard>} />
    <Route path="aulas" element={<ModuleGuard module="aulas"><Aulas /></ModuleGuard>} />
    <Route path="financeiro" element={<ModuleGuard module="financeiro"><Financeiro /></ModuleGuard>} />
    <Route path="perfil" element={<Perfil />} />
    <Route path="checkin" element={<ModuleGuard module="checkin"><Checkin /></ModuleGuard>} />
    <Route path="contrato" element={<ModuleGuard module="contratos"><Contratos /></ModuleGuard>} />
  </Route>
)
