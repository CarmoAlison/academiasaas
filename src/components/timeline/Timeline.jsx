import styles from './Timeline.module.css'
import { formatDateTime } from '../../utils/formatters'

/**
 * Linha do tempo legível.
 * @param {{ events: { key: string, icon: import('react').ComponentType<any>, text: import('react').ReactNode, at: string, by?: string, tone?: 'ok'|'bad' }[] }} props
 */
export default function Timeline({ events }) {
  return (
    <ol className={styles.timeline}>
      {events.map((e) => {
        const Icon = e.icon
        return (
          <li key={e.key} className={e.tone === 'bad' ? styles.bad : e.tone === 'ok' ? styles.ok : ''}>
            <span className={styles.dot}>
              <Icon size={14} />
            </span>
            <div>
              <p>{e.text}</p>
              <small>
                {formatDateTime(e.at)}
                {e.by ? ` · ${e.by}` : ''}
              </small>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
