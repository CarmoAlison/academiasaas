import { createTenantCrud } from './crudFactory'
import { supabase, unwrap } from './supabaseClient'

const SELECT = `
  id, academy_id, nome, descricao, professor_id, unit_id, horario, duracao_min, capacidade, dias_semana, ativo,
  professor:profiles!classes_professor_id_fkey(id, nome),
  unit:units(id, nome)
`

const crud = createTenantCrud('classes', { select: SELECT, orderBy: 'horario' })

export const classService = {
  ...crud,

  /** Reservas de uma aula num dia (visão da academia) */
  bookings: (classId, data) =>
    unwrap(
      supabase
        .from('class_bookings')
        .select('id, status, data, student:students(id, profile:profiles(nome, telefone))')
        .eq('class_id', classId)
        .eq('data', data)
        .neq('status', 'cancelado')
        .order('created_at'),
    ),

  setBookingStatus: (id, status) => unwrap(supabase.from('class_bookings').update({ status }).eq('id', id)),

  /** @returns {Promise<Array<{class_id: string, data: string, total: number}>>} */
  occupancy: (academyId, inicio, fim) =>
    unwrap(supabase.rpc('class_occupancy', { p_academy: academyId, p_inicio: inicio, p_fim: fim })),

  book: (classId, data) => unwrap(supabase.rpc('book_class', { p_class_id: classId, p_data: data })),

  cancel: (bookingId) => unwrap(supabase.rpc('cancel_booking', { p_booking_id: bookingId })),

  /** Reservas do aluno logado num período */
  myBookings: (studentId, inicio, fim) =>
    unwrap(
      supabase
        .from('class_bookings')
        .select('id, class_id, data, status')
        .eq('student_id', studentId)
        .gte('data', inicio)
        .lte('data', fim),
    ),
}
