import { initials } from '../../utils/formatters'
import styles from './Avatar.module.css'

/**
 * @param {{ name?: string, src?: string|null, size?: number }} props
 */
export default function Avatar({ name = '', src, size = 36 }) {
  return (
    <span className={styles.avatar} style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}>
      {src ? <img src={src} alt={name} /> : initials(name) || '?'}
    </span>
  )
}
