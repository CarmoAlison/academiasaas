import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Clock, DollarSign, Download, FilePlus2, RotateCcw, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { BarList } from '../../../components/charts/Charts'
import QueryError from '../../../components/feedback/QueryError'
import {
  Button,
  Card,
  DataTable,
  Grid,
  Input,
  PageHeader,
  Select,
  StatCard,
  StatGrid,
  StatusBadge,
  Tooltip,
  useConfirm,
} from '../../../components/ui'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { cancelInvoice, generateInvoices, listSaasInvoices, markInvoicePaid, reopenInvoice } from '../../../services/saasService'
import { exportCSV } from '../../../utils/csv'
import { formatCurrency, formatDate, paymentStatus, toISODate } from '../../../utils/formatters'

const monthStart = () => toISODate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)).slice(0, 7)

export default function Financeiro() {
  const [competencia, setCompetencia] = useState(monthStart())
  const [status, setStatus] = useState('')
  const [confirm, confirmDialog] = useConfirm()

  const query = useQuery({ queryKey: ['saas-invoices', 'all'], queryFn: () => listSaasInvoices() })
  const invalidate = [['saas-invoices'], ['super-dashboard']]

  const payMutation = useMutationToast(markInvoicePaid, { success: 'Fatura marcada como paga', invalidate })
  const reopenMutation = useMutationToast(reopenInvoice, { success: 'Fatura reaberta', invalidate })
  const cancelMutation = useMutationToast(cancelInvoice, { success: 'Fatura cancelada', invalidate })
  const generateMutation = useMutationToast(() => generateInvoices(`${competencia}-01`), {
    success: (n) => (n ? `${n} fatura(s) gerada(s)` : 'Todas as academias ativas já possuem fatura nesta competência'),
    invalidate,
  })

  const all = useMemo(() => (query.data ?? []).map((i) => ({ ...i, situacao: paymentStatus(i) })), [query.data])
  const monthRows = all.filter((i) => i.competencia.startsWith(competencia))
  const rows = monthRows.filter((i) => !status || i.situacao === status)

  const sum = (list) => list.reduce((acc, i) => acc + Number(i.valor), 0)
  const recebido = sum(monthRows.filter((i) => i.situacao === 'pago'))
  const pendente = sum(monthRows.filter((i) => i.situacao === 'pendente'))
  const atrasadoGeral = all.filter((i) => i.situacao === 'atrasado')

  const porAcademia = useMemo(() => {
    const map = {}
    all.filter((i) => i.status === 'pago').forEach((i) => {
      const nome = i.academy?.nome ?? '—'
      map[nome] = (map[nome] || 0) + Number(i.valor)
    })
    return Object.entries(map)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [all])

  const onExport = () =>
    exportCSV(`faturas-saas-${competencia}`, [
      { header: 'Academia', value: (i) => i.academy?.nome },
      { header: 'Plano', value: (i) => i.saas_plan?.nome },
      { header: 'Competência', value: (i) => i.competencia },
      { header: 'Vencimento', value: (i) => formatDate(i.vencimento) },
      { header: 'Valor', value: (i) => Number(i.valor).toFixed(2).replace('.', ',') },
      { header: 'Status', value: (i) => i.situacao },
      { header: 'Pago em', value: (i) => (i.pago_em ? formatDate(i.pago_em) : '') },
    ], rows)

  if (query.isError) return <QueryError error={query.error} onRetry={query.refetch} />

  return (
    <>
      {confirmDialog}
      <PageHeader
        title="Financeiro"
        subtitle="Mensalidades do SaaS pagas pelas academias"
        actions={
          <>
            <Button variant="outline" icon={Download} onClick={onExport} disabled={!rows.length}>
              Exportar CSV
            </Button>
            <Button icon={FilePlus2} loading={generateMutation.isPending} onClick={() => generateMutation.mutate()}>
              Gerar faturas do mês
            </Button>
          </>
        }
      />

      <StatGrid>
        <StatCard label="Faturado na competência" value={formatCurrency(sum(monthRows.filter((i) => i.status !== 'cancelado')))} icon={DollarSign} loading={query.isPending} />
        <StatCard label="Recebido" value={formatCurrency(recebido)} icon={CheckCircle2} tone="success" loading={query.isPending} />
        <StatCard label="A receber" value={formatCurrency(pendente)} icon={Clock} tone="warning" loading={query.isPending} />
        <StatCard
          label="Inadimplência (total)"
          value={formatCurrency(sum(atrasadoGeral))}
          icon={AlertTriangle}
          tone="danger"
          loading={query.isPending}
          hint={`${new Set(atrasadoGeral.map((i) => i.academy_id)).size} academia(s) em atraso`}
        />
      </StatGrid>

      <Grid min={360}>
        <Card title="Receita por academia" subtitle="Total recebido (todas as competências)">
          {porAcademia.length ? <BarList items={porAcademia} formatter={formatCurrency} /> : <p className="text-muted">Sem recebimentos ainda.</p>}
        </Card>
      </Grid>

      <DataTable
        loading={query.isPending}
        data={rows}
        searchKeys={['academy.nome']}
        searchPlaceholder="Buscar academia"
        filters={
          <>
            <Input type="month" aria-label="Competência" value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
            <Select
              aria-label="Status"
              placeholder="Todos"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              options={[
                { value: 'pendente', label: 'Pendente' },
                { value: 'atrasado', label: 'Atrasado' },
                { value: 'pago', label: 'Pago' },
                { value: 'cancelado', label: 'Cancelado' },
              ]}
            />
          </>
        }
        emptyTitle="Nenhuma fatura nesta competência"
        emptyDescription='Use "Gerar faturas do mês" para criar as cobranças das academias ativas.'
        columns={[
          { key: 'academy.nome', header: 'Academia', render: (i) => <strong>{i.academy?.nome}</strong> },
          { key: 'saas_plan.nome', header: 'Plano', render: (i) => i.saas_plan?.nome ?? '—' },
          { key: 'valor', header: 'Valor', align: 'right', sortValue: (i) => Number(i.valor), render: (i) => formatCurrency(i.valor) },
          { key: 'vencimento', header: 'Vencimento', render: (i) => formatDate(i.vencimento) },
          { key: 'situacao', header: 'Status', render: (i) => <StatusBadge status={i.situacao} /> },
          { key: 'pago_em', header: 'Pago em', render: (i) => (i.pago_em ? formatDate(i.pago_em) : '—') },
          {
            key: 'acoes',
            header: '',
            sortable: false,
            align: 'right',
            render: (i) => (
              <div style={{ display: 'inline-flex', gap: 4 }}>
                {i.status === 'pendente' && (
                  <>
                    <Tooltip content="Marcar como paga">
                      <Button variant="ghost" size="sm" icon={CheckCircle2} onClick={() => payMutation.mutate(i.id)} aria-label="Marcar como paga" />
                    </Tooltip>
                    <Tooltip content="Cancelar">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={XCircle}
                        aria-label="Cancelar"
                        onClick={async () => {
                          if (await confirm({ title: 'Cancelar fatura', message: `Cancelar a fatura de ${i.academy?.nome}?`, danger: true, confirmLabel: 'Cancelar fatura' })) {
                            cancelMutation.mutate(i.id)
                          }
                        }}
                      />
                    </Tooltip>
                  </>
                )}
                {i.status !== 'pendente' && (
                  <Tooltip content="Reabrir">
                    <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => reopenMutation.mutate(i.id)} aria-label="Reabrir" />
                  </Tooltip>
                )}
              </div>
            ),
          },
        ]}
      />
    </>
  )
}
