import styles from './Skeleton.module.css'

/**
 * @param {{ width?: string|number, height?: string|number, radius?: string|number, className?: string }} props
 */
export default function Skeleton({ width = '100%', height = 14, radius = 6, className = '' }) {
  return <span className={`${styles.skeleton} ${className}`} style={{ width, height, borderRadius: radius }} aria-hidden />
}

/** Linhas de skeleton para <tbody> */
export function SkeletonRows({ rows = 5, cols = 4 }) {
  return Array.from({ length: rows }, (_, r) => (
    <tr key={r}>
      {Array.from({ length: cols }, (_, c) => (
        <td key={c}>
          <Skeleton width={c === 0 ? '70%' : '50%'} />
        </td>
      ))}
    </tr>
  ))
}

/** Bloco de skeleton para cards/páginas */
export function SkeletonCard({ lines = 3, height = 120 }) {
  return (
    <div className={styles.card} style={{ minHeight: height }}>
      <Skeleton width="40%" height={16} />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={`${90 - i * 15}%`} />
      ))}
    </div>
  )
}
