import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from '../../hooks/useTheme'
import Button from '../ui/Button'
import styles from './ThemeToggle.module.css'

/** Botão rápido claro ↔ escuro (topbars e login) */
export default function ThemeToggle({ size = 'md' }) {
  const { resolved, toggle } = useTheme()
  const label = resolved === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'
  // title nativo em vez de <Tooltip>: o botão fica no canto da tela e o tooltip causaria overflow horizontal
  return <Button variant="ghost" size={size} icon={resolved === 'dark' ? Sun : Moon} onClick={toggle} aria-label={label} title={label} />
}

const OPTIONS = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
]

/** Seletor Claro / Escuro / Sistema (menu do usuário) */
export function ThemeSelector() {
  const { preference, setPreference } = useTheme()
  return (
    <div className={styles.selector} role="radiogroup" aria-label="Tema">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={preference === value}
          className={`${styles.option} ${preference === value ? styles.active : ''}`}
          onClick={() => setPreference(value)}
        >
          <Icon size={14} aria-hidden />
          {label}
        </button>
      ))}
    </div>
  )
}
