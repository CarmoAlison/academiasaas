import { AlertTriangle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatCurrency } from '../../utils/formatters'
import styles from './client.module.css'
import { useMyDelinquency } from './useStudent'

/**
 * Aviso de mensalidade em atraso (além da tolerância da academia).
 * @param {{ context?: 'aulas'|'financeiro'|'inicio' }} props
 */
export default function DelinquencyBanner({ context = 'inicio' }) {
  const { inadimplente, atrasadas, total, bloqueiaReservas } = useMyDelinquency()
  if (!inadimplente) return null
  return (
    <div className={styles.alertBanner} role="alert">
      <AlertTriangle size={20} />
      <div>
        <strong>
          {atrasadas.length === 1 ? 'Você tem 1 mensalidade em atraso' : `Você tem ${atrasadas.length} mensalidades em atraso`} (
          {formatCurrency(total)})
        </strong>
        <span>
          {bloqueiaReservas
            ? 'As reservas de aulas ficam bloqueadas até a regularização. '
            : 'Regularize para manter seu plano em dia. '}
          Procure a recepção{context !== 'financeiro' && (
            <>
              {' '}ou veja em <Link to="/client/financeiro">Financeiro</Link>
            </>
          )}
          .
        </span>
      </div>
    </div>
  )
}
