import { NavLink } from 'react-router-dom'
import styles from './Tabs.module.css'

/**
 * Abas controladas (value/onChange) ou por rota (item.to).
 * @param {{ items: { key: string, label: string, to?: string, end?: boolean }[], value?: string, onChange?: (key: string) => void }} props
 */
export default function Tabs({ items, value, onChange }) {
  return (
    <div className={styles.tabs} role="tablist">
      {items.map((item) =>
        item.to ? (
          <NavLink
            key={item.key}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `${styles.tab} ${isActive ? styles.active : ''}`}
          >
            {item.label}
          </NavLink>
        ) : (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={value === item.key}
            className={`${styles.tab} ${value === item.key ? styles.active : ''}`}
            onClick={() => onChange?.(item.key)}
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  )
}
