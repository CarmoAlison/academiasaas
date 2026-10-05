import { formatCurrency, formatDate } from '../../utils/formatters'
import styles from './PriceBreakdown.module.css'

/**
 * Composição da cobrança: plano, desconto anual, oferta, adicionais e total.
 * @param {{ price: object|null, compact?: boolean }} props price = academy_price() ou calcSubscription()
 */
export default function PriceBreakdown({ price, compact = false }) {
  if (!price) return null
  const anual = price.meses === 12
  return (
    <div className={`${styles.box} ${compact ? styles.compact : ''}`}>
      <dl className={styles.lines}>
        <div>
          <dt>
            Plano {price.plano} {anual ? '× 12 meses' : '(mensal)'}
          </dt>
          <dd>{formatCurrency(price.plano_bruto)}</dd>
        </div>
        {Number(price.desconto_anual) > 0 && (
          <div className={styles.discount}>
            <dt>Desconto do plano anual ({Number(price.desconto_anual_pct)}%)</dt>
            <dd>− {formatCurrency(price.desconto_anual)}</dd>
          </div>
        )}
        {Number(price.desconto_oferta) > 0 && (
          <div className={styles.discount}>
            <dt>
              Oferta {price.oferta} ({Number(price.oferta_pct)}%
              {anual && price.oferta_meses < 12 ? ` em ${price.oferta_meses} de 12 meses` : ''})
              {price.oferta_ate ? <small> até {formatDate(price.oferta_ate)}</small> : null}
            </dt>
            <dd>− {formatCurrency(price.desconto_oferta)}</dd>
          </div>
        )}
        {(price.adicionais ?? []).map((a) => (
          <div key={a.nome}>
            <dt>
              + {a.nome}
              {anual ? <small> ({formatCurrency(a.valor_mensal)}/mês × 12)</small> : null}
            </dt>
            <dd>{formatCurrency(a.valor)}</dd>
          </div>
        ))}
      </dl>
      <div className={styles.total}>
        <span>{anual ? 'Total por ano' : 'Total por mês'}</span>
        <strong>{formatCurrency(price.total)}</strong>
      </div>
      {anual && <p className={styles.note}>Equivale a {formatCurrency(price.mensal_equivalente)}/mês</p>}
    </div>
  )
}
