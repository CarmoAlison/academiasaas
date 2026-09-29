import AuditLogTable from '../../../components/audit/AuditLogTable'
import { useTenant } from '../../../hooks/useAuth'

/** Log detalhado: filtros + modal com diff antes/depois */
export default function LogDetalhado() {
  const { academyId } = useTenant()
  return <AuditLogTable academyId={academyId} variant="detalhado" />
}
