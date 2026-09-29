import { AlertTriangle } from 'lucide-react'
import { errorMessage } from '../../utils/errors'
import Button from '../ui/Button'
import EmptyState from '../ui/EmptyState'

/** Estado de erro padrão para queries */
export default function QueryError({ error, onRetry }) {
  return (
    <EmptyState
      icon={AlertTriangle}
      title="Não foi possível carregar os dados"
      description={errorMessage(error)}
      action={onRetry && <Button variant="outline" onClick={onRetry}>Tentar novamente</Button>}
    />
  )
}
