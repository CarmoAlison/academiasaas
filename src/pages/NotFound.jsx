import { Compass } from 'lucide-react'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'

export default function NotFound() {
  return (
    <div style={{ paddingTop: 120 }}>
      <EmptyState
        icon={Compass}
        title="Página não encontrada"
        description="O endereço acessado não existe ou foi movido."
        action={<Button to="/">Ir para o início</Button>}
      />
    </div>
  )
}
