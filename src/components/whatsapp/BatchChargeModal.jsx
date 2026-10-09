import { useQuery } from '@tanstack/react-query'
import { CheckCheck, MessageCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAcademySettings } from '../../hooks/useAcademySettings'
import { useTenant } from '../../hooks/useAuth'
import { useWhatsappSend } from '../../hooks/useWhatsapp'
import { lastSent, listPaymentQueue } from '../../services/whatsappService'
import { calcEncargos } from '../../utils/cobranca'
import { formatCurrency, formatDate, formatDateTime, formatPhone, toISODate } from '../../utils/formatters'
import { fillTemplate, overdueVars, templateFor, waPhone } from '../../utils/whatsapp'
import QueryError from '../feedback/QueryError'
import { Badge, Button, Checkbox, EmptyState, Modal, SkeletonCard } from '../ui'
import styles from './BatchChargeModal.module.css'

const RECENTE_MS = 2 * 86400000

/**
 * Cobrança em lote dos atrasados: uma mensagem por aluno (somando as parcelas vencidas).
 * O navegador só abre uma conversa por clique, então o envio é em sequência: "Enviar próxima".
 */
export default function BatchChargeModal({ onClose }) {
  const { academyId, academy } = useTenant()
  const settings = useAcademySettings().data
  const send = useWhatsappSend()
  const hoje = toISODate()

  const queue = useQuery({
    queryKey: ['whatsapp-queue', academyId, 'atraso', hoje],
    queryFn: () => listPaymentQueue(academyId, 'atraso', { hoje }),
  })
  const ids = (queue.data ?? []).map((p) => p.id)
  const sent = useQuery({
    queryKey: ['whatsapp-sent', academyId, 'atraso', ids],
    queryFn: () => lastSent(academyId, 'atraso', { paymentIds: ids }),
    enabled: ids.length > 0,
  })

  // agrupa por aluno: valor original, total com multa/juros e último envio
  const alunos = useMemo(() => {
    const map = new Map()
    for (const p of queue.data ?? []) {
      const a = map.get(p.student_id) ?? { id: p.student_id, nome: p.aluno_nome, telefone: p.aluno_telefone, parcelas: [], ultimo: null }
      a.parcelas.push(p)
      const s = sent.data?.[p.id]
      if (s && (!a.ultimo || s > a.ultimo)) a.ultimo = s
      map.set(p.student_id, a)
    }
    return [...map.values()]
      .map((a) => ({
        ...a,
        valor: a.parcelas.reduce((acc, p) => acc + Number(p.valor), 0),
        total: a.parcelas.reduce((acc, p) => acc + calcEncargos(p, settings).total, 0),
        desde: a.parcelas.reduce((min, p) => (p.vencimento < min ? p.vencimento : min), a.parcelas[0].vencimento),
      }))
      .sort((x, y) => x.desde.localeCompare(y.desde))
  }, [queue.data, sent.data, settings])

  // seleção inicial: quem tem celular e não recebeu cobrança nos últimos 2 dias
  const [selected, setSelected] = useState(null)
  const [enviados, setEnviados] = useState(() => new Set())
  const ready = queue.isSuccess && (sent.isSuccess || !ids.length) && settings
  const sel =
    selected ??
    (ready ? new Set(alunos.filter((a) => waPhone(a.telefone) && !(a.ultimo && Date.now() - new Date(a.ultimo) < RECENTE_MS)).map((a) => a.id)) : new Set())

  const fila = alunos.filter((a) => sel.has(a.id) && !enviados.has(a.id))
  const proximo = fila[0]
  const totalSel = alunos.filter((a) => sel.has(a.id))
  const message = (a) => fillTemplate(templateFor(settings, 'atraso'), overdueVars(a.parcelas, academy?.nome ?? '', settings))

  const toggle = (id, on) => {
    const next = new Set(sel)
    if (on) next.add(id)
    else next.delete(id)
    setSelected(next)
  }
  const allWithPhone = alunos.filter((a) => waPhone(a.telefone))
  const allOn = allWithPhone.length > 0 && allWithPhone.every((a) => sel.has(a.id))

  const enviar = () => {
    if (!proximo) return
    const oldest = [...proximo.parcelas].sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0]
    send({ studentId: proximo.id, paymentId: oldest.id, tipo: 'atraso', telefone: proximo.telefone, mensagem: message(proximo) })
    setEnviados((prev) => new Set(prev).add(proximo.id))
  }

  const feitos = totalSel.filter((a) => enviados.has(a.id)).length

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Cobrar atrasados no WhatsApp"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {feitos ? 'Concluir' : 'Cancelar'}
          </Button>
          {totalSel.length > 0 && (
            <Button icon={proximo ? MessageCircle : CheckCheck} disabled={!proximo} onClick={enviar}>
              {proximo ? `Enviar para ${proximo.nome.split(' ')[0]} (${feitos + 1} de ${totalSel.length})` : 'Todas enviadas'}
            </Button>
          )}
        </>
      }
    >
      {queue.isError ? (
        <QueryError error={queue.error} onRetry={queue.refetch} />
      ) : !ready ? (
        <SkeletonCard lines={5} />
      ) : !alunos.length ? (
        <EmptyState compact title="Nenhuma mensalidade em atraso 🎉" />
      ) : (
        <>
          <p className="text-muted" style={{ marginBottom: 12 }}>
            Uma mensagem por aluno, somando as parcelas vencidas. O WhatsApp abre uma conversa por vez: envie e volte aqui para a próxima.
            Quem já foi cobrado nos últimos 2 dias vem desmarcado.
          </p>
          <div className={styles.summary}>
            <Checkbox
              label={`${totalSel.length} de ${alunos.length} aluno(s) selecionado(s)`}
              checked={allOn}
              indeterminate={!allOn && sel.size > 0}
              onChange={(on) => setSelected(new Set(on ? allWithPhone.map((a) => a.id) : []))}
            />
            <strong>
              {formatCurrency(totalSel.reduce((acc, a) => acc + a.total, 0))}
              {totalSel.some((a) => a.total - a.valor > 0.004) && <small className="text-muted"> com multa e juros</small>}
            </strong>
          </div>
          <ul className={styles.list}>
            {alunos.map((a) => {
              const done = enviados.has(a.id)
              const semCelular = !waPhone(a.telefone)
              return (
                <li key={a.id} className={`${done ? styles.done : ''} ${proximo?.id === a.id ? styles.next : ''}`}>
                  <Checkbox checked={sel.has(a.id)} disabled={semCelular || done} onChange={(on) => toggle(a.id, on)} aria-label={`Selecionar ${a.nome}`} />
                  <div className={styles.who}>
                    <strong>{a.nome}</strong>
                    <small className="text-muted">
                      {a.parcelas.length} parcela(s) desde {formatDate(a.desde)} · {semCelular ? 'sem celular' : formatPhone(a.telefone)}
                    </small>
                  </div>
                  <div className={styles.amount}>
                    <strong>{formatCurrency(a.total)}</strong>
                    {a.total - a.valor > 0.004 && <small className="text-muted">original {formatCurrency(a.valor)}</small>}
                  </div>
                  <div className={styles.state}>
                    {done ? (
                      <Badge tone="success">Enviada</Badge>
                    ) : a.ultimo ? (
                      <small className="text-muted" title="Última cobrança enviada">
                        <CheckCheck size={12} /> {formatDateTime(a.ultimo)}
                      </small>
                    ) : semCelular ? (
                      <Badge tone="warning">Sem celular</Badge>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
          {proximo && (
            <div className={styles.preview}>
              <small className="text-muted">Próxima mensagem ({proximo.nome})</small>
              <p>{message(proximo)}</p>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}
