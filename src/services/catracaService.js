import { supabase, unwrap } from './supabaseClient'

/** Colunas que o Super Admin pode ler (token e senha nunca saem pela API) */
const DEVICE_COLUMNS =
  'id, academy_id, unit_id, nome, sentido, modelo, leitor, metodos, numero_serie, firmware, hw_device_id, ip_interno, painel_usuario, ligacao, outro_sistema, rostos_existentes, observacoes, acao_liberar, direcao, token_inicio, ativo, ultimo_sinal, ultima_rota, created_at'

/** Endereço que vai no aparelho (modo online e push) */
export const catracaUrl = (token) => `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/catraca/${token}`

/** Catraca "online" = falou com o sistema nos últimos 2 minutos (o push chama a cada poucos segundos) */
export const isOnline = (ultimoSinal) => Boolean(ultimoSinal) && Date.now() - new Date(ultimoSinal).getTime() < 2 * 60 * 1000

// ---- Super Admin -------------------------------------------------------

export const listCatracas = (academyId) =>
  unwrap(supabase.from('catraca_devices').select(DEVICE_COLUMNS).eq('academy_id', academyId).order('created_at'))

/** @returns {Promise<{ id: string, token: string|null }>} token só na criação */
export const saveCatraca = (id, academyId, dados, senha) =>
  unwrap(supabase.rpc('catraca_device_save', { p_id: id ?? null, p_academy: academyId, p_dados: dados, p_senha: senha ?? null }))

export const novoTokenCatraca = (id) => unwrap(supabase.rpc('catraca_device_novo_token', { p_id: id }))
export const verSenhaCatraca = (id) => unwrap(supabase.rpc('catraca_device_senha', { p_id: id }))
export const setCatracaAtiva = (id, ativo) => unwrap(supabase.rpc('catraca_device_ativo', { p_id: id, p_ativo: ativo }))
export const excluirCatraca = (id) => unwrap(supabase.rpc('catraca_device_excluir', { p_id: id }))
export const sincronizarCatraca = (id) => unwrap(supabase.rpc('catraca_sincronizar', { p_id: id }))
export const listEquipamentos = () => unwrap(supabase.rpc('catraca_equipamentos'))

/** Últimos comandos enviados à catraca (suporte) */
export const listComandos = (deviceId) =>
  unwrap(
    supabase
      .from('catraca_comandos')
      .select('id, tipo, status, tentativas, resposta, created_at, concluido_em')
      .eq('device_id', deviceId)
      .order('id', { ascending: false })
      .limit(30),
  )

// ---- Academia ----------------------------------------------------------

/** Catracas da academia, só com nome (sem dados técnicos) */
export const listCatracasAcademia = (academyId) => unwrap(supabase.rpc('catraca_lista_academia', { p_academy: academyId }))

export const liberarCatraca = (deviceId, motivo) => unwrap(supabase.rpc('catraca_liberar', { p_device: deviceId, p_motivo: motivo }))

/** Acessos (quem entrou / quem foi bloqueado) */
export function listAcessos(academyId, { resultado, de, deviceId } = {}) {
  let q = supabase
    .from('catraca_acessos')
    .select('id, device_id, student_id, nome, resultado, motivo, metodo, por_nome, created_at')
    .eq('academy_id', academyId)
    .order('id', { ascending: false })
    .limit(500)
  if (resultado) q = q.eq('resultado', resultado)
  if (de) q = q.gte('created_at', de)
  if (deviceId) q = q.eq('device_id', deviceId)
  return unwrap(q)
}

/** Situação do rosto do aluno na catraca */
export const faceStatus = (studentId) =>
  unwrap(supabase.from('catraca_usuarios').select('face_status, face_erro, face_em').eq('student_id', studentId).maybeSingle())

/** Envia a foto (já reduzida) e manda cadastrar o rosto em todas as catracas da academia */
export async function cadastrarRosto(academyId, studentId, blob) {
  const path = `${academyId}/${studentId}-${Date.now()}.jpg`
  await unwrap(supabase.storage.from('catraca-faces').upload(path, blob, { contentType: 'image/jpeg', upsert: false }))
  await unwrap(supabase.rpc('catraca_cadastrar_rosto', { p_student: studentId, p_foto_path: path }))
}
