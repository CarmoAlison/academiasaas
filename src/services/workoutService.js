import { sortDays } from '../utils/workoutDays'
import { nowISO, supabase, unwrap } from './supabaseClient'

const SELECT = `
  id, academy_id, student_id, professor_id, nome, objetivo, data_inicio, data_fim, ativo, created_at,
  student:students(id, profile:profiles(nome)),
  professor:profiles!workouts_professor_id_fkey(id, nome)
`

const ITEMS = `
  id, exercise_id, series, repeticoes, carga, descanso, ordem,
  exercise:exercises(id, nome, grupo_muscular, video_url, instrucoes)
`

const DAYS = `days:workout_days(id, dia_semana, nome, ordem, items:workout_exercises(${ITEMS}))`

/** Ordena dias (seg→dom) e os exercícios de cada dia */
const normalize = (w) => ({
  ...w,
  days: sortDays(w.days ?? []).map((d) => ({ ...d, items: [...(d.items ?? [])].sort((a, b) => a.ordem - b.ordem) })),
})

export async function listWorkouts(academyId) {
  const rows = await unwrap(
    supabase
      .from('workouts')
      .select(`${SELECT}, days:workout_days(id, dia_semana, nome, ordem)`)
      .eq('academy_id', academyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  )
  return rows.map((w) => ({ ...w, days: sortDays(w.days ?? []) }))
}

/** Ficha completa: treino + dias + exercícios de cada dia */
export async function getWorkout(id) {
  const workout = await unwrap(supabase.from('workouts').select(`${SELECT}, ${DAYS}`).eq('id', id).is('deleted_at', null).single())
  return normalize(workout)
}

/**
 * Cria/atualiza a ficha semanal inteira em uma única transação (RPC save_workout).
 * @param {string} academyId
 * @param {string|null} id
 * @param {object} workout dados do treino (aluno, nome, objetivo, período…)
 * @param {Array<{ id?: string, dia_semana: number|null, nome?: string, items: Array<{exercise_id: string, series?: string, repeticoes?: string, carga?: string, descanso?: string}> }>} days
 * @returns {Promise<string>} id do treino
 */
export const saveWorkout = (academyId, id, workout, days) =>
  unwrap(
    supabase.rpc('save_workout', {
      p_academy: academyId,
      p_workout_id: id ?? null,
      p_workout: {
        student_id: workout.student_id,
        professor_id: workout.professor_id || null,
        nome: workout.nome,
        objetivo: workout.objetivo || null,
        data_inicio: workout.data_inicio || null,
        data_fim: workout.data_fim || null,
        ativo: workout.ativo ?? true,
      },
      p_days: days.map((d) => ({
        id: d.id ?? null,
        dia_semana: d.dia_semana,
        nome: d.nome || null,
        items: d.items
          .filter((it) => it.exercise_id)
          .map((it) => ({
            exercise_id: it.exercise_id,
            series: it.series === '' || it.series == null ? null : String(it.series),
            repeticoes: it.repeticoes || null,
            carga: it.carga || null,
            descanso: it.descanso || null,
          })),
      })),
    }),
  )

export const removeWorkout = (id) =>
  unwrap(supabase.from('workouts').update({ deleted_at: nowISO(), ativo: false }).eq('id', id))

// --- Área do aluno ----------------------------------------------------

/** Fichas ativas do aluno com os dias e exercícios */
export async function listStudentWorkouts(studentId) {
  const workouts = await unwrap(
    supabase
      .from('workouts')
      .select(`${SELECT}, ${DAYS}`)
      .eq('student_id', studentId)
      .eq('ativo', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  )
  return workouts.map(normalize)
}

/** Conclusões do aluno a partir de uma data (ex.: início da semana) */
export const listWorkoutLogs = (studentId, since) => {
  let query = supabase
    .from('workout_logs')
    .select('id, workout_id, day_id, concluido_em')
    .eq('student_id', studentId)
    .order('concluido_em', { ascending: false })
  if (since) query = query.gte('concluido_em', since)
  return unwrap(query.limit(200))
}

/** Marca um dia da ficha como concluído */
export const completeDay = (workout, dayId) =>
  unwrap(
    supabase.from('workout_logs').insert({
      academy_id: workout.academy_id,
      workout_id: workout.id,
      student_id: workout.student_id,
      day_id: dayId,
    }),
  )

/** Desfaz a marcação de concluído */
export const undoComplete = (logId) => unwrap(supabase.from('workout_logs').delete().eq('id', logId))
