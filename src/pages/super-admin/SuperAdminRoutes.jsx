import { lazy } from 'react'
import { Navigate, Route } from 'react-router-dom'
import SuperAdminLayout, { SuperGuard } from './layout/SuperAdminLayout'

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
const Chamados = lazy(() => import('./chamados/Chamados'))
const Avisos = lazy(() => import('./avisos/Avisos'))
const Perfil = lazy(() => import('./perfil/Perfil'))

const guard = (area, element) => <SuperGuard area={area}>{element}</SuperGuard>

/** Rotas /super-admin/* (protegidas por RoleGuard em AppRoutes; cada área conforme o papel) */
export const superAdminRoutes = (
  <Route path="/super-admin" element={<SuperAdminLayout />}>
    <Route index element={<Navigate to="dashboard" replace />} />
    <Route path="dashboard" element={<Dashboard />} />
    <Route path="academias" element={<AcademiasList />} />
    <Route path="academias/nova" element={guard('academias', <AcademiaNova />)} />
    <Route path="academias/:id" element={<AcademiaDetalhe />} />
    <Route path="planos-saas" element={guard('financeiro', <PlanosSaas />)} />
    <Route path="financeiro" element={guard('financeiro', <Financeiro />)} />
    <Route path="financeiro/recibo" element={guard('config', <PersonalizarRecibo />)} />
    <Route path="chamados" element={guard('suporte', <Chamados />)} />
    <Route path="chamados/:id" element={guard('suporte', <Chamados />)} />
    <Route path="avisos" element={guard('avisos', <Avisos />)} />
    <Route path="usuarios" element={guard('equipe', <Usuarios />)} />
    <Route path="auditoria" element={guard('auditoria', <Auditoria />)} />
    <Route path="configuracoes" element={guard('config', <Configuracoes />)} />
    <Route path="perfil" element={<Perfil />} />
  </Route>
)
