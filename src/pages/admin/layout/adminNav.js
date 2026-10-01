import {
  CalendarDays,
  CreditCard,
  Dumbbell,
  FileClock,
  LayoutDashboard,
  MapPin,
  Package,
  Receipt,
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
      { to: '/admin/treinos', label: 'Treinos', icon: Dumbbell, perms: ['treinos.ver'] },
      { to: '/admin/aulas', label: 'Aulas', icon: CalendarDays, perms: ['aulas.ver'] },
      { to: '/admin/financeiro', label: 'Financeiro', icon: CreditCard, perms: ['financeiro.ver'] },
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
      { to: '/admin/perfil-acesso', label: 'Perfil de acesso', icon: ShieldCheck, perms: ['perfis.ver', 'equipe.ver'] },
      { to: '/admin/auditoria', label: 'Auditoria', icon: FileClock, perms: ['auditoria.ver'] },
      // "assinatura.ver" não existe na matriz de permissões: só o perfil Admin (e o Super Admin) enxerga
      { to: '/admin/assinatura', label: 'Assinatura do sistema', icon: Receipt, perms: [ADMIN_ONLY] },
      { to: '/admin/configuracoes', label: 'Configurações', icon: Settings, perms: [ADMIN_ONLY] },
    ],
  },
]

/** Filtra o menu conforme as permissões */
export function visibleNav(canAny) {
  return ADMIN_NAV.map((g) => ({ ...g, items: g.items.filter((i) => canAny(i.perms)) })).filter((g) => g.items.length)
}
