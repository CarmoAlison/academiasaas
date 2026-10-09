import { Clock } from 'lucide-react'
import { Badge } from '../../../components/ui'
import { DIAS_SEMANA, horarioLabel, isOpenNow } from '../../../utils/horarios'
import styles from '../client.module.css'

const ORDEM = [1, 2, 3, 4, 5, 6, 0]

/** Horário de funcionamento da academia (só aparece se a academia configurou) */
export default function HorarioTile({ horarios }) {
  if (!Array.isArray(horarios) || horarios.length !== 7) return null
  const hoje = new Date().getDay()
  const aberta = isOpenNow(horarios)

  return (
    <section className={styles.tile}>
      <div className={styles.tileHeader}>
        <span className={styles.tileTitle}>
          <Clock size={16} /> Horário da academia
        </span>
        <Badge tone={aberta ? 'success' : 'neutral'}>{aberta ? 'Aberta agora' : 'Fechada agora'}</Badge>
      </div>
      <span className={styles.big}>Hoje: {horarioLabel(horarios[hoje])}</span>
      <details>
        <summary className={styles.muted} style={{ cursor: 'pointer' }}>
          Ver a semana
        </summary>
        <ul className={styles.list} style={{ marginTop: 8 }}>
          {ORDEM.map((i) => (
            <li key={i} className={styles.listItem} style={i === hoje ? { fontWeight: 600 } : undefined}>
              <span>{DIAS_SEMANA[i]}</span>
              <span className={horarios[i]?.aberto ? '' : styles.muted}>{horarioLabel(horarios[i])}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  )
}
