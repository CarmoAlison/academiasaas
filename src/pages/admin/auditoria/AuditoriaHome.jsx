import { useQuery } from '@tanstack/react-query'
import { AlertOctagon, FileClock, LogIn } from 'lucide-react'
import { Link } from 'react-router-dom'
import AuditLogTable from '../../../components/audit/AuditLogTable'
import { Card, StatCard, StatGrid } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { auditSummary } from '../../../services/auditService'

export default function AuditoriaHome() {
  const { academyId } = useTenant()
  const summary = useQuery({ queryKey: ['audit-summary', academyId], queryFn: () => auditSummary(academyId) })
  const s = summary.data

  return (
    <>
      <StatGrid>
        <Link to="log-completo" style={{ textDecoration: 'none', color: 'inherit' }}>
          <StatCard label="Eventos (7 dias)" value={s?.eventos} icon={FileClock} loading={summary.isPending} hint="Criações, alterações e exclusões" />
        </Link>
        <Link to="erros" style={{ textDecoration: 'none', color: 'inherit' }}>
          <StatCard label="Erros (7 dias)" value={s?.erros} icon={AlertOctagon} tone="danger" loading={summary.isPending} />
        </Link>
        <Link to="acessos" style={{ textDecoration: 'none', color: 'inherit' }}>
          <StatCard label="Acessos (7 dias)" value={s?.acessos} icon={LogIn} tone="success" loading={summary.isPending} hint="Logins e logouts" />
        </Link>
      </StatGrid>
      <Card title="Últimos eventos" subtitle="Clique em um evento para ver o antes/depois" padding={false}>
        <AuditLogTable academyId={academyId} variant="completo" />
      </Card>
    </>
  )
}
