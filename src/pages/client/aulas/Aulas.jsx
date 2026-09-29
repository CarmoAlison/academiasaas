import { useQueryClient } from '@tanstack/react-query'
import { CalendarX2, ChevronLeft, ChevronRight, Clock, Users } from 'lucide-react'
import { useState } from 'react'
import QueryError from '../../../components/feedback/QueryError'
import { Badge, Button, EmptyState, PageHeader, SkeletonCard } from '../../../components/ui'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { classService } from '../../../services/classService'
import { addDays, formatTime, toISODate } from '../../../utils/formatters'
import styles from '../client.module.css'
import { useWeekSchedule, weekStart } from '../useStudent'

export default function Aulas() {
  const [start, setStart] = useState(() => weekStart())
  const week = useWeekSchedule(start)
  const queryClient = useQueryClient()
  const today = toISODate()
  const isCurrentWeek = toISODate(start) === toISODate(weekStart())

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] }),
      queryClient.invalidateQueries({ queryKey: ['class-occupancy'] }),
    ])

  const book = useMutationToast(({ id, data }) => classService.book(id, data), { success: 'Aula reservada!', onSuccess: refresh })
  const cancel = useMutationToast((bookingId) => classService.cancel(bookingId), { success: 'Reserva cancelada', onSuccess: refresh })

  if (week.error) return <QueryError error={week.error} onRetry={week.refetch} />

  const end = addDays(start, 6)
  const label = `${start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – ${end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`
  const hasAny = week.days.some((d) => d.items.length)

  return (
    <>
      <PageHeader title="Aulas" subtitle="Reserve sua vaga nas aulas coletivas" />

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
                {d.items.map((c) => {
                  const past = d.iso < today
                  const full = c.ocupadas >= c.capacidade
                  return (
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
                        </div>
                      </div>
                      {c.booking ? (
                        past ? (
                          <Badge tone="success">Reservada</Badge>
                        ) : (
                          <Button variant="outline" size="sm" loading={cancel.isPending && cancel.variables === c.booking.id} onClick={() => cancel.mutate(c.booking.id)}>
                            Cancelar
                          </Button>
                        )
                      ) : past ? (
                        <Badge>Encerrada</Badge>
                      ) : full ? (
                        <Badge tone="danger">Lotada</Badge>
                      ) : (
                        <Button
                          size="sm"
                          loading={book.isPending && book.variables?.id === c.id && book.variables?.data === c.data}
                          onClick={() => book.mutate({ id: c.id, data: c.data })}
                        >
                          Reservar
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          ))
      )}
    </>
  )
}
