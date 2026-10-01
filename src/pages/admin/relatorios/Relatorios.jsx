import { useQuery } from '@tanstack/react-query'
import { Download, FileDown } from 'lucide-react'
import { useMemo, useState } from 'react'
import { BarList, SimpleBarChart } from '../../../components/charts/Charts'
import QueryError from '../../../components/feedback/QueryError'
import { downloadBlob } from '../../../components/receipt/pdfExport'
import { Button, Card, DataTable, Grid, Input, PageHeader, Select, StatCard, StatGrid, useToast } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { usePermissions } from '../../../hooks/usePermissions'
import { planService, unitService } from '../../../services/catalogServices'
import { reportData } from '../../../services/reportService'
import { exportCSV } from '../../../utils/csv'
import { errorMessage } from '../../../utils/errors'
import { formatCurrency, formatDate, formatMonth, toISODate } from '../../../utils/formatters'
import Heatmap from './Heatmap'
import { reportSections, summaryCards } from './reportSections'
import styles from './Relatorios.module.css'

const compactCurrency = (v) =>
  Number(v) >= 1000 ? `R$ ${(Number(v) / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : formatCurrency(v)

const PERIODS = [
  { value: 'mes', label: 'Este mês' },
  { value: 'mes_anterior', label: 'Mês anterior' },
  { value: '3m', label: 'Últimos 3 meses' },
  { value: '6m', label: 'Últimos 6 meses' },
  { value: '12m', label: 'Últimos 12 meses' },
  { value: 'ano', label: 'Este ano' },
  { value: 'custom', label: 'Personalizado' },
]

function periodRange(key) {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const iso = (d) => toISODate(d)
  switch (key) {
    case 'mes_anterior':
      return { de: iso(new Date(y, m - 1, 1)), ate: iso(new Date(y, m, 0)) }
    case '3m':
      return { de: iso(new Date(y, m - 2, 1)), ate: iso(now) }
    case '6m':
      return { de: iso(new Date(y, m - 5, 1)), ate: iso(now) }
    case '12m':
      return { de: iso(new Date(y, m - 11, 1)), ate: iso(now) }
    case 'ano':
      return { de: iso(new Date(y, 0, 1)), ate: iso(now) }
    default:
      return { de: iso(new Date(y, m, 1)), ate: iso(now) }
  }
}

/** Relatórios gerenciais com filtros, gráficos e exportação (PDF/CSV) */
export default function Relatorios() {
  const { academyId, academy } = useTenant()
  const { can } = usePermissions()
  const toast = useToast()
  const canExport = can('relatorios.exportar')
  const [period, setPeriod] = useState('3m')
  const [custom, setCustom] = useState(() => periodRange('3m'))
  const [unit, setUnit] = useState('')
  const [plan, setPlan] = useState('')
  const [busy, setBusy] = useState(false)

  const range = period === 'custom' ? custom : periodRange(period)
  const validRange = range.de && range.ate && range.de <= range.ate

  const units = useQuery({ queryKey: ['units', academyId], queryFn: () => unitService.list(academyId) })
  const plans = useQuery({ queryKey: ['plans', academyId], queryFn: () => planService.list(academyId) })
  const query = useQuery({
    queryKey: ['report', academyId, range.de, range.ate, unit, plan],
    queryFn: () => reportData(academyId, { ...range, unit, plan }),
    enabled: Boolean(validRange),
    placeholderData: (prev) => prev,
  })
  const data = query.data
  const sections = useMemo(() => (data ? reportSections(data) : []), [data])
  const section = (key) => sections.find((s) => s.key === key)

  const filtrosTexto = [
    unit && `Unidade: ${units.data?.find((u) => u.id === unit)?.nome ?? ''}`,
    plan && `Plano: ${plans.data?.find((p) => p.id === plan)?.nome ?? ''}`,
  ]
    .filter(Boolean)
    .join(' · ')
  const periodoTexto = `${formatDate(range.de)} a ${formatDate(range.ate)}`

  const csv = (sec) => exportCSV(`${sec.file}-${range.de}-a-${range.ate}`, sec.columns.map((c) => ({ header: c.header, value: c.raw ?? c.value })), sec.rows)

  const exportPdf = async () => {
    setBusy(true)
    try {
      const { generateReportPdf } = await import('./ReportPdf')
      const cor = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#006EB8'
      const blob = await generateReportPdf(data, { academia: academy?.nome ?? '', periodo: periodoTexto, filtros: filtrosTexto, cor })
      downloadBlob(blob, `relatorio-${range.de}-a-${range.ate}.pdf`)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const csvButton = (key) =>
    canExport &&
    data && (
      <Button variant="ghost" size="sm" icon={Download} onClick={() => csv(section(key))} disabled={!section(key)?.rows.length}>
        CSV
      </Button>
    )

  const table = (key, extra = {}) => {
    const sec = section(key)
    if (!sec) return null
    return (
      <DataTable
        searchable={false}
        pageSize={extra.pageSize ?? 10}
        data={sec.rows.map((r, i) => ({ ...r, id: r.id ?? i }))}
        emptyTitle="Sem dados no período"
        columns={sec.columns.map((c, i) => ({ key: `c${i}`, header: c.header, align: c.align, sortable: false, render: (r) => c.value(r) }))}
      />
    )
  }

  return (
    <>
      <PageHeader
        title="Relatórios"
        subtitle="Receita, matrículas, cancelamentos, frequência e aulas"
        actions={
          canExport && (
            <Button icon={FileDown} loading={busy} disabled={!data} onClick={exportPdf}>
              Exportar PDF
            </Button>
          )
        }
      />

      <Card>
        <div className={styles.filters}>
          <Select label="Período" value={period} onChange={(e) => setPeriod(e.target.value)} options={PERIODS} />
          {period === 'custom' && (
            <>
              <Input label="De" type="date" value={custom.de} max={custom.ate} onChange={(e) => setCustom((c) => ({ ...c, de: e.target.value }))} />
              <Input label="Até" type="date" value={custom.ate} min={custom.de} onChange={(e) => setCustom((c) => ({ ...c, ate: e.target.value }))} />
            </>
          )}
          <Select
            label="Unidade"
            placeholder="Todas"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            options={(units.data ?? []).map((u) => ({ value: u.id, label: u.nome }))}
          />
          <Select
            label="Plano"
            placeholder="Todos"
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            options={(plans.data ?? []).map((p) => ({ value: p.id, label: p.nome }))}
          />
        </div>
        <p className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
          {validRange ? `Período: ${periodoTexto}` : 'Escolha um período válido'}
          {filtrosTexto ? ` · ${filtrosTexto}` : ''}
        </p>
      </Card>

      {query.isError ? (
        <QueryError error={query.error} onRetry={query.refetch} />
      ) : (
        <div className={`${styles.content} ${query.isFetching ? styles.loading : ''}`}>
          <StatGrid>
            {(data ? summaryCards(data.resumo) : summaryCards(EMPTY_SUMMARY)).map((c) => (
              <StatCard key={c.label} label={c.label} value={c.value} hint={c.hint} loading={!data} />
            ))}
          </StatGrid>

          <Grid min={420}>
            <Card title="Receita por mês" actions={csvButton('mensal')}>
              <SimpleBarChart data={data?.mensal ?? []} xKey="mes" yKey="receita" name="Receita" xFormatter={formatMonth} yFormatter={compactCurrency} />
            </Card>
            <Card title="Receita por plano" actions={csvButton('receita_por_plano')}>
              {data?.receita_por_plano.length ? (
                <BarList items={data.receita_por_plano.map((r) => ({ label: r.plano, value: Number(r.total) }))} formatter={formatCurrency} />
              ) : (
                <p className="text-muted">Nenhum pagamento no período.</p>
              )}
            </Card>
          </Grid>

          <Card title="Matrículas e cancelamentos por mês" actions={csvButton('mensal')}>
            {table('mensal', { pageSize: 12 })}
          </Card>

          <Card title={`Cancelamentos${data ? ` (${data.cancelamentos.length})` : ''}`} subtitle="Alunos que saíram no período" actions={csvButton('cancelamentos')}>
            {table('cancelamentos')}
          </Card>

          <Grid min={420}>
            <Card title="Alunos por professor" subtitle="Alunos ativos com ficha vigente" actions={csvButton('por_professor')}>
              {data?.por_professor.length ? (
                <BarList items={data.por_professor.map((r) => ({ label: r.professor, value: r.alunos }))} formatter={(v) => `${v} aluno(s)`} />
              ) : (
                <p className="text-muted">Nenhuma ficha vigente.</p>
              )}
            </Card>
            <Card title="Horários mais movimentados" subtitle="Check-ins por dia e hora" actions={csvButton('horarios')}>
              <Heatmap data={data?.horarios ?? []} />
            </Card>
          </Grid>

          <Card title="Aulas coletivas" subtitle="Reservas, presenças e faltas no período" actions={csvButton('aulas')}>
            {table('aulas')}
          </Card>
        </div>
      )}
    </>
  )
}

const EMPTY_SUMMARY = { receita: 0, pagamentos: 0, ticket_medio: 0, novos: 0, cancelamentos: 0, checkins: 0, ativos: 0, inadimplencia: 0 }
