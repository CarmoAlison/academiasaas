import Breadcrumb from './Breadcrumb'
import styles from './PageHeader.module.css'

/**
 * @param {{ title: string, subtitle?: string, breadcrumb?: { label: string, to?: string }[], actions?: any }} props
 */
export default function PageHeader({ title, subtitle, breadcrumb, actions }) {
  return (
    <header className={styles.header}>
      <div className={styles.text}>
        {breadcrumb && <Breadcrumb items={breadcrumb} />}
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  )
}
