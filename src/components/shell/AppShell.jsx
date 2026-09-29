import { Suspense, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import ErrorBoundary from '../feedback/ErrorBoundary'
import { PageLoader } from '../feedback/FullPageLoader'
import styles from './AppShell.module.css'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

const COLLAPSE_KEY = 'academia.sidebar.collapsed'

const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Layout com sidebar retrátil + topbar.
 * @param {object} props
 * @param {object} props.brand
 * @param {import('./Sidebar').NavGroup[]} props.groups
 * @param {import('react').ReactNode} [props.topbarLeft]
 * @param {import('react').ReactNode} [props.topbarRight]
 * @param {boolean} [props.showTopbar] false = topbar apenas no mobile (para abrir o menu)
 * @param {import('react').ReactNode} [props.sidebarFooter]
 * @param {import('react').ReactNode} [props.banner] faixa acima do conteúdo
 */
export default function AppShell({ brand, groups, topbarLeft, topbarRight, showTopbar = true, sidebarFooter, banner }) {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  const toggleCollapse = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1')
      } catch {
        // ignora
      }
      return !c
    })
  }

  return (
    <div className={styles.shell}>
      <Sidebar
        brand={brand}
        groups={groups}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        footer={sidebarFooter}
      />
      <div className={styles.main}>
        <div className={`${styles.topbarWrap} ${showTopbar ? '' : styles.mobileOnly}`}>
          <Topbar onMenuClick={() => setMobileOpen(true)} left={topbarLeft} right={topbarRight} />
        </div>
        {banner}
        <main className={styles.content}>
          <ErrorBoundary key={location.pathname}>
            <Suspense fallback={<PageLoader />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
