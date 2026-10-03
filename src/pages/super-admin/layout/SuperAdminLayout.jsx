import { useQuery } from '@tanstack/react-query'
import { Building2, CreditCard, FileClock, LayoutDashboard, LifeBuoy, Megaphone, Package, Settings, ShieldCheck } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import AppShell from '../../../components/shell/AppShell'
import ThemeToggle from '../../../components/shell/ThemeToggle'
import UserMenu from '../../../components/shell/UserMenu'
import { useAuth } from '../../../hooks/useAuth'
import { useSuperRole } from '../../../hooks/useSuperRole'
import { useSupportRealtime } from '../../../hooks/useSupportRealtime'
import { unreadTickets } from '../../../services/supportService'

/** `area`: permissão do papel necessária (ver useSuperRole); sem área = todos */
const GROUPS = [
  { items: [{ to: '/super-admin/dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    title: 'Gestão',
    items: [
      { to: '/super-admin/academias', label: 'Academias', icon: Building2 },
      { to: '/super-admin/planos-saas', label: 'Planos SaaS', icon: Package, area: 'financeiro' },
      { to: '/super-admin/financeiro', label: 'Financeiro', icon: CreditCard, area: 'financeiro' },
    ],
  },
  {
    title: 'Atendimento',
    items: [
      { to: '/super-admin/chamados', label: 'Chamados', icon: LifeBuoy, area: 'suporte', badgeKey: 'chamados' },
      { to: '/super-admin/avisos', label: 'Avisos', icon: Megaphone, area: 'avisos' },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { to: '/super-admin/usuarios', label: 'Usuários', icon: ShieldCheck, area: 'equipe' },
      { to: '/super-admin/auditoria', label: 'Auditoria', icon: FileClock, area: 'auditoria' },
      { to: '/super-admin/configuracoes', label: 'Configurações', icon: Settings, area: 'config' },
    ],
  },
]

/** Bloqueia rotas que o papel não acessa (a regra real está no banco) */
export function SuperGuard({ area, children }) {
  const { superCan } = useSuperRole()
  return superCan(area) ? children : <Navigate to="/super-admin/dashboard" replace />
}

/** Layout do Super Admin: sidebar (desktop-first) */
export default function SuperAdminLayout() {
  const { context } = useAuth()
  const { superCan, label } = useSuperRole()
  const admin = context?.super_admin

  useSupportRealtime(superCan('suporte'))
  const unread = useQuery({
    queryKey: ['tickets-unread', 'suporte'],
    queryFn: () => unreadTickets({ suporte: true }),
    enabled: superCan('suporte'),
    refetchInterval: 60000,
  })
  const badges = { chamados: unread.data || null }

  const groups = GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.area || superCan(i.area)).map((i) => ({ ...i, badge: i.badgeKey ? badges[i.badgeKey] : null })),
  })).filter((g) => g.items.length)

  return (
    <AppShell
      brand={{ title: 'Academia SaaS', subtitle: 'Super Admin' }}
      groups={groups}
      showTopbar={false}
      topbarRight={
        <>
          <ThemeToggle />
          <UserMenu name={admin?.nome} subtitle={label} compact />
        </>
      }
      sidebarFooter={(collapsed) => <UserMenu name={admin?.nome} subtitle={label} compact={collapsed} placement="top" />}
    />
  )
}
