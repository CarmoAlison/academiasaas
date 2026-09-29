import { Field, fieldStyles as styles, useFieldId } from './Field'

/**
 * @param {object} props
 * @param {string} [props.label]
 * @param {string} [props.error]
 * @param {string} [props.hint]
 * @param {import('react').ComponentType<any>} [props.icon]
 * @param {import('react').ReactNode} [props.suffix] elemento à direita (ex.: botão mostrar senha)
 */
export default function Input({ label, error, hint, icon: Icon, suffix, required, id, className = '', ...rest }) {
  const inputId = useFieldId(id)
  return (
    <Field label={label} error={error} hint={hint} required={required} id={inputId} className={className}>
      <div className={styles.control}>
        {Icon && <Icon size={16} className={styles.icon} aria-hidden />}
        <input
          id={inputId}
          className={`${styles.input} ${Icon ? styles.withIcon : ''} ${suffix ? styles.withSuffix : ''}`}
          aria-invalid={Boolean(error)}
          required={required}
          {...rest}
        />
        {suffix && <div className={styles.suffix}>{suffix}</div>}
      </div>
    </Field>
  )
}
