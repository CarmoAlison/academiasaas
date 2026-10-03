import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Headset, Send } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAuth, useTenant } from '../../hooks/useAuth'
import { patchTicketInCache, useTicketMessagesRealtime } from '../../hooks/useSupportRealtime'
import { listMessages, markTicketRead, replyTicket, TICKET_STATUS } from '../../services/supportService'
import { errorMessage } from '../../utils/errors'
import { formatDateTime } from '../../utils/formatters'
import QueryError from '../feedback/QueryError'
import Avatar from '../ui/Avatar'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import { SkeletonCard } from '../ui/Skeleton'
import Textarea from '../ui/Textarea'
import { useToast } from '../ui/Toast'
import styles from './TicketThread.module.css'

export function TicketStatusBadge({ status }) {
  const s = TICKET_STATUS.find((x) => x.value === status)
  return <Badge tone={s?.tone ?? 'neutral'}>{s?.label ?? status}</Badge>
}

/**
 * Conversa de um chamado. `side` define de que lado está quem vê:
 * 'academia' (mensagens do suporte à esquerda) ou 'suporte' (mensagens da academia à esquerda).
 * @param {{ ticket: object, side: 'academia'|'suporte', actions?: import('react').ReactNode }} props
 */
export default function TicketThread({ ticket, side, actions }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const { context } = useAuth()
  const { membership } = useTenant()
  const myName = side === 'suporte' ? context?.super_admin?.nome : membership?.profile?.nome
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const endRef = useRef(null)
  const messages = useQuery({
    queryKey: ['ticket-messages', ticket.id],
    queryFn: () => listMessages(ticket.id),
    refetchInterval: 60000, // reserva: o normal é chegar pelo Realtime
  })
  useTicketMessagesRealtime(ticket.id)

  // ao abrir, marca como lido do meu lado
  const unread = side === 'suporte' ? !ticket.lido_suporte : !ticket.lido_academia
  useEffect(() => {
    if (!unread) return
    markTicketRead(ticket.id)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['tickets'] })
        queryClient.invalidateQueries({ queryKey: ['tickets-unread'] })
      })
      .catch(() => {})
  }, [ticket.id, unread, queryClient])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [messages.data?.length])

  const send = async (e) => {
    e.preventDefault()
    const body = text.trim()
    if (!body || sending) return
    const key = ['ticket-messages', ticket.id]
    const tempId = `tmp-${Date.now()}`
    // aparece na hora; o Realtime/consulta troca pela mensagem definitiva
    queryClient.setQueryData(key, (old) => [
      ...(old ?? []),
      { id: tempId, pending: true, mensagem: body, do_suporte: side === 'suporte', autor_nome: myName, created_at: new Date().toISOString() },
    ])
    patchTicketInCache(queryClient, ticket.id, {
      status: side === 'suporte' ? 'respondido' : 'aberto',
      ultima_msg_em: new Date().toISOString(),
    })
    setText('')
    setSending(true)
    try {
      await replyTicket(ticket.id, body)
      queryClient.invalidateQueries({ queryKey: key })
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
    } catch (err) {
      queryClient.setQueryData(key, (old) => (old ?? []).filter((m) => m.id !== tempId))
      setText(body)
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
      toast.error(errorMessage(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className={styles.thread}>
      <div className={styles.head}>
        <div>
          <span className={styles.numero}>Chamado #{ticket.numero}</span>
          <h2>{ticket.assunto}</h2>
          <span className="text-muted" style={{ fontSize: 12 }}>
            {side === 'suporte' && ticket.academy?.nome ? `${ticket.academy.nome} · ` : ''}
            aberto por {ticket.aberto_por_nome} em {formatDateTime(ticket.created_at)}
          </span>
        </div>
        <div className={styles.headActions}>
          <TicketStatusBadge status={ticket.status} />
          {actions}
        </div>
      </div>

      <div className={styles.messages}>
        {messages.isPending ? (
          <SkeletonCard lines={3} />
        ) : messages.isError ? (
          <QueryError error={messages.error} onRetry={messages.refetch} />
        ) : (
          messages.data.map((m) => {
            const mine = side === 'suporte' ? m.do_suporte : !m.do_suporte
            return (
              <div key={m.id} className={`${styles.msg} ${mine ? styles.mine : ''} ${m.do_suporte ? styles.support : ''}`}>
                {m.do_suporte ? (
                  <span className={styles.supportIcon} aria-hidden>
                    <Headset size={16} />
                  </span>
                ) : (
                  <Avatar name={m.autor_nome} size={32} />
                )}
                <div className={`${styles.bubble} ${m.pending ? styles.pending : ''}`}>
                  <div className={styles.meta}>
                    <strong>{m.do_suporte ? `${m.autor_nome} · Suporte` : m.autor_nome}</strong>
                    <span>{m.pending ? 'enviando…' : formatDateTime(m.created_at)}</span>
                  </div>
                  <p>{m.mensagem}</p>
                </div>
              </div>
            )
          })
        )}
        <div ref={endRef} />
      </div>

      <form className={styles.reply} onSubmit={send}>
        <Textarea
          aria-label="Sua mensagem"
          rows={3}
          maxLength={5000}
          placeholder={ticket.status === 'resolvido' ? 'Escreva para reabrir o chamado…' : 'Escreva sua resposta…'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(e)
          }}
        />
        <div className={styles.replyActions}>
          <span className="text-muted" style={{ fontSize: 12 }}>
            Ctrl + Enter para enviar
          </span>
          <Button type="submit" icon={Send} disabled={!text.trim()}>
            Enviar
          </Button>
        </div>
      </form>
    </div>
  )
}
