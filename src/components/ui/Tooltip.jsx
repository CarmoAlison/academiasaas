import { useId } from 'react'
import styles from './Tooltip.module.css'

/**
 * @param {{ content: string, children: any, position?: 'top'|'bottom'|'right' }} props
 */
export default function Tooltip({ content, children, position = 'top' }) {
  const id = useId()
  if (!content) return children
  return (
    <span className={styles.wrapper} aria-describedby={id}>
      {children}
      <span role="tooltip" id={id} className={`${styles.tip} ${styles[position]}`}>
        {content}
      </span>
    </span>
  )
}
