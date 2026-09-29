import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { getAuditLog } from '../../services/auditService'
import { AUDIT_TABLES } from '../../utils/constants'
import { formatDateTime } from '../../utils/formatters'
import QueryError from '../feedback/QueryError'
import { StatusBadge } from '../ui/Badge'
import Modal from '../ui/Modal'
import { SkeletonCard } from '../ui/Skeleton'
import Switch from '../ui/Switch'
import styles from './Audit.module.css'

const tableLabel = (t) => AUDIT_TABLES.find((x) => x.value === t)?.label ?? t

const show = (v) => {
  if (v === undefined) return <span className="text-muted">—</span>
  if (v === null) return <span className="text-muted">null</span>
  if (typeof v === 'object') return <pre>{JSON.stringify(v, null, 2)}</pre>
  return String(v)
}

/**
 * Modal com o diff antes/depois de um registro de auditoria
 * @param {{ logId: number|null, onClose: () => void }} props
 */
export default function AuditDiffModal({ logId, onClose }) {
  const [onlyChanged, setOnlyChanged] = useState(true)
  const query = useQuery({ queryKey: ['audit-log', logId], queryFn: () => getAuditLog(logId), enabled: Boolean(logId) })
  const log = query.data

  const rows = useMemo(() => {
    if (!log) return []
    const before = log.dados_antes ?? {}
    const after = log.dados_depois ?? {}
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
    return keys
      .map((key) => {
        const a = log.dados_antes ? before[key] : undefined
        const b = log.dados_depois ? after[key] : undefined
        return { key, a, b, changed: JSON.stringify(a) !== JSON.stringify(b) }
      })
      .filter((r) => !onlyChanged || r.changed || !['update', 'soft_delete'].includes(log.acao))
  }, [log, onlyChanged])

  return (
    <Modal open={Boolean(logId)} onClose={onClose} title="Detalhe do evento" size="lg">
      {query.isPending ? (
        <SkeletonCard lines={6} />
      ) : query.isError ? (
        <QueryError error={query.error} onRetry={query.refetch} />
      ) : (
        <>
          <dl className={styles.meta}>
            <div>
              <dt>Data</dt>
              <dd>{formatDateTime(log.created_at)}</dd>
            </div>
            <div>
              <dt>Ação</dt>
              <dd>
                <StatusBadge status={log.acao} />
              </dd>
            </div>
            <div>
              <dt>Tabela</dt>
              <dd>{tableLabel(log.tabela)}</dd>
            </div>
            <div>
              <dt>Usuário</dt>
              <dd>{log.user_nome ?? 'Sistema'}</dd>
            </div>
            <div>
              <dt>IP</dt>
              <dd>{log.ip ?? '—'}</dd>
            </div>
            {log.academies?.nome && (
              <div>
                <dt>Academia</dt>
                <dd>{log.academies.nome}</dd>
              </div>
            )}
            <div>
              <dt>Registro</dt>
              <dd className={styles.mono}>{log.registro_id}</dd>
            </div>
          </dl>

          <div className={styles.diffHeader}>
            <h3>Alterações</h3>
            {log.acao === 'update' || log.acao === 'soft_delete' ? (
              <Switch label="Somente campos alterados" checked={onlyChanged} onChange={setOnlyChanged} />
            ) : null}
          </div>

          <table className={styles.diff}>
            <thead>
              <tr>
                <th>Campo</th>
                <th>Antes</th>
                <th>Depois</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className={r.changed && log.acao !== 'insert' && log.acao !== 'delete' ? styles.changed : ''}>
                  <td>{r.key}</td>
                  <td>{show(r.a)}</td>
                  <td>{show(r.b)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Modal>
  )
}
