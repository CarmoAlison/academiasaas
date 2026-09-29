/** Traduz erros do Supabase/Postgres para mensagens amigáveis */
export function errorMessage(error) {
  if (!error) return 'Erro desconhecido'
  const msg = error.message || String(error)
  if (/Invalid login credentials/i.test(msg)) return 'CPF ou senha incorretos'
  if (error.code === '23505' || /duplicate key/i.test(msg)) {
    return /CPF/i.test(msg) ? msg : 'Registro duplicado — já existe um item com esses dados'
  }
  if (/row-level security|permission denied/i.test(msg)) return 'Você não tem permissão para esta ação'
  if (error.code === '23503') return 'Este registro está vinculado a outros dados'
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Falha de conexão. Verifique sua internet.'
  return msg
}
