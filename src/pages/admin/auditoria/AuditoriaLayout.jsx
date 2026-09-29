import { Outlet } from 'react-router-dom'
import { PageHeader, Tabs } from '../../../components/ui'

const TABS = [
  { key: 'geral', label: 'Visão geral', to: '/admin/auditoria', end: true },
  { key: 'detalhado', label: 'Log detalhado', to: '/admin/auditoria/log-detalhado' },
  { key: 'completo', label: 'Log completo', to: '/admin/auditoria/log-completo' },
  { key: 'erros', label: 'Erros', to: '/admin/auditoria/erros' },
  { key: 'acessos', label: 'Acessos', to: '/admin/auditoria/acessos' },
]

export default function AuditoriaLayout() {
  return (
    <>
      <PageHeader title="Auditoria" subtitle="Histórico de alterações, erros e acessos da academia" />
      <Tabs items={TABS} />
      <Outlet />
    </>
  )
}
