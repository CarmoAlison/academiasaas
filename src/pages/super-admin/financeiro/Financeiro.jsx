import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Clock, DollarSign, Download, FilePlus2, FileText, Palette, RotateCcw, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { BarList } from '../../../components/charts/Charts'
import QueryError from '../../../components/feedback/QueryError'
import ReceiptModal from '../../../components/receipt/ReceiptModal'
import {
  Button,
  Card,
  DataTable,
  Grid,
  Input,
  Modal,
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
import { PAYMENT_METHODS } from '../../../utils/constants'
import { exportCSV } from '../../../utils/csv'
import { formatCurrency, formatDate, paymentStatus, toISODate } from '../../../utils/formatters'
import { useSuperRole } from '../../../hooks/useSuperRole'

const monthStart = () => toISODate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)).slice(0, 7)

const methodLabel = (v) => PAYMENT_METHODS.find((m) => m.value === v)?.label ?? ''

/** Baixa da fatura: escolhe a forma de pagamento e, ao confirmar, abre o recibo */
function PayInvoiceModal({ invoice, onClose, onPaid, invalidate }) {
  const [forma, setForma] = useState('pix')
  const mutation = useMutationToast(() => markInvoicePaid(invoice.id, forma), {
    success: 'Baixa registrada — recibo gerado e disponível para a academia',
    invalidate,
    onSuccess: () => {
      onClose()
      onPaid(invoice.id)
    },
  })
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Registrar pagamento da fatura"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>
            Confirmar recebimento
          </Button>
        </>
      }
    >
      <p style={{ marginBottom: 16 }}>
        {invoice.academy?.nome} — <strong>{formatCurrency(invoice.valor)}</strong> (venc. {formatDate(invoice.vencimento)})
      </p>
      <Select label="Forma de pagamento" options={PAYMENT_METHODS} value={forma} onChange={(e) => setForma(e.target.value)} />
    </Modal>
  )
}

export default function Financeiro() {
  const { superCan } = useSuperRole()
  const [competencia, setCompetencia] = useState(monthStart())
  const [status, setStatus] = useState('')
  const [paying, setPaying] = useState(null)
  const [receiptFor, setReceiptFor] = useState(null)
  const [confirm, confirmDialog] = useConfirm()

  const query = useQuery({ queryKey: ['saas-invoices', 'all'], queryFn: () => listSaasInvoices() })
  const invalidate = [['saas-invoices'], ['super-dashboard']]

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
      { header: 'Forma', value: (i) => methodLabel(i.forma_pagamento) },
      { header: 'Recibo', value: (i) => (i.recibo_numero ? String(i.recibo_numero).padStart(6, '0') : '') },
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
            {superCan('config') && (
              <Button variant="outline" icon={Palette} to="/super-admin/financeiro/recibo">
                Personalizar recibo
              </Button>
            )}
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
          { key: 'saas_plan.nome', header: 'Plano', render: (i) => `${i.saas_plan?.nome ?? '—'}${i.ciclo === 'anual' ? ' · anual' : ''}` },
          { key: 'valor', header: 'Valor', align: 'right', sortValue: (i) => Number(i.valor), render: (i) => formatCurrency(i.valor) },
          { key: 'vencimento', header: 'Vencimento', render: (i) => formatDate(i.vencimento) },
          { key: 'situacao', header: 'Status', render: (i) => <StatusBadge status={i.situacao} /> },
          {
            key: 'pago_em',
            header: 'Pagamento',
            render: (i) =>
              i.status === 'pago' && i.pago_em ? (
                <span>
                  {formatDate(i.pago_em)}
                  {i.forma_pagamento && ` · ${methodLabel(i.forma_pagamento)}`}
                  {i.recibo_numero && (
                    <span className="text-muted" style={{ display: 'block', fontSize: 12 }}>
                      Recibo nº {String(i.recibo_numero).padStart(6, '0')}
                    </span>
                  )}
                </span>
              ) : (
                '—'
              ),
          },
          {
            key: 'acoes',
            header: '',
            sortable: false,
            align: 'right',
            render: (i) => (
              <div style={{ display: 'inline-flex', gap: 4 }}>
                {i.status === 'pago' && (
                  <Tooltip content="Ver recibo">
                    <Button variant="ghost" size="sm" icon={FileText} onClick={() => setReceiptFor(i.id)} aria-label="Ver recibo" />
                  </Tooltip>
                )}
                {i.status === 'pendente' && (
                  <>
                    <Tooltip content="Registrar pagamento">
                      <Button variant="ghost" size="sm" icon={CheckCircle2} onClick={() => setPaying(i)} aria-label="Registrar pagamento" />
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

      {paying && <PayInvoiceModal invoice={paying} invalidate={invalidate} onClose={() => setPaying(null)} onPaid={setReceiptFor} />}
      <ReceiptModal source="saas" paymentId={receiptFor} onClose={() => setReceiptFor(null)} />
    </>
  )
}
