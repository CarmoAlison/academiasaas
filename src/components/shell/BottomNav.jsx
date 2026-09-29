import { NavLink } from 'react-router-dom'
import styles from './BottomNav.module.css'

/**
 * Navegação inferior (mobile)
 * @param {{ items: { to: string, label: string, icon: import('react').ComponentType<any> }[] }} props
 */
export default function BottomNav({ items }) {
  return (
    <nav className={styles.nav} aria-label="Navegação">
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} className={({ isActive }) => `${styles.item} ${isActive ? styles.active : ''}`}>
          <Icon size={21} aria-hidden />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
