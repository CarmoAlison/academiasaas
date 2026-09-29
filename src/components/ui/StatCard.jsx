import Skeleton from './Skeleton'
import styles from './StatCard.module.css'

/**
 * @param {{ label: string, value: any, icon?: import('react').ComponentType<any>, tone?: 'primary'|'success'|'warning'|'danger', hint?: string, loading?: boolean }} props
 */
export default function StatCard({ label, value, icon: Icon, tone = 'primary', hint, loading }) {
  return (
    <div className={styles.card}>
      <div className={styles.top}>
        <span className={styles.label}>{label}</span>
        {Icon && (
          <span className={`${styles.icon} ${styles[tone]}`}>
            <Icon size={18} />
          </span>
        )}
      </div>
      {loading ? <Skeleton width="50%" height={28} /> : <strong className={styles.value}>{value}</strong>}
      {hint && <span className={styles.hint}>{hint}</span>}
    </div>
  )
}

/** Grade responsiva de StatCards */
export function StatGrid({ children }) {
  return <div className={styles.grid}>{children}</div>
}
