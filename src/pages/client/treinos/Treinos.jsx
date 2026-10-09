import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ChevronDown, ChevronUp, Dumbbell, RotateCcw } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import QueryError from '../../../components/feedback/QueryError'
import { Badge, Button, EmptyState, PageHeader, SkeletonCard, Tabs, useToast } from '../../../components/ui'
import { VideoModal } from '../../../components/video/VideoPlayer'
import { useModules } from '../../../hooks/useModules'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { completeDay, saveExerciseLog, undoComplete } from '../../../services/workoutService'
import { errorMessage } from '../../../utils/errors'
import { addDays, formatDate, toISODate } from '../../../utils/formatters'
import { dayLabel, exercisesLabel, startOfWeek, weekPosition } from '../../../utils/workoutDays'
import styles from '../client.module.css'
import { useMyExerciseLogs, useMyWeekLogs, useMyWorkouts, useStudentId } from '../useStudent'
import ExerciseRow from './ExerciseRow'
import RestTimer from './RestTimer'

// gráfico (Recharts) só carrega quando o aluno abre a evolução
const EvolucaoModal = lazy(() => import('./EvolucaoModal'))

const todayDow = () => new Date().getDay()

/** Data (nesta semana) em que cai o dia da ficha */
const dateOfWeekday = (dia) => (dia == null ? null : addDays(startOfWeek(), weekPosition(dia)))

/** Marcar exercício / anotar carga com atualização imediata da tela */
function useExerciseLog() {
  const { studentId } = useStudentId()
  const queryClient = useQueryClient()
  const toast = useToast()
  const key = ['my-exercise-logs', studentId]

  return async ({ workout, item, ...patch }) => {
    const data = toISODate()
    const previous = queryClient.getQueryData(key)
    queryClient.setQueryData(key, (rows = []) => {
      const i = rows.findIndex((r) => r.workout_exercise_id === item.id && r.data === data)
      if (i >= 0) return rows.map((r, j) => (j === i ? { ...r, ...patch } : r))
      return [{ id: `tmp-${item.id}`, workout_exercise_id: item.id, exercise_id: item.exercise_id, data, feito: false, carga: null, ...patch }, ...rows]
    })
    try {
      await saveExerciseLog({ workout, item, data, ...patch })
      queryClient.invalidateQueries({ queryKey: key })
      return true
    } catch (err) {
      queryClient.setQueryData(key, previous)
      toast.error(errorMessage(err))
      return false
    }
  }
}

function DayCard({ workout, day, log, defaultOpen, exLogs, onRest, onEvolucao }) {
  const videos = useModules().has('videos')
  const [open, setOpen] = useState(defaultOpen)
  const [video, setVideo] = useState(null)
  const queryClient = useQueryClient()
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['my-workout-logs'] })
    queryClient.invalidateQueries({ queryKey: ['my-progress'] })
  }
  const isToday = day.dia_semana === todayDow()
  const date = dateOfWeekday(day.dia_semana)
  const saveLog = useExerciseLog()

  const done = useMutationToast(() => completeDay(workout, day.id), { success: 'Treino concluído! Bom trabalho 💪', onSuccess: refresh })
  const undo = useMutationToast(() => undoComplete(log.id), { success: 'Marcação desfeita', onSuccess: refresh })

  const today = toISODate()
  const todayOf = (item) => exLogs.find((l) => l.workout_exercise_id === item.id && l.data === today)
  // última carga anotada antes de hoje (logs vêm do mais recente para o mais antigo)
  const lastCargaOf = (item) => exLogs.find((l) => l.exercise_id === item.exercise_id && l.data < today && l.carga !== null)?.carga ?? null
  const feitos = day.items.filter((it) => todayOf(it)?.feito).length

  const toggle = async (item, feito) => {
    const ok = await saveLog({ workout, item, feito })
    // último exercício marcado: conclui o dia automaticamente
    if (ok && feito && !log && feitos + 1 === day.items.length) done.mutate()
  }

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
          {feitos > 0 && !log && (
            <p className={styles.muted} style={{ margin: '0 0 4px' }}>
              {feitos} de {day.items.length} exercícios feitos hoje
            </p>
          )}
          <div>
            {day.items.map((it, i) => {
              const tl = todayOf(it)
              return (
                <ExerciseRow
                  key={`${it.id}-${tl?.carga ?? ''}`}
                  item={it}
                  index={i}
                  todayLog={tl}
                  lastCarga={lastCargaOf(it)}
                  showVideo={videos}
                  onToggle={(feito) => toggle(it, feito)}
                  onCarga={(carga) => saveLog({ workout, item: it, carga })}
                  onRest={onRest}
                  onEvolucao={() => onEvolucao({ id: it.exercise_id, nome: it.exercise?.nome })}
                  onVideo={() => setVideo(it.exercise)}
                />
              )
            })}
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

function WeekPlan({ workout, logs, exLogs, onRest, onEvolucao }) {
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
        <DayCard
          key={day.id}
          workout={workout}
          day={day}
          log={doneByDay.get(day.id)}
          defaultOpen={day.id === openId}
          exLogs={exLogs}
          onRest={onRest}
          onEvolucao={onEvolucao}
        />
      ))}
    </div>
  )
}

export default function Treinos() {
  const workouts = useMyWorkouts()
  const logs = useMyWeekLogs()
  const exLogs = useMyExerciseLogs()
  const [timer, setTimer] = useState(null)
  const [evolucao, setEvolucao] = useState(null)
  const [selected, setSelected] = useState(null)

  if (workouts.isError) return <QueryError error={workouts.error} onRetry={workouts.refetch} />

  const list = (workouts.data ?? []).filter((w) => w.days.length)
  const current = list.find((w) => w.id === selected) ?? list[0]

  return (
    <>
      <PageHeader title="Meus treinos" subtitle="Marque cada exercício, anote a carga e acompanhe sua evolução." />
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
          <WeekPlan
            key={current.id}
            workout={current}
            logs={logs.data ?? []}
            exLogs={exLogs.data ?? []}
            onRest={(seconds, label) => setTimer({ seconds, label, key: Date.now() })}
            onEvolucao={setEvolucao}
          />
        </>
      )}
      {timer && <RestTimer key={timer.key} seconds={timer.seconds} label={timer.label} onClose={() => setTimer(null)} />}
      {evolucao && (
        <Suspense fallback={null}>
          <EvolucaoModal exercise={evolucao} logs={exLogs.data ?? []} onClose={() => setEvolucao(null)} />
        </Suspense>
      )}
    </>
  )
}
