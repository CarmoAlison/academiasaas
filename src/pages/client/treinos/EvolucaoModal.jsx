import { TrendingDown, TrendingUp } from 'lucide-react'
import { SimpleAreaChart } from '../../../components/charts/Charts'
import { EmptyState, Modal } from '../../../components/ui'
import { formatDate } from '../../../utils/formatters'
import { cargaSeries, formatKg } from '../../../utils/progresso'

/** Evolução da carga de um exercício ("Supino: 40 → 52 kg") */
export default function EvolucaoModal({ exercise, logs, onClose }) {
  const pontos = cargaSeries(logs, exercise.id)
  const primeiro = pontos[0]
  const ultimo = pontos[pontos.length - 1]
  const diff = primeiro && ultimo ? ultimo.carga - primeiro.carga : 0
  const recorde = pontos.reduce((max, p) => Math.max(max, p.carga), 0)
  const Icon = diff < 0 ? TrendingDown : TrendingUp

  return (
    <Modal open onClose={onClose} title={`Evolução · ${exercise.nome}`}>
      {pontos.length === 0 ? (
        <EmptyState compact title="Nenhuma carga anotada ainda" description="Anote a carga ao fazer o exercício e acompanhe a evolução aqui." />
      ) : (
        <>
          <p style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 4px', fontSize: 18 }}>
            <Icon size={20} color={diff < 0 ? 'var(--color-danger)' : 'var(--color-success)'} />
            <strong>
              {pontos.length > 1 ? `${formatKg(primeiro.carga).replace(' kg', '')} → ${formatKg(ultimo.carga)}` : formatKg(ultimo.carga)}
            </strong>
            {pontos.length > 1 && diff !== 0 && (
              <span style={{ color: diff > 0 ? 'var(--color-success-text)' : 'var(--color-danger-text)', fontSize: 14 }}>
                ({diff > 0 ? '+' : ''}
                {formatKg(diff)})
              </span>
            )}
          </p>
          <p className="text-muted" style={{ margin: '0 0 12px', fontSize: 14 }}>
            {pontos.length} treino(s) anotado(s) desde {formatDate(primeiro.data)} · recorde {formatKg(recorde)}
          </p>
          {pontos.length > 1 && (
            <SimpleAreaChart
              data={pontos}
              xKey="data"
              yKey="carga"
              name="Carga"
              height={220}
              xFormatter={(d) => formatDate(d).slice(0, 5)}
              yFormatter={(v) => `${Number(v).toLocaleString('pt-BR')} kg`}
            />
          )}
        </>
      )}
    </Modal>
  )
}
