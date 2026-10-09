import { Flame, Minus, Plus, Trophy } from 'lucide-react'
import { SkeletonCard } from '../../../components/ui'
import { useModules } from '../../../hooks/useModules'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { setMyWeeklyGoal } from '../../../services/studentService'
import { achievements, weeklyStreak } from '../../../utils/progresso'
import styles from '../client.module.css'
import { useMyProgress, useStudentId } from '../useStudent'
import ps from './ProgressoTile.module.css'

/** Sequência de semanas, meta semanal e conquistas */
export default function ProgressoTile() {
  const { studentId } = useStudentId()
  const { has } = useModules()
  const progress = useMyProgress()
  const setGoal = useMutationToast((meta) => setMyWeeklyGoal(studentId, meta), {
    invalidate: [['my-progress', studentId]],
  })

  if (progress.isPending) return <SkeletonCard lines={3} />
  if (!progress.data) return null

  const p = progress.data
  const meta = setGoal.isPending ? setGoal.variables : p.meta_semanal
  const { sequencia, estaSemana } = weeklyStreak(p.semanas, meta)
  // conquistas por check-in (ou por treinos concluídos, se a academia não usa check-in)
  const porCheckin = has('checkin')
  const total = porCheckin ? p.total_checkins : p.total_treinos
  const unidade = porCheckin ? 'check-ins' : 'treinos'
  const { lista, proxima } = achievements(total)
  const pct = Math.min(100, Math.round((estaSemana / meta) * 100))

  return (
    <section className={styles.tile}>
      <div className={styles.tileHeader}>
        <span className={styles.tileTitle}>
          <Flame size={16} /> Sequência e metas
        </span>
      </div>

      <div className={ps.streak}>
        <span className={`${ps.flame} ${sequencia ? ps.on : ''}`}>🔥</span>
        <div>
          <span className={styles.big}>
            {sequencia ? `${sequencia} ${sequencia === 1 ? 'semana' : 'semanas'} seguida${sequencia === 1 ? '' : 's'}` : 'Comece sua sequência'}
          </span>
          <span className={styles.muted} style={{ display: 'block' }}>
            {sequencia ? 'batendo a meta de treinos' : `Treine ${meta}x nesta semana para acender o fogo`}
          </span>
        </div>
      </div>

      <div className={ps.goal}>
        <div className={ps.goalHead}>
          <span>
            Esta semana: <strong>{estaSemana}</strong> de {meta} {meta === 1 ? 'treino' : 'treinos'}
            {estaSemana >= meta && ' ✅'}
          </span>
          <span className={ps.stepper} aria-label="Meta de treinos por semana">
            <button type="button" onClick={() => setGoal.mutate(meta - 1)} disabled={meta <= 1 || setGoal.isPending} aria-label="Diminuir meta">
              <Minus size={14} />
            </button>
            <span>meta {meta}x</span>
            <button type="button" onClick={() => setGoal.mutate(meta + 1)} disabled={meta >= 7 || setGoal.isPending} aria-label="Aumentar meta">
              <Plus size={14} />
            </button>
          </span>
        </div>
        <div className={styles.progress} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${pct}%` }} />
        </div>
        <small className={styles.muted}>Conta o dia com check-in ou treino concluído.</small>
      </div>

      <div className={ps.badges}>
        <span className={ps.badgesTitle}>
          <Trophy size={14} /> Conquistas · {total} {unidade}
        </span>
        <ul>
          {lista.map((c) => (
            <li key={c.marco} className={c.ok ? ps.ok : ''} title={`${c.marco} ${unidade}${c.ok ? ' — conquistado!' : ''}`}>
              <strong>{c.marco}</strong>
            </li>
          ))}
        </ul>
        {proxima && (
          <small className={styles.muted}>
            Próxima: {proxima} {unidade} (faltam {proxima - total})
          </small>
        )}
      </div>
    </section>
  )
}
