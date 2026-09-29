import { AlertTriangle } from 'lucide-react'
import { Component } from 'react'
import { logError } from '../../services/logService'
import Button from '../ui/Button'
import EmptyState from '../ui/EmptyState'

/** Captura erros de renderização e registra na tabela errors */
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    const err = error instanceof Error ? error : new Error(String(error))
    err.stack = `${err.stack ?? ''}\n\nComponent stack:${info?.componentStack ?? ''}`
    logError(err)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32 }}>
          <EmptyState
            icon={AlertTriangle}
            title="Algo deu errado"
            description="O erro foi registrado e nossa equipe será notificada. Tente recarregar a página."
            action={<Button onClick={() => window.location.reload()}>Recarregar</Button>}
          />
        </div>
      )
    }
    return this.props.children
  }
}
