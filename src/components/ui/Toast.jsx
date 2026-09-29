import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './Toast.module.css'

const ToastContext = createContext(null)

const ICONS = { success: CheckCircle2, error: AlertTriangle, info: Info }

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), [])

  const push = useCallback(
    (type, message, duration = 4000) => {
      const id = Math.random().toString(36).slice(2)
      setToasts((list) => [...list.slice(-4), { id, type, message }])
      setTimeout(() => dismiss(id), duration)
    },
    [dismiss],
  )

  const api = useMemo(
    () => ({
      success: (msg) => push('success', msg),
      error: (msg) => push('error', msg, 6000),
      info: (msg) => push('info', msg),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className={styles.container} aria-live="polite">
          {toasts.map((t) => {
            const Icon = ICONS[t.type]
            return (
              <div key={t.id} className={`${styles.toast} ${styles[t.type]}`} role="status">
                <Icon size={18} className={styles.icon} />
                <span className={styles.message}>{t.message}</span>
                <button type="button" className={styles.close} onClick={() => dismiss(t.id)} aria-label="Fechar">
                  <X size={14} />
                </button>
              </div>
            )
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

/** @returns {{ success: (msg: string) => void, error: (msg: string) => void, info: (msg: string) => void }} */
export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast deve ser usado dentro de <ToastProvider>')
  return ctx
}
