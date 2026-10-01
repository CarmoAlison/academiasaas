import { WEEKDAY_SHORT } from './reportSections'
import styles from './Relatorios.module.css'

// segunda a domingo
const DAYS = [1, 2, 3, 4, 5, 6, 0]

/**
 * Mapa de calor de check-ins (dia da semana × hora)
 * @param {{ data: { dow: number, hora: number, total: number }[] }} props
 */
export default function Heatmap({ data }) {
  if (!data.length) return <p className="text-muted">Nenhum check-in no período.</p>

  const horas = data.map((d) => d.hora)
  const min = Math.min(5, ...horas)
  const max = Math.max(22, ...horas)
  const hours = Array.from({ length: max - min + 1 }, (_, i) => min + i)
  const top = Math.max(...data.map((d) => d.total))
  const value = (dow, h) => data.find((d) => d.dow === dow && d.hora === h)?.total ?? 0
  const peak = [...data].sort((a, b) => b.total - a.total)[0]

  return (
    <>
      <div className={styles.heatScroll}>
        <table className={styles.heat}>
          <thead>
            <tr>
              <th />
              {hours.map((h) => (
                <th key={h}>{h}h</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((dow) => (
              <tr key={dow}>
                <th>{WEEKDAY_SHORT[dow]}</th>
                {hours.map((h) => {
                  const v = value(dow, h)
                  return (
                    <td key={h} title={`${WEEKDAY_SHORT[dow]} ${h}h: ${v} check-in(s)`} style={{ '--a': v ? 0.15 + (v / top) * 0.85 : 0, color: v / top > 0.45 ? 'var(--color-on-primary)' : 'var(--color-text)' }}>
                      {v || ''}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
        Pico: {WEEKDAY_SHORT[peak.dow]} às {peak.hora}h ({peak.total} check-ins)
      </p>
    </>
  )
}
