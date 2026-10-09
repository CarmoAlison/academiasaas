import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Building2, LifeBuoy, PackagePlus, Plus, Tag, TrendingDown, TrendingUp, UserMinus, Users, Wallet } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { SimpleAreaChart, SimpleBarChart } from '../../../components/charts/Charts'
import QueryError from '../../../components/feedback/QueryError'
import { Button, Card, DataTable, Grid, PageHeader, StatCard, StatGrid, StatusBadge } from '../../../components/ui'
import { useSuperRole } from '../../../hooks/useSuperRole'
import { superDashboard } from '../../../services/dashboardService'
import { listAcademies } from '../../../services/saasService'
import { formatCurrency, formatDate, formatMonth } from '../../../utils/formatters'

const pct = (atual, anterior) => {
  if (!anterior) return null
  const v = ((atual - anterior) / anterior) * 100
  return `${v >= 0 ? '+' : ''}${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

export default function Dashboard() {
  const { superCan } = useSuperRole()
  const navigate = useNavigate()
  const stats = useQuery({ queryKey: ['super-dashboard'], queryFn: superDashboard })
  const academies = useQuery({ queryKey: ['academies'], queryFn: listAcademies })
  const d = stats.data
  const loading = stats.isPending

  if (stats.isError) return <QueryError error={stats.error} onRetry={stats.refetch} />

  const mrrVar = d ? pct(Number(d.mrr), Number(d.mrr_anterior)) : null
  const subiu = d && Number(d.mrr) >= Number(d.mrr_anterior)
  const fin = superCan('financeiro')
  const recebidoPct = d && Number(d.previsto_mes) ? Math.round((Number(d.recebido_mes) / Number(d.previsto_mes)) * 100) : null

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Visão geral do SaaS"
        actions={
          superCan('academias') && (
            <Button icon={Plus} to="/super-admin/academias/nova">
              Nova academia
            </Button>
          )
        }
      />

      <StatGrid>
        <StatCard
          label="MRR"
          value={formatCurrency(d?.mrr)}
          icon={subiu ? TrendingUp : TrendingDown}
          tone={subiu ? 'success' : 'danger'}
          loading={loading}
          hint={mrrVar ? `${mrrVar} vs. mês passado (${formatCurrency(d.mrr_anterior)})` : 'Receita recorrente mensal'}
        />
        <StatCard
          to="/super-admin/academias?status=ativa"
          label="Academias ativas"
          value={d?.ativas}
          icon={Building2}
          loading={loading}
          hint={d ? `${d.novas_mes} nova(s) e ${d.canceladas_mes} cancelada(s) no mês` : undefined}
        />
        <StatCard
          to={fin ? '/super-admin/financeiro?status=atrasado&mes=todos' : '/super-admin/academias?situacao=atraso'}
          label="Faturas vencidas"
          value={formatCurrency(d?.valor_vencido)}
          icon={AlertTriangle}
          tone="danger"
          loading={loading}
          hint={d ? `${d.faturas_vencidas} fatura(s) de ${d.inadimplentes} academia(s)` : undefined}
        />
        {fin && (
          <StatCard
            to="/super-admin/financeiro"
            label="Recebido no mês"
            value={formatCurrency(d?.recebido_mes)}
            icon={Wallet}
            tone="success"
            loading={loading}
            progress={recebidoPct ?? undefined}
            hint={d ? `de ${formatCurrency(d.previsto_mes)} previstos${recebidoPct !== null ? ` (${recebidoPct}%)` : ''}` : undefined}
          />
        )}
        {superCan('suporte') && (
          <StatCard
            to="/super-admin/chamados"
            label="Chamados em aberto"
            value={d?.chamados_abertos}
            icon={LifeBuoy}
            tone="warning"
            loading={loading}
            hint={d ? `${d.chamados_aguardando} aguardando resposta` : undefined}
          />
        )}
        <StatCard
          to="/super-admin/academias?status=inativa"
          label="Cancelamentos no mês"
          value={d?.canceladas_mes}
          icon={UserMinus}
          tone="danger"
          loading={loading}
          hint="Academias inativadas ou excluídas"
        />
        {fin && (
          <StatCard
            to="/super-admin/planos-saas?tab=adicionais"
            label="Receita de adicionais"
            value={formatCurrency(d?.adicionais_mrr)}
            icon={PackagePlus}
            loading={loading}
            hint="Por mês, nas academias ativas"
          />
        )}
        {fin && (
          <StatCard
            to="/super-admin/planos-saas?tab=ofertas"
            label="Custo das ofertas"
            value={formatCurrency(d?.desconto_ofertas)}
            icon={Tag}
            tone="warning"
            loading={loading}
            hint="Desconto concedido por mês"
          />
        )}
        <StatCard label="Alunos ativos" value={d?.total_alunos} icon={Users} loading={loading} hint="Em todas as academias" />
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
            { key: 'saas_plan.nome', header: 'Plano', render: (a) => `${a.saas_plan?.nome ?? '—'}${a.ciclo === 'anual' ? ' · anual' : ''}` },
            { key: 'status', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
            { key: 'created_at', header: 'Cadastro', render: (a) => formatDate(a.created_at) },
          ]}
        />
      </Card>
    </>
  )
}
