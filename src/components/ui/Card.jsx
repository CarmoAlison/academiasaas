import styles from './Card.module.css'

/**
 * @param {{ title?: import('react').ReactNode, subtitle?: string, actions?: import('react').ReactNode, padding?: boolean, className?: string, children?: any }} props
 */
export default function Card({ title, subtitle, actions, padding = true, className = '', children }) {
  return (
    <section className={`${styles.card} ${className}`}>
      {(title || actions) && (
        <header className={styles.header}>
          <div>
            {title && <h3 className={styles.title}>{title}</h3>}
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
          {actions && <div className={styles.actions}>{actions}</div>}
        </header>
      )}
      <div className={padding ? styles.body : ''}>{children}</div>
    </section>
  )
}
