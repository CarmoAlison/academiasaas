import { MessageSquare } from 'lucide-react'
import { TICKET_CATEGORIES } from '../../services/supportService'
import { formatDateTime } from '../../utils/formatters'
import EmptyState from '../ui/EmptyState'
import { SkeletonCard } from '../ui/Skeleton'
import { TicketStatusBadge } from './TicketThread'
import styles from './TicketList.module.css'

/**
 * Lista de chamados (lado academia ou suporte). Destaca os não lidos.
 * @param {{ tickets?: object[], loading?: boolean, side: 'academia'|'suporte', selectedId?: string, onSelect: (t: object) => void }} props
 */
export default function TicketList({ tickets, loading, side, selectedId, onSelect }) {
  if (loading) return <SkeletonCard lines={5} />
  if (!tickets?.length) return <EmptyState compact icon={MessageSquare} title="Nenhum chamado" />

  return (
    <ul className={styles.list}>
      {tickets.map((t) => {
        const unread = side === 'suporte' ? !t.lido_suporte && t.status !== 'resolvido' : !t.lido_academia
        return (
          <li key={t.id}>
            <button type="button" className={`${styles.item} ${selectedId === t.id ? styles.selected : ''}`} onClick={() => onSelect(t)}>
              <div className={styles.top}>
                <span className={styles.numero}>#{t.numero}</span>
                {unread && <span className={styles.dot} aria-label="Não lido" />}
                <TicketStatusBadge status={t.status} />
              </div>
              <strong className={unread ? styles.unread : ''}>{t.assunto}</strong>
              <span className={styles.meta}>
                {side === 'suporte' ? `${t.academy?.nome ?? ''} · ` : ''}
                {TICKET_CATEGORIES.find((c) => c.value === t.categoria)?.label}
                {t.prioridade === 'alta' ? ' · prioridade alta' : ''} · {formatDateTime(t.ultima_msg_em)}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
