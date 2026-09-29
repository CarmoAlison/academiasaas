import { ChevronDown, KeyRound, LogOut, User } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLogout } from '../../hooks/useAuth'
import ChangePasswordModal from '../auth/ChangePasswordModal'
import Avatar from '../ui/Avatar'
import { ThemeSelector } from './ThemeToggle'
import styles from './UserMenu.module.css'

/**
 * Menu do usuário: perfil, trocar senha, sair
 * @param {{ name: string, subtitle?: string, avatarUrl?: string|null, profilePath?: string, compact?: boolean, placement?: 'bottom'|'top' }} props
 */
export default function UserMenu({ name, subtitle, avatarUrl, profilePath, compact = false, placement = 'bottom' }) {
  const [open, setOpen] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const ref = useRef(null)
  const logout = useLogout()
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const handleLogout = async () => {
    setOpen(false)
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className={styles.wrapper} ref={ref}>
      <button
        type="button"
        className={`${styles.trigger} ${compact ? styles.compact : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Avatar name={name} src={avatarUrl} size={34} />
        {!compact && (
          <span className={styles.info}>
            <strong>{name}</strong>
            {subtitle && <small>{subtitle}</small>}
          </span>
        )}
        {!compact && <ChevronDown size={16} className={styles.chevron} />}
      </button>

      {open && (
        <div className={`${styles.menu} ${styles[placement]}`} role="menu">
          <div className={styles.menuHeader}>
            <strong>{name}</strong>
            {subtitle && <small>{subtitle}</small>}
          </div>
          {profilePath && (
            <Link to={profilePath} className={styles.item} role="menuitem" onClick={() => setOpen(false)}>
              <User size={16} /> Meu perfil
            </Link>
          )}
          <button
            type="button"
            className={styles.item}
            role="menuitem"
            onClick={() => {
              setOpen(false)
              setPasswordOpen(true)
            }}
          >
            <KeyRound size={16} /> Trocar senha
          </button>
          <div className={styles.section}>
            <span className={styles.sectionLabel}>Tema</span>
            <ThemeSelector />
          </div>
          <button type="button" className={`${styles.item} ${styles.danger}`} role="menuitem" onClick={handleLogout}>
            <LogOut size={16} /> Sair
          </button>
        </div>
      )}

      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </div>
  )
}
