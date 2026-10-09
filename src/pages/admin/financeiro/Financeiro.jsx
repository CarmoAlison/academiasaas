import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  DollarSign,
  Download,
  FilePlus2,
  FileText,
  MessageCircle,
  Palette,
  Plus,
  RotateCcw,
  Trash2,
  XCircle,
} from 'lucide-react'
import { useState } from 'react'
import QueryError from '../../../components/feedback/QueryError'
import ReceiptModal from '../../../components/receipt/ReceiptModal'
import BatchChargeModal from '../../../components/whatsapp/BatchChargeModal'
import {
  Button,
  Checkbox,
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
import { useAcademySettings } from '../../../hooks/useAcademySettings'
import { useTenant } from '../../../hooks/useAuth'
import { useForm } from '../../../hooks/useForm'
import { useModules } from '../../../hooks/useModules'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { usePermissions } from '../../../hooks/usePermissions'
import { useServerTable } from '../../../hooks/useServerTable'
import { planService } from '../../../services/catalogServices'
import {
  cancelPayment,
  createPayment,
  exportPayments,
  generatePlanCharges,
  listPaymentsPage,
  markPaid,
  paymentsSummary,
  removePayment,
  reopenPayment,
} from '../../../services/paymentService'
import { listStudentOptions } from '../../../services/studentService'
import { calcEncargos } from '../../../utils/cobranca'
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

function PayModal({ payment, settings, onClose, onPaid, invalidate }) {
  const [forma, setForma] = useState('pix')
  const enc = calcEncargos(payment, settings)
  const [comEncargos, setComEncargos] = useState(enc.encargos > 0)
  const mutation = useMutationToast(
    () =>
      markPaid(
        payment.id,
        forma,
        comEncargos && enc.encargos > 0
          ? {
              valor: enc.total,
              descricao: `${payment.descricao ?? 'Mensalidade'} (+ multa ${formatCurrency(enc.multa)} e juros ${formatCurrency(enc.juros)})`,
            }
          : {},
      ),
    {
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
        {payment.aluno_nome} — <strong>{formatCurrency(comEncargos ? enc.total : payment.valor)}</strong> (venc. {formatDate(payment.vencimento)})
      </p>
      <Select label="Forma de pagamento" options={PAYMENT_METHODS} value={forma} onChange={(e) => setForma(e.target.value)} />
      {enc.encargos > 0 && (
        <div style={{ marginTop: 16 }}>
          <Checkbox
            checked={comEncargos}
            onChange={setComEncargos}
            label={`Cobrar multa (${formatCurrency(enc.multa)}) e juros de ${enc.dias} dia(s) (${formatCurrency(enc.juros)})`}
          />
          <small className="text-muted" style={{ display: 'block', marginTop: 4 }}>
            Valor original {formatCurrency(payment.valor)}. Desmarque para receber sem encargos.
          </small>
        </div>
      )}
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
  const [batchOpen, setBatchOpen] = useState(false)
  const mod = useModules()
  const settings = useAcademySettings().data

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
  const recebidoPct = s && Number(s.previsto) ? Math.round((Number(s.recebido) / Number(s.previsto)) * 100) : null
  const invalidate = [['payments', academyId], ['admin-dashboard', academyId]]

  const reopenMutation = useMutationToast(reopenPayment, { success: 'Pagamento reaberto', invalidate })
  const cancelMutation = useMutationToast(cancelPayment, { success: 'Cobrança cancelada', invalidate })
  const removeMutation = useMutationToast(removePayment, { success: 'Cobrança excluída', invalidate })
  // renovação: alunos cujo plano vence até o fim do mês escolhido e ainda sem cobrança pendente
  const generateMutation = useMutationToast(() => generatePlanCharges(academyId, range.ate), {
    success: (n) =>
      n
        ? `${n} cobrança(s) de renovação gerada(s) (vencimento no dia seguinte ao fim de cada plano)`
        : 'Nenhuma renovação pendente: todos os planos que vencem até o fim do mês já têm cobrança',
    invalidate: [...invalidate, ['students', academyId]],
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
            {mod.has('whatsapp') && (
              <Button variant="outline" icon={MessageCircle} onClick={() => setBatchOpen(true)}>
                Cobrar atrasados
              </Button>
            )}
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
                <Button
                  variant="secondary"
                  icon={FilePlus2}
                  loading={generateMutation.isPending}
                  onClick={async () => {
                    if (
                      await confirm({
                        title: 'Gerar cobranças de renovação?',
                        message: `Cria uma cobrança para cada aluno ativo cujo plano vence até o fim de ${mes.slice(5)}/${mes.slice(0, 4)} e que ainda não tem cobrança em aberto. O valor é o do plano (mensal, trimestral…).`,
                        confirmLabel: 'Gerar cobranças',
                      })
                    ) {
                      generateMutation.mutate()
                    }
                  }}
                >
                  Gerar renovações
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
        <StatCard
          label="Previsto no mês"
          value={formatCurrency(s?.previsto)}
          icon={DollarSign}
          loading={summary.isPending}
          hint="Parcelas com vencimento neste mês"
        />
        <StatCard
          label="Recebido (pelo vencimento)"
          value={formatCurrency(s?.recebido)}
          icon={CheckCircle2}
          tone="success"
          loading={summary.isPending}
          progress={recebidoPct ?? undefined}
          hint={[
            recebidoPct !== null ? `${recebidoPct}% do previsto (${formatCurrency(s.previsto)})` : 'Parcelas com vencimento neste mês já pagas',
            s?.recebido_caixa !== undefined ? `entrou no caixa no mês: ${formatCurrency(s.recebido_caixa)}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        />
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
          hint={
            s?.tolerancia !== undefined
              ? `${s.alunos_em_atraso} aluno(s) com parcela vencida · ${s.alunos_inadimplentes} inadimplente(s) após ${s.tolerancia} dia(s) de tolerância`
              : `${s?.alunos_em_atraso ?? 0} aluno(s) com parcelas vencidas (desde o 1º dia)`
          }
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
        emptyDescription='Use "Gerar renovações" para criar as cobranças dos planos que vencem neste mês.'
        columns={[
          { key: 'aluno_nome', header: 'Aluno', render: (p) => <strong>{p.aluno_nome}</strong> },
          { key: 'descricao', header: 'Descrição', render: (p) => `${p.descricao ?? 'Cobrança'}${p.plano_nome ? ` · ${p.plano_nome}` : ''}` },
          {
            key: 'valor',
            header: 'Valor',
            align: 'right',
            render: (p) => {
              const enc = p.status === 'pendente' ? calcEncargos(p, settings) : null
              return (
                <>
                  {formatCurrency(p.valor)}
                  {enc?.encargos > 0 && (
                    <small className="text-muted" style={{ display: 'block' }} title={`Multa ${formatCurrency(enc.multa)} + juros ${formatCurrency(enc.juros)}`}>
                      hoje {formatCurrency(enc.total)}
                    </small>
                  )}
                </>
              )
            },
          },
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
      {batchOpen && <BatchChargeModal onClose={() => setBatchOpen(false)} />}
      {paying && <PayModal payment={paying} settings={settings} invalidate={invalidate} onClose={() => setPaying(null)} onPaid={setReceiptFor} />}
      <ReceiptModal paymentId={receiptFor} onClose={() => setReceiptFor(null)} />
    </>
  )
}
