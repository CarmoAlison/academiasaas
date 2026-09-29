import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import styles from './Breadcrumb.module.css'

/**
 * @param {{ items: { label: string, to?: string }[] }} props
 */
export default function Breadcrumb({ items = [] }) {
  if (!items.length) return null
  return (
    <nav aria-label="Breadcrumb" className={styles.nav}>
      <ol className={styles.list}>
        {items.map((item, i) => {
          const last = i === items.length - 1
          return (
            <li key={`${item.label}-${i}`} className={styles.item}>
              {item.to && !last ? <Link to={item.to}>{item.label}</Link> : <span aria-current={last ? 'page' : undefined}>{item.label}</span>}
              {!last && <ChevronRight size={14} className={styles.sep} aria-hidden />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
