import ErrorLogTable from '../../../components/audit/ErrorLogTable'
import { useTenant } from '../../../hooks/useAuth'

export default function Erros() {
  const { academyId } = useTenant()
  return <ErrorLogTable academyId={academyId} />
}
