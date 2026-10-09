import { NavLink } from 'react-router-dom'
import styles from './BottomNav.module.css'

/**
 * Navegação inferior (mobile). Item com `highlight` vira o botão central em destaque (ex.: Check-in).
 * @param {{ items: { to: string, label: string, icon: import('react').ComponentType<any>, highlight?: boolean }[] }} props
 */
export default function BottomNav({ items }) {
  return (
    <nav className={styles.nav} aria-label="Navegação">
      {items.map(({ to, label, icon: Icon, highlight }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `${styles.item} ${highlight ? styles.highlight : ''} ${isActive ? styles.active : ''}`}
        >
          {highlight ? (
            <span className={styles.fab}>
              <Icon size={24} aria-hidden />
            </span>
          ) : (
            <Icon size={21} aria-hidden />
          )}
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
