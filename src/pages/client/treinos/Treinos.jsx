import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ChevronDown, ChevronUp, Dumbbell, PlayCircle } from 'lucide-react'
import { useState } from 'react'
import QueryError from '../../../components/feedback/QueryError'
import { Badge, Button, EmptyState, PageHeader, SkeletonCard } from '../../../components/ui'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { completeWorkout } from '../../../services/workoutService'
import { formatDate, formatDateTime, toISODate } from '../../../utils/formatters'
import styles from '../client.module.css'
import { useMyWorkoutLogs, useMyWorkouts, useStudentId } from '../useStudent'

function WorkoutCard({ workout, logs, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen)
  const { studentId } = useStudentId()
  const queryClient = useQueryClient()
  const myLogs = logs.filter((l) => l.workout_id === workout.id)
  const doneToday = myLogs.some((l) => toISODate(new Date(l.concluido_em)) === toISODate())

  const mutation = useMutationToast(() => completeWorkout(workout), {
    success: 'Treino concluído! Bom trabalho 💪',
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-workout-logs', studentId] }),
  })

  return (
    <section className={styles.tile}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
        aria-expanded={open}
      >
        <span className={styles.dateBox}>
          <Dumbbell size={20} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ display: 'block', fontSize: 16 }}>{workout.nome}</strong>
          <span className={styles.muted}>
            {workout.items.length} exercícios{workout.objetivo ? ` · ${workout.objetivo}` : ''}
            {workout.data_fim ? ` · até ${formatDate(workout.data_fim)}` : ''}
          </span>
        </span>
        {doneToday && <Badge tone="success">Feito hoje</Badge>}
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      {open && (
        <>
          <div>
            {workout.items.map((it, i) => (
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
                    <a href={it.exercise.video_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
                      <PlayCircle size={16} /> Ver vídeo
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
          <Button icon={CheckCircle2} block size="lg" disabled={doneToday} loading={mutation.isPending} onClick={() => mutation.mutate()}>
            {doneToday ? 'Concluído hoje' : 'Marcar como concluído'}
          </Button>
          {myLogs.length > 0 && (
            <span className={styles.muted}>
              Concluído {myLogs.length}x · último em {formatDateTime(myLogs[0].concluido_em)}
            </span>
          )}
        </>
      )}
    </section>
  )
}

export default function Treinos() {
  const workouts = useMyWorkouts()
  const logs = useMyWorkoutLogs()

  if (workouts.isError) return <QueryError error={workouts.error} onRetry={workouts.refetch} />

  return (
    <>
      <PageHeader title="Meus treinos" subtitle="Toque em um treino para ver os exercícios" />
      {workouts.isPending ? (
        <div className={styles.stack}>
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : !workouts.data.length ? (
        <EmptyState icon={Dumbbell} title="Nenhum treino ativo" description="Seu professor ainda não cadastrou um treino para você." />
      ) : (
        <div className={styles.stack}>
          {workouts.data.map((w, i) => (
            <WorkoutCard key={w.id} workout={w} logs={logs.data ?? []} defaultOpen={i === 0} />
          ))}
        </div>
      )}
    </>
  )
}
