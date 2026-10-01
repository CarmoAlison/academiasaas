import { useQueryClient } from '@tanstack/react-query'
import { CalendarX2, ChevronLeft, ChevronRight, Clock, Hourglass, Users } from 'lucide-react'
import { useState } from 'react'
import QueryError from '../../../components/feedback/QueryError'
import { Badge, Button, EmptyState, PageHeader, SkeletonCard } from '../../../components/ui'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { classService } from '../../../services/classService'
import { addDays, formatTime, toISODate } from '../../../utils/formatters'
import DelinquencyBanner from '../DelinquencyBanner'
import styles from '../client.module.css'
import { useAcademySettings, useWeekSchedule, weekStart } from '../useStudent'

/** Início da aula (horário local) */
const classStart = (c) => new Date(`${c.data}T${c.horario.slice(0, 5)}:00`)

export default function Aulas() {
  const [start, setStart] = useState(() => weekStart())
  const week = useWeekSchedule(start)
  const settings = useAcademySettings().data
  const queryClient = useQueryClient()
  const today = toISODate()
  const isCurrentWeek = toISODate(start) === toISODate(weekStart())

  const listaEspera = settings?.aulas_lista_espera ?? true
  const horasCancel = Number(settings?.aulas_cancelamento_horas ?? 2)
  const limiteSemana = settings?.aulas_limite_semana

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] }),
      queryClient.invalidateQueries({ queryKey: ['class-occupancy'] }),
    ])

  const book = useMutationToast(({ id, data }) => classService.book(id, data), { success: 'Aula reservada!', onSuccess: refresh })
  const wait = useMutationToast(({ id, data }) => classService.joinWaitlist(id, data), {
    success: 'Você entrou na lista de espera. Se abrir vaga, a reserva é feita automaticamente.',
    onSuccess: refresh,
  })
  const cancel = useMutationToast(({ id }) => classService.cancel(id), {
    success: (_, v) => (v.espera ? 'Você saiu da lista de espera' : 'Reserva cancelada'),
    onSuccess: refresh,
  })

  if (week.error) return <QueryError error={week.error} onRetry={week.refetch} />

  const now = Date.now()
  const canCancel = (c) => classStart(c).getTime() - horasCancel * 3600000 > now
  const end = addDays(start, 6)
  const label = `${start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – ${end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`
  const hasAny = week.days.some((d) => d.items.length)
  const rules = [
    horasCancel > 0 && `Cancelamento até ${horasCancel}h antes do início.`,
    limiteSemana && `Limite de ${limiteSemana} reserva(s) por semana.`,
  ].filter(Boolean)

  const action = (c) => {
    const past = classStart(c).getTime() <= now
    const full = c.ocupadas >= c.capacidade

    if (c.booking?.status === 'espera') {
      return (
        <div className={styles.receiptActions}>
          <Badge tone="warning">{c.posicao ? `${c.posicao}º na fila` : 'Na fila'}</Badge>
          {!past && (
            <Button
              variant="ghost"
              size="sm"
              loading={cancel.isPending && cancel.variables?.id === c.booking.id}
              onClick={() => cancel.mutate({ id: c.booking.id, espera: true })}
            >
              Sair da fila
            </Button>
          )}
        </div>
      )
    }
    if (c.booking) {
      if (past || !canCancel(c)) {
        return (
          <Badge tone="success" title={past ? undefined : `Cancelamento só até ${horasCancel}h antes`}>
            Reservada
          </Badge>
        )
      }
      return (
        <Button variant="outline" size="sm" loading={cancel.isPending && cancel.variables?.id === c.booking.id} onClick={() => cancel.mutate({ id: c.booking.id })}>
          Cancelar
        </Button>
      )
    }
    if (past) return <Badge>Encerrada</Badge>
    if (full) {
      return listaEspera ? (
        <Button
          variant="secondary"
          size="sm"
          icon={Hourglass}
          loading={wait.isPending && wait.variables?.id === c.id && wait.variables?.data === c.data}
          onClick={() => wait.mutate({ id: c.id, data: c.data })}
        >
          Lista de espera
        </Button>
      ) : (
        <Badge tone="danger">Lotada</Badge>
      )
    }
    return (
      <Button
        size="sm"
        loading={book.isPending && book.variables?.id === c.id && book.variables?.data === c.data}
        onClick={() => book.mutate({ id: c.id, data: c.data })}
      >
        Reservar
      </Button>
    )
  }

  return (
    <>
      <PageHeader title="Aulas" subtitle="Reserve sua vaga nas aulas coletivas" />
      <DelinquencyBanner context="aulas" />
      {rules.length > 0 && (
        <p className={styles.muted} style={{ marginBottom: 16 }}>
          {rules.join(' ')}
        </p>
      )}

      <div className={styles.weekNav}>
        <Button variant="outline" size="sm" icon={ChevronLeft} onClick={() => setStart(addDays(start, -7))} disabled={isCurrentWeek} aria-label="Semana anterior" />
        <strong>{label}</strong>
        <Button variant="outline" size="sm" icon={ChevronRight} onClick={() => setStart(addDays(start, 7))} aria-label="Próxima semana" />
      </div>

      {week.isPending ? (
        <div className={styles.stack}>
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : !hasAny ? (
        <EmptyState icon={CalendarX2} title="Nenhuma aula nesta semana" />
      ) : (
        week.days
          .filter((d) => d.items.length)
          .map((d) => (
            <section key={d.iso} className={styles.day}>
              <h2 className={`${styles.dayTitle} ${d.iso === today ? styles.today : ''}`}>
                {d.iso === today ? 'Hoje · ' : ''}
                {d.date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })}
              </h2>
              <ul className={styles.list}>
                {d.items.map((c) => (
                  <li key={c.id} className={styles.listItem}>
                    <span className={styles.dateBox}>
                      <strong>{formatTime(c.horario)}</strong>
                    </span>
                    <div>
                      <strong>{c.nome}</strong>
                      <div className={styles.muted} style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Clock size={13} /> {c.duracao_min} min
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Users size={13} /> {c.ocupadas}/{c.capacidade}
                        </span>
                        {c.unit?.nome && <span>{c.unit.nome}</span>}
                        {c.professor_nome && <span>Prof. {c.professor_nome}</span>}
                      </div>
                    </div>
                    {action(c)}
                  </li>
                ))}
              </ul>
            </section>
          ))
      )}
    </>
  )
}
