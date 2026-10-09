import { toISODate } from './formatters'

/** Segunda-feira (YYYY-MM-DD) da semana de `date` */
export function mondayOf(date = new Date()) {
  const d = new Date(date)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return toISODate(d)
}

/**
 * Sequência de semanas seguidas batendo a meta.
 * A semana atual só entra quando a meta já foi batida (até domingo ela ainda está "em andamento").
 * @param {{ inicio: string, dias: number }[]} semanas
 * @param {number} meta
 * @returns {{ sequencia: number, estaSemana: number }}
 */
export function weeklyStreak(semanas, meta, today = new Date()) {
  const dias = new Map((semanas ?? []).map((s) => [s.inicio, s.dias]))
  const atual = mondayOf(today)
  const estaSemana = dias.get(atual) ?? 0
  let sequencia = estaSemana >= meta ? 1 : 0
  const d = new Date(`${atual}T12:00:00`)
  for (;;) {
    d.setDate(d.getDate() - 7)
    if ((dias.get(toISODate(d)) ?? 0) >= meta) sequencia++
    else break
  }
  return { sequencia, estaSemana }
}

/** Marcos das conquistas (total de check-ins ou de treinos concluídos) */
export const MARCOS = [1, 10, 25, 50, 100, 250, 500]

/** Conquistas liberadas e a próxima a alcançar */
export function achievements(total) {
  const n = Number(total) || 0
  return {
    lista: MARCOS.map((m) => ({ marco: m, ok: n >= m })),
    proxima: MARCOS.find((m) => n < m) ?? null,
  }
}

/**
 * Descanso da ficha em segundos: "60s", "60", "1min", "1 min", "1:30", "1m30s", "2'" → número.
 * Sem informação válida: 60 segundos.
 */
export function parseDescanso(text, fallback = 60) {
  const s = String(text ?? '').toLowerCase().replace(/\s+/g, '')
  if (!s) return fallback
  let m = s.match(/^(\d{1,2}):(\d{2})$/)
  if (m) return Number(m[1]) * 60 + Number(m[2])
  m = s.match(/^(\d+(?:[.,]\d+)?)(?:min|m|')(?:(\d+)(?:s|seg|")?)?$/)
  if (m) return Math.round(Number(m[1].replace(',', '.')) * 60) + Number(m[2] ?? 0)
  m = s.match(/^(\d+)(?:s|seg|segundos|")?$/)
  if (m) return Number(m[1])
  return fallback
}

/** "1:30" */
export const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.max(0, sec) % 60).padStart(2, '0')}`

/** Carga em kg formatada: 42.5 → "42,5 kg" */
export const formatKg = (v) => `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg`

/** Pontos de evolução: maior carga anotada em cada dia para o exercício (ordem cronológica) */
export function cargaSeries(logs, exerciseId) {
  const byDay = new Map()
  for (const l of logs ?? []) {
    if (l.exercise_id !== exerciseId || l.carga === null || l.carga === undefined) continue
    const v = Number(l.carga)
    if (!byDay.has(l.data) || v > byDay.get(l.data)) byDay.set(l.data, v)
  }
  return [...byDay.entries()].map(([data, carga]) => ({ data, carga })).sort((a, b) => a.data.localeCompare(b.data))
}
