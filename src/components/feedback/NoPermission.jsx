import { ShieldOff } from 'lucide-react'
import EmptyState from '../ui/EmptyState'

export default function NoPermission({ message = 'Solicite ao administrador da academia a liberação desta funcionalidade.' }) {
  return (
    <div style={{ paddingTop: 48 }}>
      <EmptyState icon={ShieldOff} title="Acesso não permitido" description={message} />
    </div>
  )
}
