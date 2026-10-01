import { applySearch } from './paging'
import { supabase, unwrap } from './supabaseClient'

const SELECT = 'id, student_id, origem, created_at, student:students(id, profile:profiles(nome, telefone, avatar_url))'

/** Código atual do QR da recepção: { codigo, expira_em (segundos) } */
export const checkinQr = (academyId) => unwrap(supabase.rpc('checkin_qr', { p_academy: academyId }))

/** Gera um novo segredo: QR Codes antigos (fotografados) deixam de valer */
export const resetCheckinQr = (academyId) => unwrap(supabase.rpc('reset_checkin_qr', { p_academy: academyId }))

/** Link que vai dentro do QR (aberto pela câmera do celular do aluno) */
export const checkinUrl = (academyId, codigo) =>
  `${window.location.origin}/client/checkin?a=${encodeURIComponent(academyId)}&c=${encodeURIComponent(codigo)}`

/** Check-in do aluno logado: { id, repetido, em, inadimplente } */
export const doCheckin = (academyId, codigo) => unwrap(supabase.rpc('do_checkin', { p_academy: academyId, p_codigo: codigo }))

export const manualCheckin = (studentId) => unwrap(supabase.rpc('manual_checkin', { p_student: studentId }))

export const removeCheckin = (id) => unwrap(supabase.from('checkins').delete().eq('id', id))

/** Check-ins da academia num intervalo [de, ate) (ISO) */
export const listCheckins = (academyId, de, ate) =>
  unwrap(
    supabase
      .from('checkins')
      .select(SELECT)
      .eq('academy_id', academyId)
      .gte('created_at', de)
      .lt('created_at', ate)
      .order('created_at', { ascending: false })
      .limit(500),
  )

/** Histórico de um aluno (mais recentes primeiro) */
export const listStudentCheckins = (studentId, limit = 60) =>
  unwrap(
    supabase
      .from('checkins')
      .select('id, origem, created_at')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(limit),
  )

/** Alunos ativos sem check-in há `dias` (padrão: configuração da academia) */
export const absentStudents = (academyId, dias = null) =>
  unwrap(supabase.rpc('absent_students', { p_academy: academyId, p_dias: dias }))

/** Busca rápida de alunos ativos para o check-in manual */
export function searchActiveStudents(academyId, term) {
  const query = supabase
    .from('v_students')
    .select('id, nome, cpf, avatar_url, inadimplente')
    .eq('academy_id', academyId)
    .eq('status', 'ativo')
    .order('nome')
    .limit(8)
  return unwrap(applySearch(query, term, { text: ['nome'], digits: ['cpf'] }))
}
