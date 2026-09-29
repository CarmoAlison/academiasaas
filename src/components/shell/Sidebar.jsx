import { ChevronsLeft, ChevronsRight, Dumbbell } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import Tooltip from '../ui/Tooltip'
import styles from './Sidebar.module.css'

/**
 * @typedef {{ to: string, label: string, icon: import('react').ComponentType<any>, end?: boolean }} NavItem
 * @typedef {{ title?: string, items: NavItem[] }} NavGroup
 */

/**
 * Sidebar retrátil (desktop) / off-canvas (mobile)
 * @param {object} props
 * @param {{ title: string, subtitle?: string, logo?: string|null }} props.brand
 * @param {NavGroup[]} props.groups
 * @param {boolean} props.collapsed
 * @param {() => void} props.onToggleCollapse
 * @param {boolean} props.mobileOpen
 * @param {() => void} props.onMobileClose
 * @param {import('react').ReactNode | ((collapsed: boolean) => import('react').ReactNode)} [props.footer]
 */
export default function Sidebar({ brand, groups, collapsed, onToggleCollapse, mobileOpen, onMobileClose, footer }) {
  return (
    <>
      <div className={`${styles.overlay} ${mobileOpen ? styles.overlayOpen : ''}`} onClick={onMobileClose} aria-hidden />
      <aside
        className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''} ${mobileOpen ? styles.mobileOpen : ''}`}
        aria-label="Menu principal"
      >
        <div className={styles.brand}>
          <span className={styles.logo}>
            {brand.logo ? <img src={brand.logo} alt="" /> : <Dumbbell size={20} />}
          </span>
          {!collapsed && (
            <span className={styles.brandText}>
              <strong>{brand.title}</strong>
              {brand.subtitle && <small>{brand.subtitle}</small>}
            </span>
          )}
        </div>

        <nav className={styles.nav}>
          {groups.map((group, gi) => (
            <div key={group.title ?? gi} className={styles.group}>
              {group.title && !collapsed && <span className={styles.groupTitle}>{group.title}</span>}
              {group.items.map((item) => {
                const Icon = item.icon
                const link = (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={onMobileClose}
                    className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
                  >
                    <Icon size={19} aria-hidden />
                    {!collapsed && <span>{item.label}</span>}
                    {collapsed && <span className="sr-only">{item.label}</span>}
                  </NavLink>
                )
                return collapsed ? (
                  <Tooltip key={item.to} content={item.label} position="right">
                    {link}
                  </Tooltip>
                ) : (
                  link
                )
              })}
            </div>
          ))}
        </nav>

        {footer && <div className={styles.footer}>{typeof footer === 'function' ? footer(collapsed) : footer}</div>}

        <button
          type="button"
          className={styles.collapseBtn}
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
          {!collapsed && <span>Recolher</span>}
        </button>
      </aside>
    </>
  )
}
