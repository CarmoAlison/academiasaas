import styles from './Badge.module.css'

/**
 * @param {{ tone?: 'success'|'warning'|'danger'|'info'|'neutral', children: any }} props
 */
export default function Badge({ tone = 'neutral', children }) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>
}

const STATUS_TONES = {
  ativo: ['success', 'Ativo'],
  ativa: ['success', 'Ativa'],
  inativo: ['neutral', 'Inativo'],
  inativa: ['neutral', 'Inativa'],
  trancado: ['warning', 'Trancado'],
  suspensa: ['warning', 'Suspensa'],
  pago: ['success', 'Pago'],
  pendente: ['warning', 'Pendente'],
  atrasado: ['danger', 'Atrasado'],
  cancelado: ['neutral', 'Cancelado'],
  reservado: ['info', 'Reservado'],
  presente: ['success', 'Presente'],
  falta: ['danger', 'Falta'],
  insert: ['success', 'Criação'],
  update: ['info', 'Alteração'],
  soft_delete: ['warning', 'Exclusão'],
  delete: ['danger', 'Exclusão definitiva'],
  login: ['success', 'Login'],
  logout: ['neutral', 'Logout'],
}

/** Badge padronizado a partir de um status do sistema */
export function StatusBadge({ status }) {
  const [tone, label] = STATUS_TONES[status] ?? ['neutral', status ?? '—']
  return <Badge tone={tone}>{label}</Badge>
}
