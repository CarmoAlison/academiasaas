import { Lock } from 'lucide-react'
import { PageLoader } from '../components/feedback/FullPageLoader'
import EmptyState from '../components/ui/EmptyState'
import { useModules } from '../hooks/useModules'

/**
 * Só mostra a página se o módulo estiver liberado para a academia.
 * @param {{ module: string, children: import('react').ReactNode }} props
 */
export default function ModuleGuard({ module, children }) {
  const { has, loaded } = useModules()
  if (!loaded) return <PageLoader />
  if (has(module)) return children
  return (
    <div style={{ paddingTop: 64 }}>
      <EmptyState icon={Lock} title="Recurso não disponível" description="Esta funcionalidade não está liberada para a sua academia." />
    </div>
  )
}
