import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import styles from './Charts.module.css'

const AXIS = { fontSize: 12, fill: 'var(--color-text-muted)' }
const COLOR = 'var(--color-primary)'
const SURFACE = 'var(--color-surface)'

function ChartTooltip({ active, payload, label, labelFormatter, valueFormatter, name }) {
  if (!active || !payload?.length) return null
  return (
    <div className={styles.tooltip}>
      <span className={styles.tooltipLabel}>{labelFormatter ? labelFormatter(label) : label}</span>
      <span className={styles.tooltipRow}>
        <i className={styles.swatch} />
        {name}: <strong>{valueFormatter ? valueFormatter(payload[0].value) : payload[0].value}</strong>
      </span>
    </div>
  )
}

/**
 * Barras de uma única série (uma cor, um eixo).
 * @param {{ data: any[], xKey: string, yKey: string, name: string, xFormatter?: Function, yFormatter?: Function, height?: number }} props
 */
export function SimpleBarChart({ data, xKey, yKey, name, xFormatter, yFormatter, height = 260 }) {
  return (
    <div className={styles.chart} style={{ height }} role="img" aria-label={name}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="var(--color-border)" />
          <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={false} tickFormatter={xFormatter} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={64} tickFormatter={yFormatter} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: 'var(--color-primary-light)', opacity: 0.6 }}
            content={<ChartTooltip labelFormatter={xFormatter} valueFormatter={yFormatter} name={name} />}
          />
          <Bar dataKey={yKey} name={name} fill={COLOR} radius={[4, 4, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * Linha/área de uma única série para evolução no tempo.
 * @param {{ data: any[], xKey: string, yKey: string, name: string, xFormatter?: Function, yFormatter?: Function, height?: number }} props
 */
export function SimpleAreaChart({ data, xKey, yKey, name, xFormatter, yFormatter, height = 260 }) {
  return (
    <div className={styles.chart} style={{ height }} role="img" aria-label={name}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: COLOR, stopOpacity: 0.18 }} />
              <stop offset="100%" style={{ stopColor: COLOR, stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--color-border)" />
          <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={false} tickFormatter={xFormatter} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={64} tickFormatter={yFormatter} allowDecimals={false} />
          <Tooltip
            cursor={{ stroke: 'var(--color-text-muted)', strokeDasharray: '3 3' }}
            content={<ChartTooltip labelFormatter={xFormatter} valueFormatter={yFormatter} name={name} />}
          />
          <Area
            type="monotone"
            dataKey={yKey}
            name={name}
            stroke={COLOR}
            strokeWidth={2}
            fill="url(#areaFill)"
            dot={{ r: 4, fill: SURFACE, stroke: COLOR, strokeWidth: 2 }}
            activeDot={{ r: 5, stroke: SURFACE, strokeWidth: 2, fill: COLOR }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * Barras horizontais com rótulos (distribuição simples, sem gráfico pesado)
 * @param {{ items: { label: string, value: number }[], formatter?: (v: number) => string }} props
 */
export function BarList({ items, formatter = String }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <ul className={styles.barList}>
      {items.map((item) => (
        <li key={item.label}>
          <div className={styles.barListTop}>
            <span>{item.label}</span>
            <strong>{formatter(item.value)}</strong>
          </div>
          <div className={styles.track}>
            <div className={styles.fill} style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}
