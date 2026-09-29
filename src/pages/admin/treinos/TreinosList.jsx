import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QueryError from '../../../components/feedback/QueryError'
import { Badge, Button, DataTable, PageHeader, Select, Tabs } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { usePermissions } from '../../../hooks/usePermissions'
import { listWorkouts } from '../../../services/workoutService'
import { formatDate, toISODate } from '../../../utils/formatters'
import ExerciciosTab from './ExerciciosTab'

function WorkoutsTab() {
  const { academyId } = useTenant()
  const { can } = usePermissions()
  const navigate = useNavigate()
  const [situacao, setSituacao] = useState('ativos')
  const query = useQuery({ queryKey: ['workouts', academyId], queryFn: () => listWorkouts(academyId) })
  const today = toISODate()

  const vigente = (w) => w.ativo && (!w.data_fim || w.data_fim >= today)
  const rows = (query.data ?? []).filter((w) => (situacao === 'ativos' ? vigente(w) : situacao === 'encerrados' ? !vigente(w) : true))

  if (query.isError) return <QueryError error={query.error} onRetry={query.refetch} />

  return (
    <DataTable
      loading={query.isPending}
      data={rows}
      searchPlaceholder="Buscar por aluno, treino ou objetivo"
      searchKeys={['nome', 'objetivo', 'student.profile.nome', 'professor.nome']}
      onRowClick={(w) => navigate(`/admin/treinos/${w.id}`)}
      filters={
        <Select
          aria-label="Situação"
          value={situacao}
          onChange={(e) => setSituacao(e.target.value)}
          options={[
            { value: 'ativos', label: 'Vigentes' },
            { value: 'encerrados', label: 'Encerrados/inativos' },
            { value: 'todos', label: 'Todos' },
          ]}
        />
      }
      emptyTitle="Nenhum treino encontrado"
      emptyAction={can('treinos.criar') && <Button icon={Plus} to="/admin/treinos/novo">Montar treino</Button>}
      columns={[
        { key: 'nome', header: 'Treino', render: (w) => <strong>{w.nome}</strong> },
        { key: 'student.profile.nome', header: 'Aluno', render: (w) => w.student?.profile?.nome ?? '—' },
        { key: 'objetivo', header: 'Objetivo', render: (w) => w.objetivo ?? '—' },
        { key: 'professor.nome', header: 'Professor', render: (w) => w.professor?.nome ?? '—' },
        {
          key: 'data_fim',
          header: 'Período',
          render: (w) => (w.data_inicio || w.data_fim ? `${formatDate(w.data_inicio)} → ${formatDate(w.data_fim)}` : '—'),
        },
        {
          key: 'ativo',
          header: 'Situação',
          render: (w) => <Badge tone={vigente(w) ? 'success' : 'neutral'}>{vigente(w) ? 'Vigente' : 'Encerrado'}</Badge>,
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
