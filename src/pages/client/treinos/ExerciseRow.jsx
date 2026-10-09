import { Check, LineChart, PlayCircle, Timer } from 'lucide-react'
import { useState } from 'react'
import { formatKg, parseDescanso } from '../../../utils/progresso'
import cs from '../client.module.css'
import styles from './ExerciseRow.module.css'

const parseKg = (v) => {
  const s = String(v ?? '').trim().replace(',', '.')
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 && n <= 2000 ? Math.round(n * 100) / 100 : undefined
}

/**
 * Exercício do dia: marcar como feito, anotar a carga, cronômetro de descanso e evolução.
 * @param {{ item: object, index: number, todayLog?: object, lastCarga?: number|null, showVideo: boolean,
 *   onToggle: (feito: boolean) => void, onCarga: (carga: number|null) => void, onRest: (secs: number, label: string) => void,
 *   onEvolucao: () => void, onVideo: () => void }} props
 */
export default function ExerciseRow({ item, index, todayLog, lastCarga, showVideo, onToggle, onCarga, onRest, onEvolucao, onVideo }) {
  const feito = Boolean(todayLog?.feito)
  const saved = todayLog?.carga ?? null
  const [carga, setCarga] = useState(saved === null ? '' : String(saved).replace('.', ','))
  const [erro, setErro] = useState(false)
  const nome = item.exercise?.nome

  const commit = () => {
    const v = parseKg(carga)
    if (v === undefined) return setErro(true)
    setErro(false)
    if (v !== (saved === null ? null : Number(saved))) onCarga(v)
  }

  return (
    <div className={`${styles.row} ${feito ? styles.feito : ''}`}>
      <button
        type="button"
        className={styles.check}
        onClick={() => onToggle(!feito)}
        aria-pressed={feito}
        aria-label={feito ? `Desmarcar ${nome}` : `Marcar ${nome} como feito`}
      >
        {feito ? <Check size={16} strokeWidth={3} /> : index + 1}
      </button>
      <div className={styles.body}>
        <strong className={styles.name}>{nome}</strong>
        {item.exercise?.grupo_muscular && <span className={cs.muted}> · {item.exercise.grupo_muscular}</span>}
        <div className={cs.specs}>
          {item.series && <span className={cs.spec}>{item.series} séries</span>}
          {item.repeticoes && <span className={cs.spec}>{item.repeticoes} reps</span>}
          {item.carga && <span className={cs.spec}>{item.carga}</span>}
          {item.descanso && <span className={cs.spec}>descanso {item.descanso}</span>}
        </div>
        {item.exercise?.instrucoes && (
          <p className={cs.muted} style={{ marginTop: 6 }}>
            {item.exercise.instrucoes}
          </p>
        )}

        <div className={styles.tools}>
          <label className={`${styles.kg} ${erro ? styles.kgErro : ''}`}>
            <input
              inputMode="decimal"
              placeholder={lastCarga !== null && lastCarga !== undefined ? String(lastCarga).replace('.', ',') : 'Carga'}
              value={carga}
              onChange={(e) => setCarga(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              aria-label={`Carga usada em ${nome} (kg)`}
            />
            <span>kg</span>
          </label>
          <button type="button" className={styles.tool} onClick={() => onRest(parseDescanso(item.descanso), nome)}>
            <Timer size={15} /> {item.descanso || 'Descanso'}
          </button>
          <button type="button" className={styles.tool} onClick={onEvolucao}>
            <LineChart size={15} /> Evolução
          </button>
          {showVideo && item.exercise?.video_url && (
            <button type="button" className={styles.tool} onClick={onVideo}>
              <PlayCircle size={15} /> Vídeo
            </button>
          )}
        </div>
        {lastCarga !== null && lastCarga !== undefined && <small className={cs.muted}>Última vez: {formatKg(lastCarga)}</small>}
      </div>
    </div>
  )
}
