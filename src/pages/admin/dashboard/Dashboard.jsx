import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CalendarClock, CalendarDays, DollarSign, ScanLine, UserPlus, Users, UserX } from 'lucide-react'
import { BarList, SimpleAreaChart, SimpleBarChart } from '../../../components/charts/Charts'
import QueryError from '../../../components/feedback/QueryError'
import { Button, Card, Grid, PageHeader, StatCard, StatGrid } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { usePermissions } from '../../../hooks/usePermissions'
import { adminDashboard } from '../../../services/dashboardService'
import { paymentsSummary } from '../../../services/paymentService'
import { STUDENT_STATUS } from '../../../utils/constants'
import PlanUsage from '../assinatura/PlanUsage'
import Onboarding from './Onboarding'
import { firstName, formatCurrency, formatMonth, toISODate } from '../../../utils/formatters'

const compactCurrency = (v) =>
  Number(v) >= 1000 ? `R$ ${(Number(v) / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : formatCurrency(v)

export default function Dashboard() {
  const { academyId, academy, membership } = useTenant()
  const { can } = usePermissions()
  const query = useQuery({ queryKey: ['admin-dashboard', academyId], queryFn: () => adminDashboard(academyId) })
  const d = query.data
  // mesmo resumo do Financeiro (mês atual), para mostrar os dois critérios lado a lado
  const now = new Date()
  const summary = useQuery({
    queryKey: ['payments', academyId, 'summary', toISODate(now).slice(0, 7)],
    queryFn: () =>
      paymentsSummary(
        academyId,
        toISODate(new Date(now.getFullYear(), now.getMonth(), 1)),
        toISODate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      ),
    enabled: can('financeiro.ver'),
  })
  const s = summary.data

  if (query.isError) return <QueryError error={query.error} onRetry={query.refetch} />

  const statusItems = STUDENT_STATUS.map((s) => ({
    label: s.label,
    value: d?.alunos_por_status?.find((x) => x.status === s.value)?.total ?? 0,
  }))

  return (
    <>
      <PageHeader
        title={membership ? `Olá, ${firstName(membership.profile.nome)}` : 'Dashboard'}
        subtitle={`Resumo de ${academy?.nome ?? 'sua academia'}`}
        actions={
          can('alunos.criar') && (
            <Button icon={UserPlus} to="/admin/alunos/novo">
              Novo aluno
            </Button>
          )
        }
      />

      <Onboarding />

      <PlanUsage compact />

      <StatGrid>
        <StatCard label="Alunos ativos" value={d?.alunos_ativos} icon={Users} loading={query.isPending} />
        <StatCard
          label="Inadimplentes"
          value={d?.inadimplentes}
          icon={AlertTriangle}
          tone="danger"
          loading={query.isPending}
          hint={
            d
              ? `Vencidos há mais de ${d.tolerancia} dia(s) (tolerância)${
                  s?.alunos_em_atraso !== undefined ? ` · com parcela vencida (sem tolerância): ${s.alunos_em_atraso}` : ''
                }`
              : undefined
          }
        />
        <StatCard
          label="Planos vencendo"
          value={d?.planos_vencendo}
          icon={CalendarClock}
          tone="warning"
          loading={query.isPending}
          hint="Nos próximos 7 dias"
        />
        <StatCard label="Aulas hoje" value={d?.aulas_hoje} icon={CalendarDays} tone="warning" loading={query.isPending} />
        {d?.checkins_hoje !== undefined && (
          <>
            <StatCard label="Check-ins hoje" value={d.checkins_hoje} icon={ScanLine} tone="success" loading={query.isPending} />
            <StatCard
              label="Alunos sumidos"
              value={d.sumidos}
              icon={UserX}
              tone="danger"
              loading={query.isPending}
              hint={`Sem check-in há ${d.dias_sumido}+ dias`}
            />
          </>
        )}
        <StatCard label="Novos no mês" value={d?.novos_mes} icon={UserPlus} tone="success" loading={query.isPending} />
        <StatCard
          label="Receita do mês"
          value={formatCurrency(d?.receita_mes)}
          icon={DollarSign}
          loading={query.isPending}
          hint={`Pela data do pagamento${s ? ` · das parcelas que vencem neste mês: ${formatCurrency(s.recebido)}` : ''}`}
        />
      </StatGrid>

      <Grid min={420}>
        <Card title="Receita recebida" subtitle="Últimos 6 meses">
          <SimpleAreaChart data={d?.mensal ?? []} xKey="mes" yKey="receita" name="Receita" xFormatter={formatMonth} yFormatter={compactCurrency} />
        </Card>
        <Card title="Novas matrículas" subtitle="Últimos 6 meses">
          <SimpleBarChart data={d?.mensal ?? []} xKey="mes" yKey="matriculas" name="Matrículas" xFormatter={formatMonth} />
        </Card>
      </Grid>

      <Grid min={320}>
        <Card title="Alunos por situação">
          <BarList items={statusItems} />
        </Card>
      </Grid>
    </>
  )
}
