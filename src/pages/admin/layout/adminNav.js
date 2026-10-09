import {
  BarChart3,
  CalendarDays,
  CreditCard,
  Dumbbell,
  FileClock,
  LayoutDashboard,
  LifeBuoy,
  MapPin,
  MessageCircle,
  Package,
  Receipt,
  ScanLine,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react'

/** Permissão fictícia que só o perfil Admin (que tem todas) satisfaz */
export const ADMIN_ONLY = 'assinatura.ver'

/**
 * Menu da área admin. `perms` = qualquer uma das permissões libera o item.
 */
export const ADMIN_NAV = [
  {
    items: [{ to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, perms: ['dashboard.ver'] }],
  },
  {
    title: 'Operação',
    items: [
      { to: '/admin/alunos', label: 'Alunos', icon: Users, perms: ['alunos.ver'] },
      { to: '/admin/treinos', label: 'Treinos', icon: Dumbbell, perms: ['treinos.ver'], module: 'treinos' },
      { to: '/admin/aulas', label: 'Aulas', icon: CalendarDays, perms: ['aulas.ver'], module: 'aulas' },
      { to: '/admin/checkin', label: 'Check-in', icon: ScanLine, perms: ['alunos.ver'], module: 'checkin' },
      { to: '/admin/financeiro', label: 'Financeiro', icon: CreditCard, perms: ['financeiro.ver'], module: 'financeiro' },
      { to: '/admin/whatsapp', label: 'WhatsApp', icon: MessageCircle, perms: ['financeiro.ver'], module: 'whatsapp' },
    ],
  },
  {
    title: 'Cadastros',
    items: [
      { to: '/admin/planos', label: 'Planos', icon: Package, perms: ['planos.ver'] },
      { to: '/admin/unidades', label: 'Unidades', icon: MapPin, perms: ['unidades.ver'] },
    ],
  },
  {
    title: 'Administração',
    items: [
      { to: '/admin/relatorios', label: 'Relatórios', icon: BarChart3, perms: ['relatorios.ver'], module: 'relatorios' },
      { to: '/admin/perfil-acesso', label: 'Perfil de acesso', icon: ShieldCheck, perms: ['perfis.ver', 'equipe.ver'] },
      { to: '/admin/auditoria', label: 'Auditoria', icon: FileClock, perms: ['auditoria.ver'], module: 'auditoria' },
      // "assinatura.ver" não existe na matriz de permissões: só o perfil Admin (e o Super Admin) enxerga
      { to: '/admin/assinatura', label: 'Assinatura do sistema', icon: Receipt, perms: [ADMIN_ONLY] },
      { to: '/admin/configuracoes', label: 'Configurações', icon: Settings, perms: [ADMIN_ONLY] },
      // chamados com o suporte do SaaS: toda a equipe da academia
      { to: '/admin/suporte', label: 'Suporte', icon: LifeBuoy, staffOnly: true, badgeKey: 'suporte', module: 'suporte' },
    ],
  },
]

/**
 * Filtra o menu conforme as permissões. Itens sem `perms` valem para toda a equipe
 * (exceto `staffOnly` no "acessar como" do Super Admin). `badges` = contadores por `badgeKey`.
 * `module` = módulo da academia exigido (liberado pelo Super Admin); bloqueado some do menu.
 */
export function visibleNav(canAny, { impersonating = false, badges = {}, hasModule = () => true } = {}) {
  return ADMIN_NAV.map((g) => ({
    ...g,
    items: g.items
      .filter((i) => hasModule(i.module))
      .filter((i) => (i.perms ? canAny(i.perms) : !(i.staffOnly && impersonating)))
      .map((i) => (i.badgeKey ? { ...i, badge: badges[i.badgeKey] } : i)),
  })).filter((g) => g.items.length)
}
