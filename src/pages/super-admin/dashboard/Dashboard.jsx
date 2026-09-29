import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Building2, CheckCircle2, DollarSign, Plus, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { SimpleAreaChart, SimpleBarChart } from '../../../components/charts/Charts'
import QueryError from '../../../components/feedback/QueryError'
import { Button, Card, DataTable, Grid, PageHeader, StatCard, StatGrid, StatusBadge } from '../../../components/ui'
import { superDashboard } from '../../../services/dashboardService'
import { listAcademies } from '../../../services/saasService'
import { formatCurrency, formatDate, formatMonth } from '../../../utils/formatters'

export default function Dashboard() {
  const navigate = useNavigate()
  const stats = useQuery({ queryKey: ['super-dashboard'], queryFn: superDashboard })
  const academies = useQuery({ queryKey: ['academies'], queryFn: listAcademies })
  const d = stats.data

  if (stats.isError) return <QueryError error={stats.error} onRetry={stats.refetch} />

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Visão geral do SaaS"
        actions={
          <Button icon={Plus} to="/super-admin/academias/nova">
            Nova academia
          </Button>
        }
      />

      <StatGrid>
        <StatCard label="Total de academias" value={d?.total} icon={Building2} loading={stats.isPending} />
        <StatCard label="Academias ativas" value={d?.ativas} icon={CheckCircle2} tone="success" loading={stats.isPending} />
        <StatCard label="MRR" value={formatCurrency(d?.mrr)} icon={DollarSign} loading={stats.isPending} hint="Receita recorrente mensal" />
        <StatCard label="Inadimplentes" value={d?.inadimplentes} icon={AlertTriangle} tone="danger" loading={stats.isPending} hint="Com fatura vencida" />
        <StatCard label="Alunos ativos" value={d?.total_alunos} icon={Users} tone="warning" loading={stats.isPending} hint="Em todas as academias" />
      </StatGrid>

      <Grid min={420}>
        <Card title="Crescimento da base" subtitle="Total acumulado de academias (12 meses)">
          <SimpleAreaChart data={d?.crescimento ?? []} xKey="mes" yKey="total" name="Academias" xFormatter={formatMonth} />
        </Card>
        <Card title="Novas academias por mês" subtitle="Últimos 12 meses">
          <SimpleBarChart data={d?.crescimento ?? []} xKey="mes" yKey="novas" name="Novas academias" xFormatter={formatMonth} />
        </Card>
      </Grid>

      <Card title="Últimas academias cadastradas" padding={false} actions={<Button variant="ghost" size="sm" to="/super-admin/academias">Ver todas</Button>}>
        <DataTable
          searchable={false}
          loading={academies.isPending}
          data={(academies.data ?? []).slice(0, 5)}
          pageSize={5}
          onRowClick={(a) => navigate(`/super-admin/academias/${a.id}`)}
          columns={[
            { key: 'nome', header: 'Academia' },
            { key: 'saas_plan.nome', header: 'Plano', render: (a) => a.saas_plan?.nome ?? '—' },
            { key: 'status', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
            { key: 'created_at', header: 'Cadastro', render: (a) => formatDate(a.created_at) },
          ]}
        />
      </Card>
    </>
  )
}
