import { lazy } from 'react'
import { Route } from 'react-router-dom'
import PermissionGuard from '../../routes/PermissionGuard'
import AdminIndex from './layout/AdminIndex'
import AdminLayout from './layout/AdminLayout'
import { ADMIN_ONLY } from './layout/adminNav'

const Dashboard = lazy(() => import('./dashboard/Dashboard'))
const AlunosList = lazy(() => import('./alunos/AlunosList'))
const AlunoForm = lazy(() => import('./alunos/AlunoForm'))
const TreinosList = lazy(() => import('./treinos/TreinosList'))
const TreinoForm = lazy(() => import('./treinos/TreinoForm'))
const AulasList = lazy(() => import('./aulas/AulasList'))
const AulaForm = lazy(() => import('./aulas/AulaForm'))
const PlanosList = lazy(() => import('./planos/PlanosList'))
const PlanoForm = lazy(() => import('./planos/PlanoForm'))
const UnidadesList = lazy(() => import('./unidades/UnidadesList'))
const UnidadeForm = lazy(() => import('./unidades/UnidadeForm'))
const Financeiro = lazy(() => import('./financeiro/Financeiro'))
const PersonalizarRecibo = lazy(() => import('./financeiro/PersonalizarRecibo'))
const PerfilAcesso = lazy(() => import('./perfil-acesso/PerfilAcesso'))
const GerenciarPerfil = lazy(() => import('./perfil-acesso/GerenciarPerfil'))
const AuditoriaLayout = lazy(() => import('./auditoria/AuditoriaLayout'))
const AuditoriaHome = lazy(() => import('./auditoria/AuditoriaHome'))
const LogDetalhado = lazy(() => import('./auditoria/LogDetalhado'))
const LogCompleto = lazy(() => import('./auditoria/LogCompleto'))
const Erros = lazy(() => import('./auditoria/Erros'))
const Acessos = lazy(() => import('./auditoria/Acessos'))
const Perfil = lazy(() => import('./perfil/Perfil'))
const Assinatura = lazy(() => import('./assinatura/Assinatura'))
const ConfiguracoesAcademia = lazy(() => import('./configuracoes/ConfiguracoesAcademia'))

const guard = (perm, element) => <PermissionGuard perm={perm}>{element}</PermissionGuard>

/** Rotas /admin/* (protegidas por RoleGuard em AppRoutes) */
export const adminRoutes = (
  <Route path="/admin" element={<AdminLayout />}>
    <Route index element={<AdminIndex />} />
    <Route path="dashboard" element={guard('dashboard.ver', <Dashboard />)} />

    <Route path="alunos" element={guard('alunos.ver', <AlunosList />)} />
    <Route path="alunos/novo" element={guard('alunos.criar', <AlunoForm />)} />
    <Route path="alunos/:id" element={guard('alunos.ver', <AlunoForm />)} />

    <Route path="treinos" element={guard('treinos.ver', <TreinosList />)} />
    <Route path="treinos/novo" element={guard('treinos.criar', <TreinoForm />)} />
    <Route path="treinos/:id" element={guard('treinos.ver', <TreinoForm />)} />

    <Route path="aulas" element={guard('aulas.ver', <AulasList />)} />
    <Route path="aulas/nova" element={guard('aulas.criar', <AulaForm />)} />
    <Route path="aulas/:id" element={guard('aulas.ver', <AulaForm />)} />

    <Route path="planos" element={guard('planos.ver', <PlanosList />)} />
    <Route path="planos/novo" element={guard('planos.criar', <PlanoForm />)} />
    <Route path="planos/:id" element={guard('planos.ver', <PlanoForm />)} />

    <Route path="unidades" element={guard('unidades.ver', <UnidadesList />)} />
    <Route path="unidades/nova" element={guard('unidades.criar', <UnidadeForm />)} />
    <Route path="unidades/:id" element={guard('unidades.ver', <UnidadeForm />)} />

    <Route path="financeiro" element={guard('financeiro.ver', <Financeiro />)} />
    <Route path="financeiro/recibo" element={guard('financeiro.editar', <PersonalizarRecibo />)} />

    <Route path="perfil-acesso" element={<PermissionGuard any={['perfis.ver', 'equipe.ver']}><PerfilAcesso /></PermissionGuard>} />
    <Route path="perfil-acesso/gerenciar" element={guard('perfis.ver', <GerenciarPerfil />)} />

    <Route path="auditoria" element={guard('auditoria.ver', <AuditoriaLayout />)}>
      <Route index element={<AuditoriaHome />} />
      <Route path="log-detalhado" element={<LogDetalhado />} />
      <Route path="log-completo" element={<LogCompleto />} />
      <Route path="erros" element={<Erros />} />
      <Route path="acessos" element={<Acessos />} />
    </Route>

    <Route path="assinatura" element={guard(ADMIN_ONLY, <Assinatura />)} />
    <Route path="configuracoes" element={guard(ADMIN_ONLY, <ConfiguracoesAcademia />)} />

    <Route path="perfil" element={<Perfil />} />
  </Route>
)
