import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QueryError from '../../../components/feedback/QueryError'
import { Badge, Button, DataTable, PageHeader, Select, Tabs } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { usePermissions } from '../../../hooks/usePermissions'
import { useServerTable } from '../../../hooks/useServerTable'
import { listWorkoutsPage } from '../../../services/workoutService'
import { formatDate } from '../../../utils/formatters'
import { summarizeDays } from '../../../utils/workoutDays'
import ExerciciosTab from './ExerciciosTab'

/** Dias da view (array de dia_semana + total) no formato de summarizeDays */
const daysOf = (w) => [
  ...(w.dias ?? []).map((d) => ({ dia_semana: d })),
  ...Array.from({ length: Math.max(0, (w.total_dias ?? 0) - (w.dias?.length ?? 0)) }, () => ({ dia_semana: null })),
]

function WorkoutsTab() {
  const { academyId } = useTenant()
  const { can } = usePermissions()
  const navigate = useNavigate()

  // paginação, busca, ordenação e filtro de situação no servidor
  const { query, tableProps, filters, setFilter } = useServerTable({
    queryKey: ['workouts', academyId],
    fetchPage: (params) => listWorkoutsPage(academyId, params),
    pageSize: 20,
    initialFilters: { situacao: 'vigentes' },
  })

  if (query.isError) return <QueryError error={query.error} onRetry={query.refetch} />

  return (
    <DataTable
      {...tableProps}
      searchPlaceholder="Buscar por aluno, treino, objetivo ou professor"
      onRowClick={(w) => navigate(`/admin/treinos/${w.id}`)}
      filters={
        <Select
          aria-label="Situação"
          value={filters.situacao}
          onChange={(e) => setFilter('situacao', e.target.value)}
          options={[
            { value: 'vigentes', label: 'Vigentes' },
            { value: 'encerrados', label: 'Encerrados/inativos' },
            { value: 'todos', label: 'Todos' },
          ]}
        />
      }
      emptyTitle="Nenhum treino encontrado"
      emptyAction={can('treinos.criar') && <Button icon={Plus} to="/admin/treinos/novo">Montar treino</Button>}
      columns={[
        { key: 'nome', header: 'Treino', render: (w) => <strong>{w.nome}</strong> },
        { key: 'aluno_nome', header: 'Aluno', render: (w) => w.aluno_nome ?? '—' },
        { key: 'total_dias', header: 'Dias', render: (w) => summarizeDays(daysOf(w)) },
        { key: 'objetivo', header: 'Objetivo', render: (w) => w.objetivo ?? '—' },
        { key: 'professor_nome', header: 'Professor', render: (w) => w.professor_nome ?? '—' },
        {
          key: 'data_fim',
          header: 'Período',
          render: (w) => (w.data_inicio || w.data_fim ? `${formatDate(w.data_inicio)} → ${formatDate(w.data_fim)}` : '—'),
        },
        {
          key: 'vigente',
          header: 'Situação',
          render: (w) => <Badge tone={w.vigente ? 'success' : 'neutral'}>{w.vigente ? 'Vigente' : 'Encerrado'}</Badge>,
        },
      ]}
    />
  )
}

export default function TreinosList() {
  const { can } = usePermissions()
  const [tab, setTab] = useState('treinos')

  return (
    <>
      <PageHeader
        title="Treinos"
        subtitle="Fichas de treino dos alunos e biblioteca de exercícios"
        actions={
          tab === 'treinos' &&
          can('treinos.criar') && (
            <Button icon={Plus} to="/admin/treinos/novo">
              Novo treino
            </Button>
          )
        }
      />
      <Tabs
        items={[
          { key: 'treinos', label: 'Treinos' },
          { key: 'exercicios', label: 'Biblioteca de exercícios' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'treinos' ? <WorkoutsTab /> : <ExerciciosTab />}
    </>
  )
}
