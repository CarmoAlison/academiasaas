import { Field, fieldStyles as styles, useFieldId } from './Field'

export default function Textarea({ label, error, hint, required, id, className = '', rows = 3, ...rest }) {
  const textareaId = useFieldId(id)
  return (
    <Field label={label} error={error} hint={hint} required={required} id={textareaId} className={className}>
      <textarea
        id={textareaId}
        rows={rows}
        className={`${styles.input} ${styles.textarea}`}
        aria-invalid={Boolean(error)}
        required={required}
        {...rest}
      />
    </Field>
  )
}
