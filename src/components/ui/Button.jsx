import { Link } from 'react-router-dom'
import styles from './Button.module.css'
import Spinner from './Spinner'

/**
 * @param {object} props
 * @param {'primary'|'secondary'|'outline'|'ghost'|'danger'} [props.variant]
 * @param {'sm'|'md'|'lg'} [props.size]
 * @param {boolean} [props.loading]
 * @param {boolean} [props.block]
 * @param {import('react').ComponentType<any>} [props.icon] ícone Lucide
 * @param {string} [props.to] renderiza como Link
 * @param {string} [props.href] link externo (renderiza como <a>)
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  block = false,
  icon: Icon,
  to,
  href,
  children,
  className = '',
  disabled,
  type = 'button',
  ...rest
}) {
  const classes = [
    styles.button,
    styles[variant],
    styles[size],
    block ? styles.block : '',
    !children ? styles.iconOnly : '',
    className,
  ].join(' ')

  const content = (
    <>
      {loading ? <Spinner size={16} /> : Icon ? <Icon size={size === 'sm' ? 15 : 17} aria-hidden /> : null}
      {children && <span>{children}</span>}
    </>
  )

  if (href) {
    return (
      <a href={href} className={classes} {...rest}>
        {content}
      </a>
    )
  }

  if (to) {
    return (
      <Link to={to} className={classes} {...rest}>
        {content}
      </Link>
    )
  }

  return (
    <button type={type} className={classes} disabled={disabled || loading} {...rest}>
      {content}
    </button>
  )
}
