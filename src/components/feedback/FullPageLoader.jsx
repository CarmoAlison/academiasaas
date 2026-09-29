import Spinner from '../ui/Spinner'

export default function FullPageLoader({ label = 'Carregando...' }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        color: 'var(--color-primary)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Spinner size={24} />
        <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      </div>
    </div>
  )
}

/** Loader para o conteúdo de uma página (dentro do layout) */
export function PageLoader() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', padding: 64, color: 'var(--color-primary)' }}>
      <Spinner size={24} />
    </div>
  )
}
