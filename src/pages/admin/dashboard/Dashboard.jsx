import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CalendarClock, CalendarDays, DollarSign, ScanLine, UserPlus, Users, UserX } from 'lucide-react'
import { BarList, SimpleAreaChart, SimpleBarChart } from '../../../components/charts/Charts'
import QueryError from '../../../components/feedback/QueryError'
import { Button, Card, Grid, PageHeader, StatCard, StatGrid } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { useModules } from '../../../hooks/useModules'
import { usePermissions } from '../../../hooks/usePermissions'
import { adminDashboard } from '../../../services/dashboardService'
import { paymentsSummary } from '../../../services/paymentService'
import { STUDENT_STATUS } from '../../../utils/constants'
import PlanUsage from '../assinatura/PlanUsage'
import Aniversariantes from './Aniversariantes'
import Onboarding from './Onboarding'
import { firstName, formatCurrency, formatMonth, toISODate } from '../../../utils/formatters'

const compactCurrency = (v) =>
  Number(v) >= 1000 ? `R$ ${(Number(v) / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : formatCurrency(v)

export default function Dashboard() {
  const { academyId, academy, membership } = useTenant()
  const { can } = usePermissions()
  const mod = useModules()
  const fin = mod.has('financeiro')
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
    enabled: can('financeiro.ver') && fin,
  })
  const s = summary.data
  const recebidoPct = s && Number(s.previsto) ? Math.round((Number(s.recebido) / Number(s.previsto)) * 100) : null

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
        <StatCard
          label="Alunos ativos"
          value={d?.alunos_ativos}
          icon={Users}
          loading={query.isPending}
          to={can('alunos.ver') ? '/admin/alunos?status=ativo' : undefined}
        />
        {fin && (
        <>
        <StatCard
          label="Inadimplentes"
          value={d?.inadimplentes}
          icon={AlertTriangle}
          tone="danger"
          loading={query.isPending}
          to={can('alunos.ver') ? '/admin/alunos?status=inadimplente' : undefined}
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
          to={can('alunos.ver') ? '/admin/alunos?status=plano_vencendo' : undefined}
          hint="Nos próximos 7 dias"
        />
        </>
        )}
        {mod.has('aulas') && (
          <StatCard label="Aulas hoje" value={d?.aulas_hoje} icon={CalendarDays} tone="warning" loading={query.isPending} to={can('aulas.ver') ? '/admin/aulas' : undefined} />
        )}
        {mod.has('checkin') && d?.checkins_hoje !== undefined && (
          <>
            <StatCard
              label="Check-ins hoje"
              value={d.checkins_hoje}
              icon={ScanLine}
              tone="success"
              loading={query.isPending}
              to={can('alunos.ver') ? '/admin/checkin?tab=hoje' : undefined}
            />
            <StatCard
              label="Alunos sumidos"
              value={d.sumidos}
              icon={UserX}
              tone="danger"
              loading={query.isPending}
              to={can('alunos.ver') ? '/admin/checkin?tab=sumidos' : undefined}
              hint={`Sem check-in há ${d.dias_sumido}+ dias`}
            />
          </>
        )}
        <StatCard label="Novos no mês" value={d?.novos_mes} icon={UserPlus} tone="success" loading={query.isPending} />
        {fin && can('financeiro.ver') && (
          <StatCard
            label="Recebido no mês"
            value={formatCurrency(s?.recebido)}
            icon={DollarSign}
            tone="success"
            loading={summary.isPending}
            to="/admin/financeiro"
            progress={recebidoPct ?? undefined}
            hint={
              s
                ? `${recebidoPct !== null ? `de ${formatCurrency(s.previsto)} previstos (${recebidoPct}%)` : 'Nada previsto para este mês'} · caixa do mês: ${formatCurrency(d?.receita_mes)}`
                : undefined
            }
          />
        )}
      </StatGrid>

      <Grid min={420}>
        {fin && (
          <Card title="Receita recebida" subtitle="Últimos 6 meses">
            <SimpleAreaChart data={d?.mensal ?? []} xKey="mes" yKey="receita" name="Receita" xFormatter={formatMonth} yFormatter={compactCurrency} />
          </Card>
        )}
        <Card title="Novas matrículas" subtitle="Últimos 6 meses">
          <SimpleBarChart data={d?.mensal ?? []} xKey="mes" yKey="matriculas" name="Matrículas" xFormatter={formatMonth} />
        </Card>
      </Grid>

      <Grid min={320}>
        <Card title="Alunos por situação">
          <BarList items={statusItems} />
        </Card>
        {can('alunos.ver') && <Aniversariantes />}
      </Grid>
    </>
  )
}
