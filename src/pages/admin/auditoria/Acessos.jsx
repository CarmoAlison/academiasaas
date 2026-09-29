import AccessLogTable from '../../../components/audit/AccessLogTable'
import { useTenant } from '../../../hooks/useAuth'

export default function Acessos() {
  const { academyId } = useTenant()
  return <AccessLogTable academyId={academyId} />
}
