import { X } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import styles from './Overlay.module.css'

/**
 * Hook comum a Modal e Drawer: ESC fecha, trava scroll e foca o painel.
 */
export function useOverlay(open, onClose, dismissible = true) {
  const panelRef = useRef(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement
    const onKey = (e) => {
      if (e.key === 'Escape' && dismissible) onCloseRef.current?.()
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [open, dismissible])
  return panelRef
}

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string} [props.title]
 * @param {import('react').ReactNode} [props.footer]
 * @param {'sm'|'md'|'lg'|'xl'} [props.size]
 * @param {boolean} [props.dismissible] permite fechar com ESC/clique fora
 */
export default function Modal({ open, onClose, title, footer, size = 'md', dismissible = true, children }) {
  const panelRef = useOverlay(open, onClose, dismissible)
  const titleId = useId()
  if (!open) return null

  return createPortal(
    <div className={styles.backdrop} onMouseDown={(e) => e.target === e.currentTarget && dismissible && onClose?.()}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={`${styles.modal} ${styles[size]}`}
      >
        {title && (
          <header className={styles.header}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            {dismissible && (
              <button type="button" className={styles.close} onClick={onClose} aria-label="Fechar">
                <X size={18} />
              </button>
            )}
          </header>
        )}
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}
