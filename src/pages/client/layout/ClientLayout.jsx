import { CalendarDays, Dumbbell, Home, User, Wallet } from 'lucide-react'
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
import { usePermissions } from '../../../hooks/usePermissions'
import { setPreferredArea } from '../../../routes/accessOptions'
import styles from './ClientLayout.module.css'

const NAV = [
  { to: '/client/dashboard', label: 'Início', icon: Home },
  { to: '/client/treinos', label: 'Treinos', icon: Dumbbell },
  { to: '/client/aulas', label: 'Aulas', icon: CalendarDays },
  { to: '/client/financeiro', label: 'Financeiro', icon: Wallet },
  { to: '/client/perfil', label: 'Perfil', icon: User },
]

/** Layout do aluno: topbar + bottom nav no mobile */
export default function ClientLayout() {
  const { academy, membership } = useTenant()
  const { isStaff } = usePermissions()
  const location = useLocation()
  const profile = membership?.profile
  const brand = useBrand()

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.inner}>
          <div className={styles.brand}>
            <span className={styles.logo}>
              {brand.logo ? <img src={brand.logo} alt="" /> : <Dumbbell size={18} />}
            </span>
            <strong>{academy?.nome}</strong>
          </div>
          <nav className={styles.desktopNav} aria-label="Navegação">
            {NAV.map(({ to, label }) => (
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

      <BottomNav items={NAV} />
    </div>
  )
}
