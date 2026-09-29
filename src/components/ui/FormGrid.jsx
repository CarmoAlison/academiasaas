import styles from './FormGrid.module.css'

/**
 * Grade responsiva para formulários.
 * @param {{ columns?: 1|2|3|4, children: any }} props
 */
export default function FormGrid({ columns = 2, children }) {
  return <div className={`${styles.grid} ${styles[`cols${columns}`]}`}>{children}</div>
}

/** Ocupa a linha inteira da grade */
export function FullRow({ children }) {
  return <div className={styles.full}>{children}</div>
}

/** Seção de formulário com título */
export function FormSection({ title, description, children }) {
  return (
    <fieldset className={styles.section}>
      <legend className={styles.legend}>{title}</legend>
      {description && <p className={styles.description}>{description}</p>}
      {children}
    </fieldset>
  )
}

/** Barra de ações no rodapé do formulário */
export function FormActions({ children }) {
  return <div className={styles.actions}>{children}</div>
}
