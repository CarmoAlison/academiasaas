import { Menu } from 'lucide-react'
import styles from './Topbar.module.css'

/**
 * Barra superior
 * @param {{ onMenuClick?: () => void, left?: any, right?: any, sticky?: boolean }} props
 */
export default function Topbar({ onMenuClick, left, right }) {
  return (
    <header className={styles.topbar}>
      {onMenuClick && (
        <button type="button" className={styles.menuBtn} onClick={onMenuClick} aria-label="Abrir menu">
          <Menu size={20} />
        </button>
      )}
      <div className={styles.left}>{left}</div>
      <div className={styles.right}>{right}</div>
    </header>
  )
}
