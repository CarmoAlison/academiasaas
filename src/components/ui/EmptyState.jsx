import { Inbox } from 'lucide-react'
import styles from './EmptyState.module.css'

/**
 * @param {{ icon?: import('react').ComponentType<any>, title: string, description?: string, action?: any, compact?: boolean }} props
 */
export default function EmptyState({ icon: Icon = Inbox, title, description, action, compact = false }) {
  return (
    <div className={`${styles.empty} ${compact ? styles.compact : ''}`}>
      <div className={styles.icon}>
        <Icon size={compact ? 22 : 28} />
      </div>
      <h3 className={styles.title}>{title}</h3>
      {description && <p className={styles.description}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  )
}
