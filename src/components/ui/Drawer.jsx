import { X } from 'lucide-react'
import { useId } from 'react'
import { createPortal } from 'react-dom'
import { useOverlay } from './Modal'
import styles from './Overlay.module.css'

/**
 * Painel lateral (direita)
 * @param {{ open: boolean, onClose: () => void, title?: string, footer?: any, width?: number, children?: any }} props
 */
export default function Drawer({ open, onClose, title, footer, width = 480, children }) {
  const panelRef = useOverlay(open, onClose)
  const titleId = useId()
  if (!open) return null

  return createPortal(
    <div className={`${styles.backdrop} ${styles.drawerBackdrop}`} onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={styles.drawer}
        style={{ width: `min(${width}px, 100vw)` }}
      >
        <header className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>
        <div className={`${styles.body} ${styles.drawerBody}`}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </aside>
    </div>,
    document.body,
  )
}
