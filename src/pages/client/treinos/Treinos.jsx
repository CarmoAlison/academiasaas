import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ChevronDown, ChevronUp, Dumbbell, PlayCircle, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import QueryError from '../../../components/feedback/QueryError'
import { Badge, Button, EmptyState, PageHeader, SkeletonCard, Tabs } from '../../../components/ui'
import { VideoModal } from '../../../components/video/VideoPlayer'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { completeDay, undoComplete } from '../../../services/workoutService'
import { addDays, formatDate } from '../../../utils/formatters'
import { dayLabel, exercisesLabel, startOfWeek, weekPosition } from '../../../utils/workoutDays'
import styles from '../client.module.css'
import { useMyWeekLogs, useMyWorkouts } from '../useStudent'

const todayDow = () => new Date().getDay()

/** Data (nesta semana) em que cai o dia da ficha */
const dateOfWeekday = (dia) => (dia == null ? null : addDays(startOfWeek(), weekPosition(dia)))

function DayCard({ workout, day, log, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen)
  const [video, setVideo] = useState(null)
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['my-workout-logs'] })
  const isToday = day.dia_semana === todayDow()
  const date = dateOfWeekday(day.dia_semana)

  const done = useMutationToast(() => completeDay(workout, day.id), { success: 'Treino concluído! Bom trabalho 💪', onSuccess: refresh })
  const undo = useMutationToast(() => undoComplete(log.id), { success: 'Marcação desfeita', onSuccess: refresh })

  return (
    <section className={`${styles.tile} ${isToday ? styles.dayToday : ''} ${log ? styles.dayDone : ''}`}>
      <button type="button" className={styles.dayHeader} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className={`${styles.dateBox} ${log ? styles.dateBoxDone : ''}`}>
          {log ? (
            <CheckCircle2 size={22} />
          ) : (
            <>
              <small>{dayLabel(day.dia_semana).slice(0, 3)}</small>
              {date && <strong>{date.getDate()}</strong>}
            </>
          )}
        </span>
        <span className={styles.dayInfo}>
          <strong>
            {dayLabel(day.dia_semana)}
            {day.nome ? ` — ${day.nome}` : ''}
          </strong>
          <span className={styles.muted}>
            {log ? 'Concluído · ' : isToday ? 'Hoje · ' : ''}
            {exercisesLabel(day.items.length)}
          </span>
        </span>
        {(log || isToday) && (
          <span className={styles.dayBadge}>
            {log ? <Badge tone="success">Concluído</Badge> : <Badge tone="info">Hoje</Badge>}
          </span>
        )}
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      {open && (
        <>
          <div>
            {day.items.map((it, i) => (
              <div key={it.id} className={styles.exercise}>
                <span className={styles.num}>{i + 1}</span>
                <div>
                  <strong>{it.exercise?.nome}</strong>
                  {it.exercise?.grupo_muscular && <span className={styles.muted}> · {it.exercise.grupo_muscular}</span>}
                  <div className={styles.specs}>
                    {it.series && <span className={styles.spec}>{it.series} séries</span>}
                    {it.repeticoes && <span className={styles.spec}>{it.repeticoes} reps</span>}
                    {it.carga && <span className={styles.spec}>{it.carga}</span>}
                    {it.descanso && <span className={styles.spec}>descanso {it.descanso}</span>}
                  </div>
                  {it.exercise?.instrucoes && (
                    <p className={styles.muted} style={{ marginTop: 6 }}>
                      {it.exercise.instrucoes}
                    </p>
                  )}
                  {it.exercise?.video_url && (
                    <button type="button" className={styles.video} onClick={() => setVideo(it.exercise)}>
                      <PlayCircle size={16} /> Ver vídeo
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {log ? (
            <div className={styles.doneRow}>
              <span>
                <CheckCircle2 size={16} /> Concluído em{' '}
                {new Date(log.concluido_em).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
              <Button variant="ghost" size="sm" icon={RotateCcw} loading={undo.isPending} onClick={() => undo.mutate()}>
                Desfazer
              </Button>
            </div>
          ) : (
            <Button icon={CheckCircle2} block size="lg" loading={done.isPending} onClick={() => done.mutate()}>
              Marcar como concluído
            </Button>
          )}
        </>
      )}
      <VideoModal url={video?.video_url} title={video?.nome} onClose={() => setVideo(null)} />
    </section>
  )
}

function WeekPlan({ workout, logs }) {
  const doneByDay = new Map()
  logs.filter((l) => l.workout_id === workout.id && l.day_id).forEach((l) => !doneByDay.has(l.day_id) && doneByDay.set(l.day_id, l))
  const total = workout.days.length
  const doneCount = workout.days.filter((d) => doneByDay.has(d.id)).length
  const pct = total ? Math.round((doneCount / total) * 100) : 0

  // abre o dia de hoje; sem treino hoje, o primeiro dia ainda não feito
  const todayDay = workout.days.find((d) => d.dia_semana === todayDow())
  const openId = (todayDay && !doneByDay.has(todayDay.id) ? todayDay : workout.days.find((d) => !doneByDay.has(d.id)) ?? todayDay)?.id

  const inicio = startOfWeek()
  return (
    <div className={styles.stack}>
      <section className={`${styles.tile} ${styles.weekCard}`}>
        <div className={styles.tileHeader}>
          <span className={styles.tileTitle}>
            <Dumbbell size={16} /> Semana de {formatDate(inicio)} a {formatDate(addDays(inicio, 6))}
          </span>
          {doneCount === total && total > 0 && <Badge tone="success">Semana completa!</Badge>}
        </div>
        <span className={styles.big}>
          {doneCount} de {total} treinos concluídos
        </span>
        <div className={styles.progress} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${pct}%` }} />
        </div>
        {(workout.objetivo || workout.data_fim || workout.professor?.nome) && (
          <span className={styles.muted}>
            {[
              workout.objetivo,
              workout.professor?.nome && `Prof. ${workout.professor.nome}`,
              workout.data_fim && `ficha válida até ${formatDate(workout.data_fim)}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
      </section>

      {workout.days.map((day) => (
        <DayCard key={day.id} workout={workout} day={day} log={doneByDay.get(day.id)} defaultOpen={day.id === openId} />
      ))}
    </div>
  )
}

export default function Treinos() {
  const workouts = useMyWorkouts()
  const logs = useMyWeekLogs()
  const [selected, setSelected] = useState(null)

  if (workouts.isError) return <QueryError error={workouts.error} onRetry={workouts.refetch} />

  const list = (workouts.data ?? []).filter((w) => w.days.length)
  const current = list.find((w) => w.id === selected) ?? list[0]

  return (
    <>
      <PageHeader title="Meus treinos" subtitle="Seu treino da semana. Marque cada dia ao terminar." />
      {workouts.isPending ? (
        <div className={styles.stack}>
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : !current ? (
        <EmptyState icon={Dumbbell} title="Nenhum treino ativo" description="Seu professor ainda não cadastrou um treino para você." />
      ) : (
        <>
          {list.length > 1 && <Tabs items={list.map((w) => ({ key: w.id, label: w.nome }))} value={current.id} onChange={setSelected} />}
          <WeekPlan key={current.id} workout={current} logs={logs.data ?? []} />
        </>
      )}
    </>
  )
}
