import AuditLogTable from '../../../components/audit/AuditLogTable'
import { useTenant } from '../../../hooks/useAuth'

/** Log completo: todos os eventos paginados */
export default function LogCompleto() {
  const { academyId } = useTenant()
  return <AuditLogTable academyId={academyId} variant="completo" />
}
