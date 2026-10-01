import { useQuery } from '@tanstack/react-query'
import { useTenant } from '../../hooks/useAuth'
import { getAcademySettings } from '../../services/academySettingsService'
import { classService } from '../../services/classService'
import { staffNames } from '../../services/roleService'
import { listStudentPayments } from '../../services/paymentService'
import { getMyStudent } from '../../services/studentService'
import { listStudentWorkouts, listWorkoutLogs } from '../../services/workoutService'
import { addDays, toISODate } from '../../utils/formatters'
import { startOfWeek } from '../../utils/workoutDays'

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

/** Conclusões da semana atual (segunda 00:00 em diante) */
export function useMyWeekLogs() {
  const { studentId } = useStudentId()
  const since = startOfWeek().toISOString()
  return useQuery({
    queryKey: ['my-workout-logs', studentId, since],
    queryFn: () => listWorkoutLogs(studentId, since),
    enabled: Boolean(studentId),
  })
}

export function useMyPayments() {
  const { studentId } = useStudentId()
  return useQuery({ queryKey: ['my-payments', studentId], queryFn: () => listStudentPayments(studentId), enabled: Boolean(studentId) })
}

/**
 * Situação financeira do aluno: mensalidades vencidas além da tolerância da academia.
 * @returns {{ inadimplente: boolean, atrasadas: object[], total: number, bloqueiaReservas: boolean, tolerancia: number }}
 */
export function useMyDelinquency() {
  const { academyId } = useStudentId()
  const payments = useMyPayments()
  const settings = useQuery({
    queryKey: ['academy-settings', academyId],
    queryFn: () => getAcademySettings(academyId),
    enabled: Boolean(academyId),
  })
  const tolerancia = settings.data?.dias_tolerancia ?? 5
  const limite = toISODate(addDays(new Date(), -tolerancia))
  const atrasadas = (payments.data ?? []).filter((p) => p.status === 'pendente' && p.vencimento < limite)
  return {
    inadimplente: atrasadas.length > 0,
    atrasadas,
    total: atrasadas.reduce((acc, p) => acc + Number(p.valor), 0),
    bloqueiaReservas: settings.data?.bloquear_reservas_inadimplente ?? true,
    tolerancia,
  }
}

/** Aulas, lotação e minhas reservas de uma semana */
export function useWeekSchedule(start) {
  const { studentId, academyId } = useStudentId()
  const inicio = toISODate(start)
  const fim = toISODate(addDays(start, 6))

  const classes = useQuery({
    queryKey: ['classes', academyId, 'aluno'],
    queryFn: async () => {
      const list = await classService.list(academyId)
      // o aluno não lê cadastros da equipe: o nome do professor vem de staff_names()
      const names = await staffNames(list.map((c) => c.professor_id))
      return list.map((c) => ({ ...c, professor_nome: names[c.professor_id] ?? c.professor?.nome ?? null }))
    },
    enabled: Boolean(academyId),
  })
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
