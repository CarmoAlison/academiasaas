import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Headset, ImageIcon, Paperclip, Send, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAuth, useTenant } from '../../hooks/useAuth'
import { patchTicketInCache, useTicketMessagesRealtime } from '../../hooks/useSupportRealtime'
import { attachmentUrl, listMessages, markTicketRead, replyTicket, TICKET_STATUS, uploadAttachment } from '../../services/supportService'
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
/** Anexo: abre com um link temporário (o arquivo é privado) */
function AttachmentChip({ file }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const open = async () => {
    // a aba precisa ser aberta no clique para não ser bloqueada
    const tab = window.open('', '_blank')
    setBusy(true)
    try {
      const url = await attachmentUrl(file.path)
      if (tab) tab.location.href = url
    } catch (err) {
      tab?.close()
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <button type="button" className={styles.chip} onClick={open} disabled={busy} title="Abrir anexo">
      {file.tipo?.startsWith('image/') ? <ImageIcon size={13} /> : <FileText size={13} />} {file.nome}
    </button>
  )
}

export default function TicketThread({ ticket, side, actions, macros }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const { context } = useAuth()
  const { membership } = useTenant()
  const myName = side === 'suporte' ? context?.super_admin?.nome : membership?.profile?.nome
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)
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

  const onFiles = async (e) => {
    const picked = [...(e.target.files ?? [])]
    e.target.value = ''
    if (!picked.length) return
    if (files.length + picked.length > 5) {
      toast.error('Envie no máximo 5 anexos por mensagem')
      return
    }
    setUploading(true)
    try {
      const done = []
      for (const f of picked) done.push(await uploadAttachment(ticket.academy_id, f))
      setFiles((prev) => [...prev, ...done])
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  const send = async (e) => {
    e.preventDefault()
    const body = text.trim()
    if ((!body && !files.length) || sending || uploading) return
    const anexos = files
    const key = ['ticket-messages', ticket.id]
    const tempId = `tmp-${Date.now()}`
    // aparece na hora; o Realtime/consulta troca pela mensagem definitiva
    queryClient.setQueryData(key, (old) => [
      ...(old ?? []),
      {
        id: tempId,
        pending: true,
        mensagem: body || '(anexo)',
        anexos,
        do_suporte: side === 'suporte',
        autor_nome: myName,
        created_at: new Date().toISOString(),
      },
    ])
    patchTicketInCache(queryClient, ticket.id, {
      status: side === 'suporte' ? 'respondido' : 'aberto',
      ultima_msg_em: new Date().toISOString(),
    })
    setText('')
    setFiles([])
    setSending(true)
    try {
      await replyTicket(ticket.id, body, anexos)
      queryClient.invalidateQueries({ queryKey: key })
      queryClient.invalidateQueries({ queryKey: ['tickets'] })
    } catch (err) {
      queryClient.setQueryData(key, (old) => (old ?? []).filter((m) => m.id !== tempId))
      setText(body)
      setFiles(anexos)
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
                  {!(m.mensagem === '(anexo)' && m.anexos?.length) && <p>{m.mensagem}</p>}
                  {m.anexos?.length > 0 && (
                    <div className={styles.attachments}>
                      {m.anexos.map((a) => (
                        <AttachmentChip key={a.path} file={a} />
                      ))}
                    </div>
                  )}
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
        {files.length > 0 && (
          <div className={styles.attachments}>
            {files.map((f) => (
              <span key={f.path} className={styles.chip}>
                <Paperclip size={13} /> {f.nome}
                <button type="button" aria-label={`Remover ${f.nome}`} onClick={() => setFiles((prev) => prev.filter((x) => x.path !== f.path))}>
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className={styles.replyActions}>
          <div className={styles.tools}>
            <input ref={fileRef} type="file" multiple hidden accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain" onChange={onFiles} />
            <Button type="button" variant="ghost" size="sm" icon={Paperclip} loading={uploading} onClick={() => fileRef.current?.click()}>
              Anexar
            </Button>
            {macros?.length > 0 && (
              <select
                className={styles.macros}
                aria-label="Respostas prontas"
                value=""
                onChange={(e) => {
                  const m = macros.find((x) => x.id === e.target.value)
                  if (m) setText((t) => (t.trim() ? `${t.trim()}\n\n${m.texto}` : m.texto))
                }}
              >
                <option value="">Respostas prontas…</option>
                {macros.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.titulo}
                  </option>
                ))}
              </select>
            )}
            <span className="text-muted" style={{ fontSize: 12 }}>
              Ctrl + Enter para enviar
            </span>
          </div>
          <Button type="submit" icon={Send} disabled={(!text.trim() && !files.length) || uploading}>
            Enviar
          </Button>
        </div>
      </form>
    </div>
  )
}
