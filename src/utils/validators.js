import { onlyDigits } from './formatters'

/** Valida CPF (dígitos verificadores) */
export function isValidCPF(value) {
  const cpf = onlyDigits(value)
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false
  const calc = (len) => {
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i)
    const rest = (sum * 10) % 11
    return rest === 10 ? 0 : rest
  }
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10])
}

/** Valida CNPJ (dígitos verificadores) */
export function isValidCNPJ(value) {
  const cnpj = onlyDigits(value)
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false
  const calc = (len) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const sum = weights.reduce((acc, w, i) => acc + Number(cnpj[i]) * w, 0)
    const rest = sum % 11
    return rest < 2 ? 0 : 11 - rest
  }
  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13])
}

export const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''))

/**
 * Validadores compostos para useForm.
 * Cada regra recebe (valor, valores) e retorna mensagem de erro ou undefined.
 */
export const rules = {
  required: (msg = 'Campo obrigatório') => (v) =>
    v === undefined || v === null || String(v).trim() === '' || (Array.isArray(v) && !v.length) ? msg : undefined,
  cpf: (msg = 'CPF inválido') => (v) => (v && !isValidCPF(v) ? msg : undefined),
  cnpj: (msg = 'CNPJ inválido') => (v) => (v && !isValidCNPJ(v) ? msg : undefined),
  email: (msg = 'E-mail inválido') => (v) => (v && !isEmail(v) ? msg : undefined),
  minLength: (n, msg) => (v) => (v && String(v).length < n ? msg || `Mínimo de ${n} caracteres` : undefined),
  min: (n, msg) => (v) => (v !== '' && v !== null && v !== undefined && Number(v) < n ? msg || `Valor mínimo: ${n}` : undefined),
}

/** Aplica um mapa { campo: [regras] } sobre os valores */
export function validate(values, schema) {
  const errors = {}
  for (const [field, fieldRules] of Object.entries(schema)) {
    for (const rule of fieldRules) {
      const error = rule(values[field], values)
      if (error) {
        errors[field] = error
        break
      }
    }
  }
  return errors
}
