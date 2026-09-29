import { useQuery } from '@tanstack/react-query'
import { ClipboardList, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QueryError from '../../../components/feedback/QueryError'
import { Badge, Button, DataTable, PageHeader, Select } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { usePermissions } from '../../../hooks/usePermissions'
import { classService } from '../../../services/classService'
import { WEEKDAYS } from '../../../utils/constants'
import { formatTime, toISODate } from '../../../utils/formatters'
import ReservasDrawer from './ReservasDrawer'

const weekdaysLabel = (dias = []) =>
  [...dias].sort().map((d) => WEEKDAYS[d]?.short).join(', ') || '—'

export default function AulasList() {
  const { academyId } = useTenant()
  const { can } = usePermissions()
  const navigate = useNavigate()
  const [dia, setDia] = useState('')
  const [bookingsFor, setBookingsFor] = useState(null)
  const today = toISODate()

  const query = useQuery({ queryKey: ['classes', academyId], queryFn: () => classService.list(academyId) })
  const occupancy = useQuery({
    queryKey: ['class-occupancy', academyId, today],
    queryFn: () => classService.occupancy(academyId, today, today),
  })

  const todayDow = new Date().getDay()
  const occ = (classId) => occupancy.data?.find((o) => o.class_id === classId)?.total ?? 0
  const rows = (query.data ?? []).filter((c) => dia === '' || c.dias_semana.includes(Number(dia)))

  if (query.isError) return <QueryError error={query.error} onRetry={query.refetch} />

  return (
    <>
      <PageHeader
        title="Aulas"
        subtitle="Aulas coletivas, horários e reservas"
        actions={
          can('aulas.criar') && (
            <Button icon={Plus} to="/admin/aulas/nova">
              Nova aula
            </Button>
          )
        }
      />
      <DataTable
        loading={query.isPending}
        data={rows}
        searchKeys={['nome', 'professor.nome', 'unit.nome']}
        searchPlaceholder="Buscar aula ou professor"
        initialSort={{ key: 'horario', dir: 'asc' }}
        onRowClick={(c) => navigate(`/admin/aulas/${c.id}`)}
        filters={
          <Select
            aria-label="Dia da semana"
            placeholder="Todos os dias"
            value={dia}
            onChange={(e) => setDia(e.target.value)}
            options={WEEKDAYS.map((d) => ({ value: d.value, label: d.label }))}
          />
        }
        emptyTitle="Nenhuma aula cadastrada"
        emptyAction={can('aulas.criar') && <Button icon={Plus} to="/admin/aulas/nova">Cadastrar aula</Button>}
        columns={[
          { key: 'nome', header: 'Aula', render: (c) => <strong>{c.nome}</strong> },
          { key: 'horario', header: 'Horário', render: (c) => `${formatTime(c.horario)} · ${c.duracao_min}min` },
          { key: 'dias_semana', header: 'Dias', sortable: false, render: (c) => weekdaysLabel(c.dias_semana) },
          { key: 'professor.nome', header: 'Professor', render: (c) => c.professor?.nome ?? '—' },
          { key: 'unit.nome', header: 'Unidade', render: (c) => c.unit?.nome ?? '—' },
          {
            key: 'capacidade',
            header: 'Hoje',
            align: 'right',
            render: (c) =>
              c.dias_semana.includes(todayDow) ? (
                <Badge tone={occ(c.id) >= c.capacidade ? 'danger' : 'info'}>
                  {occ(c.id)}/{c.capacidade}
                </Badge>
              ) : (
                <span className="text-muted">—</span>
              ),
          },
          {
            key: 'ativo',
            header: 'Status',
            render: (c) => <Badge tone={c.ativo ? 'success' : 'neutral'}>{c.ativo ? 'Ativa' : 'Inativa'}</Badge>,
          },
          {
            key: 'acoes',
            header: '',
            sortable: false,
            align: 'right',
            render: (c) => (
              <span onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="sm" icon={ClipboardList} onClick={() => setBookingsFor(c)}>
                  Reservas
                </Button>
              </span>
            ),
          },
        ]}
      />
      <ReservasDrawer aula={bookingsFor} onClose={() => setBookingsFor(null)} />
    </>
  )
}
