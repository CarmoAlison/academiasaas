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
import { useMemo, useState } from 'react'
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
} from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { useForm } from '../../../hooks/useForm'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { usePermissions } from '../../../hooks/usePermissions'
import { planService } from '../../../services/catalogServices'
import {
  cancelPayment,
  createPayment,
  generateMonthlyCharges,
  listPayments,
  markPaid,
  removePayment,
  reopenPayment,
} from '../../../services/paymentService'
import { listStudentOptions } from '../../../services/studentService'
import { PAYMENT_METHODS } from '../../../utils/constants'
import { exportCSV } from '../../../utils/csv'
import { addDays, formatCPF, formatCurrency, formatDate, paymentStatus, toISODate } from '../../../utils/formatters'
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
        {payment.student?.profile?.nome} — <strong>{formatCurrency(payment.valor)}</strong> (venc. {formatDate(payment.vencimento)})
      </p>
      <Select label="Forma de pagamento" options={PAYMENT_METHODS} value={forma} onChange={(e) => setForma(e.target.value)} />
    </Modal>
  )
}

export default function Financeiro() {
  const { academyId } = useTenant()
  const { can } = usePermissions()
  const [confirm, confirmDialog] = useConfirm()
  const [mes, setMes] = useState(toISODate().slice(0, 7))
  const [status, setStatus] = useState('')
  const [newOpen, setNewOpen] = useState(false)
  const [paying, setPaying] = useState(null)
  const [receiptFor, setReceiptFor] = useState(null)

  const range = monthRange(mes)
  const yesterday = toISODate(addDays(new Date(), -1))
  const query = useQuery({ queryKey: ['payments', academyId, mes], queryFn: () => listPayments(academyId, range) })
  const overdue = useQuery({
    queryKey: ['payments', academyId, 'overdue'],
    queryFn: () => listPayments(academyId, { ate: yesterday, status: 'pendente' }),
  })
  const invalidate = [['payments', academyId], ['admin-dashboard', academyId]]

  const reopenMutation = useMutationToast(reopenPayment, { success: 'Pagamento reaberto', invalidate })
  const cancelMutation = useMutationToast(cancelPayment, { success: 'Cobrança cancelada', invalidate })
  const removeMutation = useMutationToast(removePayment, { success: 'Cobrança excluída', invalidate })
  const generateMutation = useMutationToast(() => generateMonthlyCharges(academyId, `${mes}-10`), {
    success: (n) => (n ? `${n} cobrança(s) gerada(s) com vencimento em 10/${mes.slice(5)}` : 'Todos os alunos ativos já possuem cobrança neste mês'),
    invalidate,
  })

  const rows = useMemo(
    () => (query.data ?? []).map((p) => ({ ...p, situacao: paymentStatus(p) })).filter((p) => !status || p.situacao === status),
    [query.data, status],
  )

  const all = (query.data ?? []).map((p) => ({ ...p, situacao: paymentStatus(p) }))
  const sum = (list) => list.reduce((acc, p) => acc + Number(p.valor), 0)
  const recebido = sum(all.filter((p) => p.situacao === 'pago'))
  const pendente = sum(all.filter((p) => p.situacao === 'pendente'))
  const atrasados = overdue.data ?? []

  const onExport = () =>
    exportCSV(`pagamentos-${mes}`, [
      { header: 'Aluno', value: (p) => p.student?.profile?.nome },
      { header: 'CPF', value: (p) => formatCPF(p.student?.profile?.cpf) },
      { header: 'Descrição', value: (p) => p.descricao },
      { header: 'Plano', value: (p) => p.plan?.nome },
      { header: 'Valor', value: (p) => Number(p.valor).toFixed(2).replace('.', ',') },
      { header: 'Vencimento', value: (p) => formatDate(p.vencimento) },
      { header: 'Status', value: (p) => p.situacao },
      { header: 'Pago em', value: (p) => (p.pago_em ? formatDate(p.pago_em) : '') },
      { header: 'Forma', value: (p) => PAYMENT_METHODS.find((m) => m.value === p.forma_pagamento)?.label ?? '' },
    ], rows)

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
              <Button variant="outline" icon={Download} onClick={onExport} disabled={!rows.length}>
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
        <StatCard label="Previsto no mês" value={formatCurrency(sum(all.filter((p) => p.status !== 'cancelado')))} icon={DollarSign} loading={query.isPending} />
        <StatCard label="Recebido" value={formatCurrency(recebido)} icon={CheckCircle2} tone="success" loading={query.isPending} />
        <StatCard label="A receber" value={formatCurrency(pendente)} icon={Clock} tone="warning" loading={query.isPending} />
        <StatCard
          label="Inadimplência"
          value={formatCurrency(sum(atrasados))}
          icon={AlertTriangle}
          tone="danger"
          loading={overdue.isPending}
          hint={`${new Set(atrasados.map((p) => p.student_id)).size} aluno(s) com parcelas vencidas`}
        />
      </StatGrid>

      <DataTable
        loading={query.isPending}
        data={rows}
        searchKeys={['student.profile.nome', 'student.profile.cpf', 'descricao']}
        searchPlaceholder="Buscar aluno"
        initialSort={{ key: 'vencimento', dir: 'asc' }}
        filters={
          <>
            <Input type="month" aria-label="Mês" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} />
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
        emptyTitle="Nenhuma cobrança neste mês"
        emptyDescription='Use "Gerar mensalidades" para criar as cobranças dos alunos ativos com plano.'
        columns={[
          { key: 'student.profile.nome', header: 'Aluno', render: (p) => <strong>{p.student?.profile?.nome}</strong> },
          { key: 'descricao', header: 'Descrição', render: (p) => `${p.descricao ?? 'Cobrança'}${p.plan ? ` · ${p.plan.nome}` : ''}` },
          { key: 'valor', header: 'Valor', align: 'right', sortValue: (p) => Number(p.valor), render: (p) => formatCurrency(p.valor) },
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
                            if (await confirm({ title: 'Cancelar cobrança', message: `Cancelar a cobrança de ${p.student?.profile?.nome}?`, danger: true, confirmLabel: 'Cancelar cobrança' })) {
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
