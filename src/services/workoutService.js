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

export const listWorkouts = (academyId) =>
  unwrap(
    supabase
      .from('workouts')
      .select(SELECT)
      .eq('academy_id', academyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  )

export async function getWorkout(id) {
  const workout = await unwrap(supabase.from('workouts').select(SELECT).eq('id', id).is('deleted_at', null).single())
  const items = await unwrap(supabase.from('workout_exercises').select(ITEMS).eq('workout_id', id).order('ordem'))
  return { ...workout, items }
}

/**
 * Cria/atualiza treino e substitui a lista de exercícios
 * @param {string} academyId
 * @param {string|null} id
 * @param {object} workout
 * @param {Array<{exercise_id: string, series?: number, repeticoes?: string, carga?: string, descanso?: string}>} items
 */
export async function saveWorkout(academyId, id, workout, items) {
  const payload = {
    student_id: workout.student_id,
    professor_id: workout.professor_id || null,
    nome: workout.nome,
    objetivo: workout.objetivo || null,
    data_inicio: workout.data_inicio || null,
    data_fim: workout.data_fim || null,
    ativo: workout.ativo ?? true,
  }

  let workoutId = id
  if (id) {
    await unwrap(supabase.from('workouts').update(payload).eq('id', id))
    await unwrap(supabase.from('workout_exercises').delete().eq('workout_id', id))
  } else {
    const created = await unwrap(
      supabase.from('workouts').insert({ ...payload, academy_id: academyId }).select('id').single(),
    )
    workoutId = created.id
  }

  const rows = items
    .filter((it) => it.exercise_id)
    .map((it, index) => ({
      academy_id: academyId,
      workout_id: workoutId,
      exercise_id: it.exercise_id,
      series: it.series ? Number(it.series) : null,
      repeticoes: it.repeticoes || null,
      carga: it.carga || null,
      descanso: it.descanso || null,
      ordem: index,
    }))
  if (rows.length) await unwrap(supabase.from('workout_exercises').insert(rows))
  return workoutId
}

export const removeWorkout = (id) =>
  unwrap(supabase.from('workouts').update({ deleted_at: nowISO(), ativo: false }).eq('id', id))

// --- Área do aluno ----------------------------------------------------

/** Treinos ativos do aluno com exercícios */
export async function listStudentWorkouts(studentId) {
  const workouts = await unwrap(
    supabase
      .from('workouts')
      .select(`${SELECT}, items:workout_exercises(${ITEMS})`)
      .eq('student_id', studentId)
      .eq('ativo', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  )
  return workouts.map((w) => ({ ...w, items: [...(w.items ?? [])].sort((a, b) => a.ordem - b.ordem) }))
}

export const listWorkoutLogs = (studentId, limit = 30) =>
  unwrap(
    supabase
      .from('workout_logs')
      .select('id, workout_id, concluido_em')
      .eq('student_id', studentId)
      .order('concluido_em', { ascending: false })
      .limit(limit),
  )

/** Marca treino como concluído hoje */
export const completeWorkout = (workout) =>
  unwrap(
    supabase.from('workout_logs').insert({
      academy_id: workout.academy_id,
      workout_id: workout.id,
      student_id: workout.student_id,
    }),
  )
