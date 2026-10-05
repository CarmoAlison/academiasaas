import { Field, fieldStyles as styles, useFieldId } from './Field'

/**
 * @param {object} props
 * @param {{ value: string|number, label: string, disabled?: boolean }[]} props.options
 * @param {string} [props.placeholder] opção vazia
 */
export default function Select({ label, error, hint, options = [], placeholder, required, id, className = '', ...rest }) {
  const selectId = useFieldId(id)
  return (
    <Field label={label} error={error} hint={hint} required={required} id={selectId} className={className}>
      <select
        id={selectId}
        className={`${styles.input} ${styles.select}`}
        aria-invalid={Boolean(error)}
        required={required}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
    </Field>
  )
}
