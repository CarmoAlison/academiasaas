import { CalendarClock, FileText, Receipt } from 'lucide-react'
import { useState } from 'react'
import QueryError from '../../../components/feedback/QueryError'
import ReceiptModal from '../../../components/receipt/ReceiptModal'
import { Button, EmptyState, PageHeader, SkeletonCard, StatusBadge } from '../../../components/ui'
import { PAYMENT_METHODS } from '../../../utils/constants'
import { calcEncargos } from '../../../utils/cobranca'
import { formatCurrency, formatDate, paymentStatus } from '../../../utils/formatters'
import DelinquencyBanner from '../DelinquencyBanner'
import styles from '../client.module.css'
import { useAcademySettings, useMyPayments } from '../useStudent'
import PixBox from './PixBox'

export default function Financeiro() {
  const payments = useMyPayments()
  const settings = useAcademySettings().data
  const [receiptFor, setReceiptFor] = useState(null)

  if (payments.isError) return <QueryError error={payments.error} onRetry={payments.refetch} />

  const list = payments.data ?? []
  const next = list.filter((p) => p.status === 'pendente').sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0]
  const overdue = list.filter((p) => paymentStatus(p) === 'atrasado')

  return (
    <>
      <PageHeader title="Financeiro" subtitle="Suas mensalidades e pagamentos" />
      <DelinquencyBanner context="financeiro" />

      {payments.isPending ? (
        <SkeletonCard />
      ) : (
        <div className={styles.stack}>
          <section className={`${styles.tile} ${next ? styles.highlight : ''}`}>
            <span className={styles.tileTitle}>
              <CalendarClock size={16} /> Próximo vencimento
            </span>
            {next ? (
              <>
                <span className={styles.big}>{formatCurrency(next.valor)}</span>
                <span className={styles.muted}>
                  {next.descricao ?? 'Mensalidade'} · vence em {formatDate(next.vencimento)}
                </span>
                {overdue.length > 0 && (
                  <span>
                    ⚠️ Você tem {overdue.length} parcela(s) em atraso ({formatCurrency(overdue.reduce((a, p) => a + calcEncargos(p, settings).total, 0))}
                    {overdue.some((p) => calcEncargos(p, settings).encargos > 0) ? ' com multa e juros' : ''}). Procure a recepção.
                  </span>
                )}
              </>
            ) : (
              <span className={styles.muted}>Nenhuma cobrança pendente. Tudo em dia! ✅</span>
            )}
          </section>

          {next && <PixBox settings={settings} />}

          <h2 style={{ fontSize: 16, marginTop: 8 }}>Histórico</h2>
          {!list.length ? (
            <EmptyState icon={Receipt} title="Nenhum pagamento registrado" />
          ) : (
            <ul className={styles.list}>
              {list.map((p) => (
                <li key={p.id} className={styles.listItem}>
                  <div>
                    <strong>{formatCurrency(p.valor)}</strong>
                    <div className={styles.muted}>
                      {p.descricao ?? 'Mensalidade'}
                      {p.plan?.nome ? ` · ${p.plan.nome}` : ''} · venc. {formatDate(p.vencimento)}
                    </div>
                    {paymentStatus(p) === 'atrasado' && calcEncargos(p, settings).encargos > 0 && (
                      <div className={styles.muted}>Com multa e juros, hoje: {formatCurrency(calcEncargos(p, settings).total)}</div>
                    )}
                    {p.pago_em && (
                      <div className={styles.muted}>
                        Pago em {formatDate(p.pago_em)}
                        {p.forma_pagamento ? ` · ${PAYMENT_METHODS.find((m) => m.value === p.forma_pagamento)?.label ?? ''}` : ''}
                      </div>
                    )}
                  </div>
                  <div className={styles.receiptActions}>
                    <StatusBadge status={paymentStatus(p)} />
                    {p.status === 'pago' && (
                      <Button variant="secondary" size="sm" icon={FileText} onClick={() => setReceiptFor(p.id)}>
                        Recibo
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <ReceiptModal paymentId={receiptFor} onClose={() => setReceiptFor(null)} />
    </>
  )
}
