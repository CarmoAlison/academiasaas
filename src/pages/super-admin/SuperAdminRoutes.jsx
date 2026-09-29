import { lazy } from 'react'
import { Navigate, Route } from 'react-router-dom'
import SuperAdminLayout from './layout/SuperAdminLayout'

const Dashboard = lazy(() => import('./dashboard/Dashboard'))
const AcademiasList = lazy(() => import('./academias/AcademiasList'))
const AcademiaNova = lazy(() => import('./academias/AcademiaNova'))
const AcademiaDetalhe = lazy(() => import('./academias/AcademiaDetalhe'))
const PlanosSaas = lazy(() => import('./planos-saas/PlanosSaas'))
const Financeiro = lazy(() => import('./financeiro/Financeiro'))
const PersonalizarRecibo = lazy(() => import('./financeiro/PersonalizarRecibo'))
const Usuarios = lazy(() => import('./usuarios/Usuarios'))
const Auditoria = lazy(() => import('./auditoria/Auditoria'))
const Configuracoes = lazy(() => import('./configuracoes/Configuracoes'))

/** Rotas /super-admin/* (protegidas por RoleGuard em AppRoutes) */
export const superAdminRoutes = (
  <Route path="/super-admin" element={<SuperAdminLayout />}>
    <Route index element={<Navigate to="dashboard" replace />} />
    <Route path="dashboard" element={<Dashboard />} />
    <Route path="academias" element={<AcademiasList />} />
    <Route path="academias/nova" element={<AcademiaNova />} />
    <Route path="academias/:id" element={<AcademiaDetalhe />} />
    <Route path="planos-saas" element={<PlanosSaas />} />
    <Route path="financeiro" element={<Financeiro />} />
    <Route path="financeiro/recibo" element={<PersonalizarRecibo />} />
    <Route path="usuarios" element={<Usuarios />} />
    <Route path="auditoria" element={<Auditoria />} />
    <Route path="configuracoes" element={<Configuracoes />} />
  </Route>
)
