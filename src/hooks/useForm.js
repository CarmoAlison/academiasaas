import { useCallback, useState } from 'react'
import { MASKS } from '../utils/formatters'
import { validate } from '../utils/validators'

/**
 * Formulário controlado simples com validação.
 * @template T
 * @param {T} initialValues
 * @param {Record<string, Function[]>} [schema]
 */
export function useForm(initialValues, schema = {}) {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState({})

  const setValue = useCallback((name, value) => {
    setValues((prev) => ({ ...prev, [name]: value }))
    setErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev))
  }, [])

  /**
   * Props para Input/Select/Textarea: value, onChange, error.
   * @param {string} name
   * @param {{ mask?: keyof typeof MASKS }} [options]
   */
  const field = (name, options = {}) => ({
    name,
    value: values[name] ?? '',
    error: errors[name],
    onChange: (event) => {
      const raw = event?.target ? event.target.value : event
      setValue(name, options.mask ? MASKS[options.mask](raw) : raw)
    },
  })

  /** Valida e executa onValid(values) */
  const handleSubmit = (onValid) => (event) => {
    event?.preventDefault?.()
    const next = validate(values, schema)
    setErrors(next)
    if (Object.values(next).some(Boolean)) return
    return onValid(values)
  }

  const reset = useCallback((next) => {
    setValues(next)
    setErrors({})
  }, [])

  return { values, errors, setValue, setValues, setErrors, field, handleSubmit, reset }
}
