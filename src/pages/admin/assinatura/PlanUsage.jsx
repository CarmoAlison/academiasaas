import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Users } from 'lucide-react'
import { useTenant } from '../../../hooks/useAuth'
import { academyUsage } from '../../../services/studentService'
import styles from './Assinatura.module.css'

/** Uso do limite de alunos ativos do plano SaaS */
export function usePlanUsage() {
  const { academyId } = useTenant()
  const query = useQuery({ queryKey: ['students', academyId, 'usage'], queryFn: () => academyUsage(academyId) })
  const u = query.data
  const pct = u?.limite ? Math.min(100, Math.round((u.ativos / u.limite) * 100)) : null
  return { ...query, usage: u, pct }
}

/**
 * Barra "X de Y alunos ativos".
 * @param {{ compact?: boolean }} props compact = só aparece quando estiver perto do limite (≥ 90%)
 */
export default function PlanUsage({ compact = false }) {
  const { usage, pct } = usePlanUsage()
  if (!usage || pct == null) {
    if (compact || !usage) return null
    return (
      <p className={styles.usageNote}>
        <Users size={16} /> {usage.ativos} alunos ativos · plano {usage.plano ?? '—'} sem limite de alunos
      </p>
    )
  }
  if (compact && pct < 90) return null

  const tone = pct >= 100 ? 'danger' : pct >= 90 ? 'warning' : 'ok'
  return (
    <div className={`${styles.usage} ${styles[`usage_${tone}`]}`} role={tone === 'ok' ? undefined : 'alert'}>
      <div className={styles.usageTop}>
        <span>
          {tone !== 'ok' && <AlertTriangle size={16} />}
          <strong>
            {usage.ativos} de {usage.limite}
          </strong>{' '}
          alunos ativos do plano {usage.plano}
        </span>
        <span>{pct}%</span>
      </div>
      <div className={styles.usageBar}>
        <div style={{ width: `${pct}%` }} />
      </div>
      {tone === 'danger' && <small>Limite atingido: novos alunos ativos não podem ser cadastrados. Fale com o suporte para mudar de plano.</small>}
      {tone === 'warning' && <small>Perto do limite do plano. Considere mudar de plano para não travar novas matrículas.</small>}
    </div>
  )
}
