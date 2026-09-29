import { Loader2 } from 'lucide-react'

export default function Spinner({ size = 20, className = '' }) {
  return (
    <Loader2
      size={size}
      className={className}
      style={{ animation: 'spin 0.9s linear infinite', flexShrink: 0 }}
      aria-label="Carregando"
    />
  )
}
