import { useQuery } from '@tanstack/react-query'
import { useTenant } from '../../hooks/useAuth'
import { classService } from '../../services/classService'
import { listStudentPayments } from '../../services/paymentService'
import { getMyStudent } from '../../services/studentService'
import { listStudentWorkouts, listWorkoutLogs } from '../../services/workoutService'
import { addDays, toISODate } from '../../utils/formatters'

/** Segunda-feira da semana de `date` */
export function weekStart(date = new Date()) {
  const d = new Date(date)
  const diff = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - diff)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Dados do aluno logado (área /client) */
export function useStudentId() {
  const { membership, academyId } = useTenant()
  return { studentId: membership?.student_id, academyId }
}

export function useMyStudent() {
  const { studentId } = useStudentId()
  return useQuery({ queryKey: ['my-student', studentId], queryFn: () => getMyStudent(studentId), enabled: Boolean(studentId) })
}

export function useMyWorkouts() {
  const { studentId } = useStudentId()
  return useQuery({ queryKey: ['my-workouts', studentId], queryFn: () => listStudentWorkouts(studentId), enabled: Boolean(studentId) })
}

export function useMyWorkoutLogs() {
  const { studentId } = useStudentId()
  return useQuery({ queryKey: ['my-workout-logs', studentId], queryFn: () => listWorkoutLogs(studentId), enabled: Boolean(studentId) })
}

export function useMyPayments() {
  const { studentId } = useStudentId()
  return useQuery({ queryKey: ['my-payments', studentId], queryFn: () => listStudentPayments(studentId), enabled: Boolean(studentId) })
}

/** Aulas, lotação e minhas reservas de uma semana */
export function useWeekSchedule(start) {
  const { studentId, academyId } = useStudentId()
  const inicio = toISODate(start)
  const fim = toISODate(addDays(start, 6))

  const classes = useQuery({ queryKey: ['classes', academyId], queryFn: () => classService.list(academyId), enabled: Boolean(academyId) })
  const occupancy = useQuery({
    queryKey: ['class-occupancy', academyId, inicio, fim],
    queryFn: () => classService.occupancy(academyId, inicio, fim),
    enabled: Boolean(academyId),
  })
  const bookings = useQuery({
    queryKey: ['my-bookings', studentId, inicio],
    queryFn: () => classService.myBookings(studentId, inicio, fim),
    enabled: Boolean(studentId),
  })

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i)
    const iso = toISODate(date)
    const items = (classes.data ?? [])
      .filter((c) => c.ativo && c.dias_semana.includes(date.getDay()))
      .map((c) => ({
        ...c,
        data: iso,
        ocupadas: occupancy.data?.find((o) => o.class_id === c.id && o.data === iso)?.total ?? 0,
        booking: bookings.data?.find((b) => b.class_id === c.id && b.data === iso && b.status !== 'cancelado') ?? null,
      }))
      .sort((a, b) => a.horario.localeCompare(b.horario))
    return { date, iso, items }
  })

  return {
    days,
    isPending: classes.isPending || occupancy.isPending || bookings.isPending,
    error: classes.error || occupancy.error || bookings.error,
    refetch: () => Promise.all([classes.refetch(), occupancy.refetch(), bookings.refetch()]),
  }
}
