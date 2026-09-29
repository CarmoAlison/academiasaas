import styles from './Toggle.module.css'

/**
 * @param {{ label?: import('react').ReactNode, checked: boolean, onChange: (checked: boolean) => void, disabled?: boolean, indeterminate?: boolean }} props
 */
export default function Checkbox({ label, checked, onChange, disabled, indeterminate, ...rest }) {
  return (
    <label className={`${styles.wrapper} ${disabled ? styles.disabled : ''}`}>
      <input
        type="checkbox"
        className={styles.checkbox}
        checked={checked}
        disabled={disabled}
        ref={(el) => {
          if (el) el.indeterminate = Boolean(indeterminate)
        }}
        onChange={(e) => onChange?.(e.target.checked)}
        {...rest}
      />
      {label && <span>{label}</span>}
    </label>
  )
}
