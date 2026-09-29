import { useId } from 'react'
import styles from './Field.module.css'

/**
 * Wrapper com label, erro e dica — usado por Input, Select e Textarea.
 * @param {{ label?: string, error?: string, hint?: string, required?: boolean, id: string, children: any, className?: string }} props
 */
export function Field({ label, error, hint, required, id, children, className = '' }) {
  return (
    <div className={`${styles.field} ${error ? styles.hasError : ''} ${className}`}>
      {label && (
        <label htmlFor={id} className={styles.label}>
          {label}
          {required && <span className={styles.required}>*</span>}
        </label>
      )}
      {children}
      {error ? (
        <span className={styles.error} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className={styles.hint}>{hint}</span>
      ) : null}
    </div>
  )
}

export function useFieldId(id) {
  const generated = useId()
  return id || generated
}

export { styles as fieldStyles }
