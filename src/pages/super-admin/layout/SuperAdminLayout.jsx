import { Building2, CreditCard, FileClock, LayoutDashboard, Package, Settings, ShieldCheck } from 'lucide-react'
import AppShell from '../../../components/shell/AppShell'
import ThemeToggle from '../../../components/shell/ThemeToggle'
import UserMenu from '../../../components/shell/UserMenu'
import { useAuth } from '../../../hooks/useAuth'

const GROUPS = [
  { items: [{ to: '/super-admin/dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    title: 'Gestão',
    items: [
      { to: '/super-admin/academias', label: 'Academias', icon: Building2 },
      { to: '/super-admin/planos-saas', label: 'Planos SaaS', icon: Package },
      { to: '/super-admin/financeiro', label: 'Financeiro', icon: CreditCard },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { to: '/super-admin/usuarios', label: 'Usuários', icon: ShieldCheck },
      { to: '/super-admin/auditoria', label: 'Auditoria', icon: FileClock },
      { to: '/super-admin/configuracoes', label: 'Configurações', icon: Settings },
    ],
  },
]

/** Layout do Super Admin: sidebar (desktop-first) */
export default function SuperAdminLayout() {
  const { context } = useAuth()
  const admin = context?.super_admin

  return (
    <AppShell
      brand={{ title: 'Academia SaaS', subtitle: 'Super Admin' }}
      groups={GROUPS}
      showTopbar={false}
      topbarRight={
        <>
          <ThemeToggle />
          <UserMenu name={admin?.nome} subtitle="Super Admin" compact />
        </>
      }
      sidebarFooter={(collapsed) => (
        <UserMenu name={admin?.nome} subtitle="Super Admin" compact={collapsed} placement="top" />
      )}
    />
  )
}
