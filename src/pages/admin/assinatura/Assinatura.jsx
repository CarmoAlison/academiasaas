import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CalendarClock, CheckCircle2, FileText, Info, Package } from 'lucide-react'
import { useMemo, useState } from 'react'
import QueryError from '../../../components/feedback/QueryError'
import ReceiptModal from '../../../components/receipt/ReceiptModal'
import { Button, DataTable, PageHeader, StatCard, StatGrid, StatusBadge } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { getAcademy, listSaasInvoices } from '../../../services/saasService'
import { PAYMENT_METHODS } from '../../../utils/constants'
import { formatCurrency, formatDate, paymentStatus } from '../../../utils/formatters'
import styles from './Assinatura.module.css'
import PlanUsage from './PlanUsage'

const competenciaLabel = (d) => {
  const [y, m] = String(d).split('-')
  return `${m}/${y}`
}

/**
 * Faturas da assinatura do sistema (pagas pela academia ao SaaS).
 * As baixas são feitas pelo Super Admin; aqui o Admin acompanha e baixa os recibos.
 */
export default function Assinatura() {
  const { academyId } = useTenant()
  const [receiptFor, setReceiptFor] = useState(null)

  const invoices = useQuery({
    queryKey: ['saas-invoices', academyId],
    queryFn: () => listSaasInvoices({ academyId }),
    refetchOnWindowFocus: true, // baixa feita pelo Super Admin aparece ao voltar para a aba
  })
  const academy = useQuery({ queryKey: ['academy', academyId], queryFn: () => getAcademy(academyId) })

  const rows = useMemo(() => (invoices.data ?? []).map((i) => ({ ...i, situacao: paymentStatus(i) })), [invoices.data])
  const proxima = rows.filter((i) => i.status === 'pendente').sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0]
  const atrasadas = rows.filter((i) => i.situacao === 'atrasado')
  const pagas = rows.filter((i) => i.status === 'pago')
  const plano = academy.data?.saas_plan

  if (invoices.isError) return <QueryError error={invoices.error} onRetry={invoices.refetch} />

  return (
    <>
      <PageHeader title="Assinatura do sistema" subtitle="Faturas do seu plano e recibos de pagamento" />
      <PlanUsage />

      {atrasadas.length > 0 && (
        <div className={styles.alert} role="alert">
          <AlertTriangle size={18} />
          <span>
            Há {atrasadas.length} fatura(s) em atraso, somando <strong>{formatCurrency(atrasadas.reduce((a, i) => a + Number(i.valor), 0))}</strong>.
            Regularize para evitar a suspensão do acesso.
          </span>
        </div>
      )}

      <StatGrid>
        <StatCard
          label="Plano atual"
          value={plano?.nome ?? '—'}
          icon={Package}
          loading={academy.isPending}
          hint={plano ? `${formatCurrency(plano.valor)}/mês` : undefined}
        />
        <StatCard
          label="Próximo vencimento"
          value={proxima ? formatDate(proxima.vencimento) : 'Nada pendente'}
          icon={CalendarClock}
          tone={proxima?.situacao === 'atrasado' ? 'danger' : 'warning'}
          loading={invoices.isPending}
          hint={proxima ? formatCurrency(proxima.valor) : undefined}
        />
        <StatCard
          label="Faturas pagas"
          value={pagas.length}
          icon={CheckCircle2}
          tone="success"
          loading={invoices.isPending}
          hint={`${formatCurrency(pagas.reduce((a, i) => a + Number(i.valor), 0))} no total`}
        />
      </StatGrid>

      <DataTable
        loading={invoices.isPending}
        data={rows}
        searchable={false}
        initialSort={{ key: 'competencia', dir: 'desc' }}
        emptyTitle="Nenhuma fatura ainda"
        emptyDescription="As faturas da assinatura aparecem aqui assim que forem geradas."
        columns={[
          { key: 'competencia', header: 'Competência', render: (i) => <strong>{competenciaLabel(i.competencia)}</strong> },
          { key: 'saas_plan.nome', header: 'Plano', render: (i) => i.saas_plan?.nome ?? '—' },
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
                  {i.forma_pagamento && ` · ${PAYMENT_METHODS.find((m) => m.value === i.forma_pagamento)?.label ?? ''}`}
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
            render: (i) =>
              i.status === 'pago' && (
                <Button variant="secondary" size="sm" icon={FileText} onClick={() => setReceiptFor(i.id)}>
                  Recibo
                </Button>
              ),
          },
        ]}
      />

      <p className="text-muted" style={{ display: 'flex', gap: 8, marginTop: 16, fontSize: 13 }}>
        <Info size={16} style={{ flexShrink: 0, marginTop: 2 }} />
        As baixas são registradas pela equipe do sistema assim que o pagamento é confirmado. O recibo fica disponível aqui na hora.
      </p>

      <ReceiptModal source="saas" paymentId={receiptFor} onClose={() => setReceiptFor(null)} />
    </>
  )
}
