import { useQuery } from '@tanstack/react-query'
import { AlertOctagon, ExternalLink, Info, Sparkles, Wrench, X } from 'lucide-react'
import { useState } from 'react'
import { useTenant } from '../../hooks/useAuth'
import { listActiveAnnouncements } from '../../services/announcementService'
import styles from './AnnouncementBanner.module.css'

const ICONS = { info: Info, novidade: Sparkles, manutencao: Wrench, urgente: AlertOctagon }
const DISMISS_KEY = 'academia.avisos-fechados'

const readDismissed = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISS_KEY) ?? '[]'))
  } catch {
    return new Set()
  }
}

/** Um aviso (também usado na pré-visualização do Super Admin) */
export function AnnouncementItem({ aviso, onClose }) {
  const Icon = ICONS[aviso.tipo] ?? Info
  const safeLink = /^https?:\/\//i.test(aviso.link ?? '') ? aviso.link : null
  return (
    <div className={`${styles.item} ${styles[aviso.tipo] ?? ''}`} role={aviso.tipo === 'urgente' ? 'alert' : 'status'}>
      <Icon size={18} aria-hidden />
      <div className={styles.text}>
        <strong>{aviso.titulo}</strong>
        {aviso.mensagem && <span>{aviso.mensagem}</span>}
        {safeLink && (
          <a href={safeLink} target="_blank" rel="noreferrer">
            Saiba mais <ExternalLink size={12} />
          </a>
        )}
      </div>
      {onClose && (
        <button type="button" className={styles.close} onClick={onClose} aria-label="Fechar aviso">
          <X size={16} />
        </button>
      )}
    </div>
  )
}

/**
 * Avisos do SaaS vigentes para o usuário (equipe ou aluno). Fechar esconde só neste navegador;
 * avisos "urgente" não podem ser fechados.
 */
export default function AnnouncementBanner() {
  const { academyId } = useTenant()
  const [dismissed, setDismissed] = useState(readDismissed)
  const query = useQuery({ queryKey: ['announcements', 'active'], queryFn: listActiveAnnouncements, staleTime: 5 * 60000, refetchInterval: 10 * 60000 })

  const now = Date.now()
  // a RLS já filtra; aqui garante período/academia também para o Super Admin (que lê todos)
  const visible = (query.data ?? []).filter(
    (a) =>
      new Date(a.inicio).getTime() <= now &&
      (!a.fim || new Date(a.fim).getTime() > now) &&
      (!a.academy_id || a.academy_id === academyId) &&
      !dismissed.has(a.id),
  )
  if (!visible.length) return null

  const dismiss = (id) => {
    const next = new Set(dismissed).add(id)
    setDismissed(next)
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify([...next].slice(-100)))
    } catch {
      // storage indisponível: fecha só nesta sessão
    }
  }

  return (
    <div className={styles.wrap}>
      {visible.map((a) => (
        <AnnouncementItem key={a.id} aviso={a} onClose={a.tipo === 'urgente' ? null : () => dismiss(a.id)} />
      ))}
    </div>
  )
}
