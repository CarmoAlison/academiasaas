import styles from './Toggle.module.css'

/**
 * @param {{ label?: import('react').ReactNode, checked: boolean, onChange: (checked: boolean) => void, disabled?: boolean }} props
 */
export default function Switch({ label, checked, onChange, disabled }) {
  return (
    <label className={`${styles.wrapper} ${disabled ? styles.disabled : ''}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className={`${styles.switch} ${checked ? styles.on : ''}`}
        onClick={() => onChange?.(!checked)}
      >
        <span className={styles.thumb} />
      </button>
      {label && <span>{label}</span>}
    </label>
  )
}
