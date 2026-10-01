import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  DollarSign,
  Download,
  FilePlus2,
  FileText,
  Palette,
  Plus,
  RotateCcw,
  Trash2,
  XCircle,
} from 'lucide-react'
import { useState } from 'react'
import QueryError from '../../../components/feedback/QueryError'
import ReceiptModal from '../../../components/receipt/ReceiptModal'
import {
  Button,
  DataTable,
  FormGrid,
  FullRow,
  Input,
  Modal,
  PageHeader,
  Select,
  StatCard,
  StatGrid,
  StatusBadge,
  Tooltip,
  useConfirm,
  useToast,
} from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { useForm } from '../../../hooks/useForm'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { usePermissions } from '../../../hooks/usePermissions'
import { useServerTable } from '../../../hooks/useServerTable'
import { planService } from '../../../services/catalogServices'
import {
  cancelPayment,
  createPayment,
  exportPayments,
  generateMonthlyCharges,
  listPaymentsPage,
  markPaid,
  paymentsSummary,
  removePayment,
  reopenPayment,
} from '../../../services/paymentService'
import { listStudentOptions } from '../../../services/studentService'
import { PAYMENT_METHODS } from '../../../utils/constants'
import { exportCSV } from '../../../utils/csv'
import { errorMessage } from '../../../utils/errors'
import { addDays, formatCPF, formatCurrency, formatDate, toISODate } from '../../../utils/formatters'
import { rules } from '../../../utils/validators'

const monthRange = (ym) => {
  const [y, m] = ym.split('-').map(Number)
  return { de: toISODate(new Date(y, m - 1, 1)), ate: toISODate(new Date(y, m, 0)) }
}

function NewPaymentModal({ academyId, onClose, invalidate }) {
  const students = useQuery({ queryKey: ['student-options', academyId], queryFn: () => listStudentOptions(academyId) })
  const plans = useQuery({ queryKey: ['plans', academyId], queryFn: () => planService.list(academyId) })
  const { field, values, setValue, handleSubmit } = useForm(
    { student_id: '', plan_id: '', descricao: 'Mensalidade', valor: '', vencimento: toISODate(addDays(new Date(), 5)) },
    { student_id: [rules.required('Selecione o aluno')], valor: [rules.required(), rules.min(0.01)], vencimento: [rules.required()] },
  )
  const mutation = useMutationToast((v) => createPayment(academyId, v), { success: 'Cobrança criada', invalidate, onSuccess: onClose })
  const submit = handleSubmit((v) => mutation.mutate(v))

  const planField = field('plan_id')
  return (
    <Modal
      open
      onClose={onClose}
      title="Nova cobrança"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={mutation.isPending}>
            Criar cobrança
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate>
        <FormGrid columns={2}>
          <FullRow>
            <Select label="Aluno" required placeholder="Selecione" options={students.data ?? []} {...field('student_id')} />
          </FullRow>
          <Select
            label="Plano"
            placeholder="Avulso"
            options={(plans.data ?? []).map((p) => ({ value: p.id, label: p.nome }))}
            {...planField}
            onChange={(e) => {
              planField.onChange(e)
              const plan = plans.data?.find((p) => p.id === e.target.value)
              if (plan && !values.valor) setValue('valor', String(plan.valor))
            }}
          />
          <Input label="Descrição" {...field('descricao')} />
          <Input label="Valor (R$)" type="number" step="0.01" min="0" required {...field('valor')} />
          <Input label="Vencimento" type="date" required {...field('vencimento')} />
        </FormGrid>
      </form>
    </Modal>
  )
}

function PayModal({ payment, onClose, onPaid, invalidate }) {
  const [forma, setForma] = useState('pix')
  const mutation = useMutationToast(() => markPaid(payment.id, forma), {
    success: 'Pagamento registrado — recibo gerado',
    invalidate,
    onSuccess: () => {
      onClose()
      onPaid(payment.id)
    },
  })
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Registrar pagamento"
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
        {payment.aluno_nome} — <strong>{formatCurrency(payment.valor)}</strong> (venc. {formatDate(payment.vencimento)})
      </p>
      <Select label="Forma de pagamento" options={PAYMENT_METHODS} value={forma} onChange={(e) => setForma(e.target.value)} />
    </Modal>
  )
}

export default function Financeiro() {
  const { academyId } = useTenant()
  const { can } = usePermissions()
  const [confirm, confirmDialog] = useConfirm()
  const toast = useToast()
  const [newOpen, setNewOpen] = useState(false)
  const [paying, setPaying] = useState(null)
  const [receiptFor, setReceiptFor] = useState(null)
  const [exporting, setExporting] = useState(false)

  // tabela paginada no servidor; o mês e a situação são filtros
  const { query, tableProps, filters, setFilter, search } = useServerTable({
    queryKey: ['payments', academyId],
    fetchPage: ({ filters: f, ...params }) =>
      listPaymentsPage(academyId, { ...params, filters: { ...monthRange(f.mes), situacao: f.situacao } }),
    pageSize: 25,
    initialSort: { key: 'vencimento', dir: 'asc' },
    initialFilters: { mes: toISODate().slice(0, 7), situacao: '' },
  })
  const mes = filters.mes
  const range = monthRange(mes)
  const summary = useQuery({
    queryKey: ['payments', academyId, 'summary', mes],
    queryFn: () => paymentsSummary(academyId, range.de, range.ate),
  })
  const s = summary.data
  const invalidate = [['payments', academyId], ['admin-dashboard', academyId]]

  const reopenMutation = useMutationToast(reopenPayment, { success: 'Pagamento reaberto', invalidate })
  const cancelMutation = useMutationToast(cancelPayment, { success: 'Cobrança cancelada', invalidate })
  const removeMutation = useMutationToast(removePayment, { success: 'Cobrança excluída', invalidate })
  const generateMutation = useMutationToast(() => generateMonthlyCharges(academyId, `${mes}-10`), {
    success: (n) => (n ? `${n} cobrança(s) gerada(s) com vencimento em 10/${mes.slice(5)}` : 'Todos os alunos ativos já possuem cobrança neste mês'),
    invalidate,
  })

  const onExport = async () => {
    setExporting(true)
    try {
      const rows = await exportPayments(academyId, { search, filters: { ...range, situacao: filters.situacao } })
      exportCSV(`pagamentos-${mes}`, [
        { header: 'Aluno', value: (p) => p.aluno_nome },
        { header: 'CPF', value: (p) => formatCPF(p.aluno_cpf) },
        { header: 'Descrição', value: (p) => p.descricao },
        { header: 'Plano', value: (p) => p.plano_nome },
        { header: 'Valor', value: (p) => Number(p.valor).toFixed(2).replace('.', ',') },
        { header: 'Vencimento', value: (p) => formatDate(p.vencimento) },
        { header: 'Status', value: (p) => p.situacao },
        { header: 'Pago em', value: (p) => (p.pago_em ? formatDate(p.pago_em) : '') },
        { header: 'Forma', value: (p) => PAYMENT_METHODS.find((m) => m.value === p.forma_pagamento)?.label ?? '' },
      ], rows)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setExporting(false)
    }
  }

  if (query.isError) return <QueryError error={query.error} onRetry={query.refetch} />

  return (
    <>
      {confirmDialog}
      <PageHeader
        title="Financeiro"
        subtitle="Mensalidades, recebimentos e inadimplência"
        actions={
          <>
            {can('financeiro.exportar') && (
              <Button variant="outline" icon={Download} onClick={onExport} loading={exporting} disabled={!tableProps.total}>
                Exportar CSV
              </Button>
            )}
            {can('financeiro.editar') && (
              <Button variant="outline" icon={Palette} to="/admin/financeiro/recibo">
                Personalizar recibo
              </Button>
            )}
            {can('financeiro.criar') && (
              <>
                <Button variant="secondary" icon={FilePlus2} loading={generateMutation.isPending} onClick={() => generateMutation.mutate()}>
                  Gerar mensalidades
                </Button>
                <Button icon={Plus} onClick={() => setNewOpen(true)}>
                  Nova cobrança
                </Button>
              </>
            )}
          </>
        }
      />

      <StatGrid>
        <StatCard label="Previsto no mês" value={formatCurrency(s?.previsto)} icon={DollarSign} loading={summary.isPending} />
        <StatCard label="Recebido" value={formatCurrency(s?.recebido)} icon={CheckCircle2} tone="success" loading={summary.isPending} />
        <StatCard
          label="A receber"
          value={formatCurrency(s?.a_receber)}
          icon={Clock}
          tone="warning"
          loading={summary.isPending}
          hint={Number(s?.atrasado_mes) > 0 ? `+ ${formatCurrency(s.atrasado_mes)} já vencidos neste mês` : undefined}
        />
        <StatCard
          label="Inadimplência"
          value={formatCurrency(s?.inadimplencia)}
          icon={AlertTriangle}
          tone="danger"
          loading={summary.isPending}
          hint={`${s?.alunos_em_atraso ?? 0} aluno(s) com parcelas vencidas`}
        />
      </StatGrid>

      <DataTable
        {...tableProps}
        searchPlaceholder="Buscar aluno ou CPF"
        filters={
          <>
            <Input type="month" aria-label="Mês" value={mes} onChange={(e) => e.target.value && setFilter('mes', e.target.value)} />
            <Select
              aria-label="Status"
              placeholder="Todos"
              value={filters.situacao}
              onChange={(e) => setFilter('situacao', e.target.value)}
              options={[
                { value: 'pendente', label: 'Pendente' },
                { value: 'atrasado', label: 'Atrasado' },
                { value: 'pago', label: 'Pago' },
                { value: 'cancelado', label: 'Cancelado' },
              ]}
            />
          </>
        }
        emptyTitle="Nenhuma cobrança neste mês"
        emptyDescription='Use "Gerar mensalidades" para criar as cobranças dos alunos ativos com plano.'
        columns={[
          { key: 'aluno_nome', header: 'Aluno', render: (p) => <strong>{p.aluno_nome}</strong> },
          { key: 'descricao', header: 'Descrição', render: (p) => `${p.descricao ?? 'Cobrança'}${p.plano_nome ? ` · ${p.plano_nome}` : ''}` },
          { key: 'valor', header: 'Valor', align: 'right', render: (p) => formatCurrency(p.valor) },
          { key: 'vencimento', header: 'Vencimento', render: (p) => formatDate(p.vencimento) },
          { key: 'situacao', header: 'Status', render: (p) => <StatusBadge status={p.situacao} /> },
          {
            key: 'pago_em',
            header: 'Pagamento',
            render: (p) =>
              p.status === 'pago' && p.pago_em ? (
                <span>
                  {formatDate(p.pago_em)} · {PAYMENT_METHODS.find((m) => m.value === p.forma_pagamento)?.label ?? ''}
                  {p.recibo_numero && <span className="text-muted" style={{ display: 'block', fontSize: 12 }}>Recibo nº {String(p.recibo_numero).padStart(6, '0')}</span>}
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
            render: (p) => (
              <div style={{ display: 'inline-flex', gap: 4 }}>
                {p.status === 'pago' && (
                  <Tooltip content="Ver recibo">
                    <Button variant="ghost" size="sm" icon={FileText} onClick={() => setReceiptFor(p.id)} aria-label="Ver recibo" />
                  </Tooltip>
                )}
                {can('financeiro.editar') && (
                <div style={{ display: 'inline-flex', gap: 4 }}>
                  {p.status === 'pendente' ? (
                    <>
                      <Tooltip content="Registrar pagamento">
                        <Button variant="ghost" size="sm" icon={CheckCircle2} onClick={() => setPaying(p)} aria-label="Registrar pagamento" />
                      </Tooltip>
                      <Tooltip content="Cancelar cobrança">
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={XCircle}
                          aria-label="Cancelar"
                          onClick={async () => {
                            if (await confirm({ title: 'Cancelar cobrança', message: `Cancelar a cobrança de ${p.aluno_nome}?`, danger: true, confirmLabel: 'Cancelar cobrança' })) {
                              cancelMutation.mutate(p.id)
                            }
                          }}
                        />
                      </Tooltip>
                    </>
                  ) : (
                    <Tooltip content="Reabrir">
                      <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => reopenMutation.mutate(p.id)} aria-label="Reabrir" />
                    </Tooltip>
                  )}
                  {can('financeiro.excluir') && (
                    <Tooltip content="Excluir">
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Trash2}
                        aria-label="Excluir"
                        onClick={async () => {
                          if (await confirm({ title: 'Excluir cobrança', message: 'A cobrança será removida da listagem.', danger: true, confirmLabel: 'Excluir' })) {
                            removeMutation.mutate(p.id)
                          }
                        }}
                      />
                    </Tooltip>
                  )}
                </div>
                )}
              </div>
            ),
          },
        ]}
      />

      {newOpen && <NewPaymentModal academyId={academyId} invalidate={invalidate} onClose={() => setNewOpen(false)} />}
      {paying && <PayModal payment={paying} invalidate={invalidate} onClose={() => setPaying(null)} onPaid={setReceiptFor} />}
      <ReceiptModal paymentId={receiptFor} onClose={() => setReceiptFor(null)} />
    </>
  )
}
