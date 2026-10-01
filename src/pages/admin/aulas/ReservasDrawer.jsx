import { useQuery } from '@tanstack/react-query'
import { Check, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, Drawer, EmptyState, Input, SkeletonCard, StatusBadge } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { usePermissions } from '../../../hooks/usePermissions'
import { classService } from '../../../services/classService'
import { WEEKDAYS } from '../../../utils/constants'
import { addDays, formatPhone, formatTime, toDate, toISODate } from '../../../utils/formatters'

const listStyle = { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }
const itemStyle = { display: 'flex', alignItems: 'center', gap: 8, padding: 12, border: '1px solid var(--color-border)', borderRadius: 8 }

/** Próxima data (a partir de hoje) em que a aula acontece */
function nextOccurrence(dias) {
  for (let i = 0; i < 7; i++) {
    const d = addDays(new Date(), i)
    if (dias.includes(d.getDay())) return toISODate(d)
  }
  return toISODate()
}

/**
 * Lista de reservas de uma aula numa data, com marcação de presença
 * @param {{ aula: object|null, onClose: () => void }} props
 */
export default function ReservasDrawer({ aula, onClose }) {
  const { academyId } = useTenant()
  const { can } = usePermissions()
  const [data, setData] = useState(toISODate())

  useEffect(() => {
    if (aula) setData(nextOccurrence(aula.dias_semana))
  }, [aula])

  const query = useQuery({
    queryKey: ['class-bookings', aula?.id, data],
    queryFn: () => classService.bookings(aula.id, data),
    enabled: Boolean(aula),
  })

  const statusMutation = useMutationToast(({ id, status }) => classService.setBookingStatus(id, status), {
    invalidate: [['class-bookings', aula?.id, data], ['class-occupancy', academyId]],
  })

  const removeMutation = useMutationToast((id) => classService.cancel(id), {
    success: 'Removido da lista de espera',
    invalidate: [['class-bookings', aula?.id, data]],
  })

  const reservas = (query.data ?? []).filter((b) => b.status !== 'espera')
  const fila = (query.data ?? []).filter((b) => b.status === 'espera')
  const dow = toDate(data)?.getDay()
  const happens = aula?.dias_semana.includes(dow)

  return (
    <Drawer open={Boolean(aula)} onClose={onClose} title={aula ? `Reservas — ${aula.nome}` : ''}>
      {aula && (
        <>
          <p className="text-muted" style={{ marginBottom: 16 }}>
            {formatTime(aula.horario)} · capacidade {aula.capacidade} ·{' '}
            {aula.dias_semana.map((d) => WEEKDAYS[d].short).join(', ')}
          </p>
          <Input label="Data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          <div style={{ marginTop: 20 }}>
            {!happens ? (
              <EmptyState compact title="Sem aula nesta data" description="Escolha um dia da semana em que a aula acontece." />
            ) : query.isPending ? (
              <SkeletonCard lines={4} />
            ) : !query.data?.length ? (
              <EmptyState compact title="Nenhuma reserva" description="Os alunos reservam pela área do aluno." />
            ) : (
              <>
                <h3 style={{ marginBottom: 12 }}>
                  {reservas.length}/{aula.capacidade} reservas
                </h3>
                <ul style={listStyle}>
                  {reservas.map((b) => (
                    <li
                      key={b.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: 12,
                        border: '1px solid var(--color-border)',
                        borderRadius: 8,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong>{b.student?.profile?.nome}</strong>
                        <div className="text-muted" style={{ fontSize: 12 }}>
                          {b.student?.profile?.telefone ? formatPhone(b.student.profile.telefone) : ''}
                        </div>
                      </div>
                      <StatusBadge status={b.status} />
                      {can('aulas.editar') && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={Check}
                            aria-label="Presente"
                            onClick={() => statusMutation.mutate({ id: b.id, status: 'presente' })}
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={X}
                            aria-label="Falta"
                            onClick={() => statusMutation.mutate({ id: b.id, status: 'falta' })}
                          />
                        </>
                      )}
                    </li>
                  ))}
                </ul>
                {fila.length > 0 && (
                  <>
                    <h3 style={{ margin: '20px 0 4px' }}>Lista de espera ({fila.length})</h3>
                    <p className="text-muted" style={{ fontSize: 12, marginBottom: 12 }}>
                      Quando uma reserva é cancelada, o 1º da fila é reservado automaticamente.
                    </p>
                    <ul style={listStyle}>
                      {fila.map((b, i) => (
                        <li key={b.id} style={itemStyle}>
                          <strong style={{ width: 28 }}>{i + 1}º</strong>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <strong>{b.student?.profile?.nome}</strong>
                            <div className="text-muted" style={{ fontSize: 12 }}>
                              {b.student?.profile?.telefone ? formatPhone(b.student.profile.telefone) : ''}
                            </div>
                          </div>
                          {can('aulas.editar') && (
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={X}
                              aria-label="Remover da fila"
                              loading={removeMutation.isPending && removeMutation.variables === b.id}
                              onClick={() => removeMutation.mutate(b.id)}
                            />
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}
    </Drawer>
  )
}
