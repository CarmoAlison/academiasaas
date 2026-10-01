import { supabase, unwrap } from './supabaseClient'

const FIELDS = 'id, titulo, status, hash, created_at, aceito_em, aceite_ip, aceite_nome'

/** Contratos de um aluno (mais recentes primeiro) */
export const listStudentContracts = (studentId) =>
  unwrap(supabase.from('contracts').select(FIELDS).eq('student_id', studentId).order('created_at', { ascending: false }).limit(20))

/** Gera (ou reenvia) o contrato a partir do modelo da academia */
export const issueContract = (studentId) => unwrap(supabase.rpc('issue_contract', { p_student: studentId }))

export const cancelContract = (contractId) => unwrap(supabase.rpc('cancel_contract', { p_contract: contractId }))

/** Aceite eletrônico pelo aluno logado */
export const acceptContract = (contractId) =>
  unwrap(supabase.rpc('accept_contract', { p_contract: contractId, p_user_agent: navigator.userAgent }))

/** Dados completos (contrato, aluno, academia, personalização do recibo) */
export const getContract = (contractId) => unwrap(supabase.rpc('get_contract', { p_contract: contractId }))

export const defaultContractText = () => unwrap(supabase.rpc('default_contract_text'))

export const CONTRACT_VARIABLES = ['nome', 'cpf', 'plano', 'valor', 'duracao', 'academia', 'cnpj', 'cidade', 'data']
