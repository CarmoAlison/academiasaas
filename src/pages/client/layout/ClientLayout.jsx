import { CalendarDays, Dumbbell, Home, ScanLine, User, Wallet } from 'lucide-react'
import { Suspense } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import ErrorBoundary from '../../../components/feedback/ErrorBoundary'
import { PageLoader } from '../../../components/feedback/FullPageLoader'
import AnnouncementBanner from '../../../components/announcements/AnnouncementBanner'
import BottomNav from '../../../components/shell/BottomNav'
import ThemeToggle from '../../../components/shell/ThemeToggle'
import UserMenu from '../../../components/shell/UserMenu'
import { Button } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { useBrand } from '../../../hooks/useBrand'
import { useModules } from '../../../hooks/useModules'
import { usePermissions } from '../../../hooks/usePermissions'
import { setPreferredArea } from '../../../routes/accessOptions'
import styles from './ClientLayout.module.css'

const NAV = [
  { to: '/client/dashboard', label: 'Início', icon: Home },
  { to: '/client/treinos', label: 'Treinos', icon: Dumbbell, module: 'treinos' },
  { to: '/client/aulas', label: 'Aulas', icon: CalendarDays, module: 'aulas' },
  { to: '/client/financeiro', label: 'Financeiro', icon: Wallet, module: 'financeiro' },
  { to: '/client/perfil', label: 'Perfil', icon: User },
]

// ação mais usada pelo aluno: botão central em destaque no menu inferior
const CHECKIN = { to: '/client/checkin', label: 'Check-in', icon: ScanLine, module: 'checkin', highlight: true }

/** Menu com o Check-in no meio */
function withCheckin(items, has) {
  if (!has('checkin')) return items
  const middle = Math.floor(items.length / 2)
  return [...items.slice(0, middle), CHECKIN, ...items.slice(middle)]
}

/** Layout do aluno: topbar + bottom nav no mobile */
export default function ClientLayout() {
  const { academy, membership } = useTenant()
  const { isStaff } = usePermissions()
  const location = useLocation()
  const profile = membership?.profile
  const brand = useBrand()
  const { has } = useModules()
  const nav = withCheckin(NAV.filter((i) => has(i.module)), has)

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.inner}>
          <div className={styles.brand}>
            {brand.logo ? (
              // com logo: só a logo (sem nome e ícone)
              <img className={styles.wordmark} src={brand.logo} alt={academy?.nome ?? ''} />
            ) : (
              <>
                <span className={styles.logo}>
                  <Dumbbell size={18} />
                </span>
                <strong>{academy?.nome}</strong>
              </>
            )}
          </div>
          <nav className={styles.desktopNav} aria-label="Navegação">
            {nav.map(({ to, label }) => (
              <NavLink key={to} to={to} className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}>
                {label}
              </NavLink>
            ))}
          </nav>
          <div className={styles.right}>
            {isStaff && (
              <Button variant="ghost" size="sm" to="/admin" className={styles.staffBtn} onClick={() => setPreferredArea('admin')}>
                Gestão
              </Button>
            )}
            <ThemeToggle size="sm" />
            <UserMenu name={profile?.nome} subtitle="Aluno" avatarUrl={profile?.avatar_url} profilePath="/client/perfil" compact />
          </div>
        </div>
      </header>
      <AnnouncementBanner />

      <main className={styles.content}>
        <ErrorBoundary key={location.pathname}>
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>

      <BottomNav items={nav} />
    </div>
  )
}
