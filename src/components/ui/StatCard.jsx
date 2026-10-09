import { Link } from 'react-router-dom'
import Skeleton from './Skeleton'
import styles from './StatCard.module.css'

/**
 * @param {{ label: string, value: any, icon?: import('react').ComponentType<any>, tone?: 'primary'|'success'|'warning'|'danger', hint?: string, loading?: boolean, to?: string, progress?: number }} props
 * `to` = card clicável que leva à lista já filtrada; `progress` = barra de 0 a 100 (ex.: recebido / previsto)
 */
export default function StatCard({ label, value, icon: Icon, tone = 'primary', hint, loading, to, progress }) {
  const content = (
    <>
      <div className={styles.top}>
        <span className={styles.label}>{label}</span>
        {Icon && (
          <span className={`${styles.icon} ${styles[tone]}`}>
            <Icon size={18} />
          </span>
        )}
      </div>
      {loading ? <Skeleton width="50%" height={28} /> : <strong className={styles.value}>{value}</strong>}
      {progress !== undefined && progress !== null && !loading && (
        <span className={styles.progress} role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
          <span className={styles[tone]} style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
        </span>
      )}
      {hint && <span className={styles.hint}>{hint}</span>}
    </>
  )
  if (to) {
    return (
      <Link to={to} className={`${styles.card} ${styles.link}`}>
        {content}
      </Link>
    )
  }
  return <div className={styles.card}>{content}</div>
}

/** Grade responsiva de StatCards */
export function StatGrid({ children }) {
  return <div className={styles.grid}>{children}</div>
}
