import { WEEKDAYS } from './constants'

/** Posição na semana começando na segunda (seg=0 … dom=6); dia sem data fixa vai para o fim */
export const weekPosition = (dia) => (dia == null ? 7 : (Number(dia) + 6) % 7)

/** Dias da semana na ordem seg → dom (para montar a tela) */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

/** Ordena dias de treino de segunda a domingo (desempate pela ordem cadastrada) */
export const sortDays = (days) =>
  [...days].sort((a, b) => weekPosition(a.dia_semana) - weekPosition(b.dia_semana) || (a.ordem ?? 0) - (b.ordem ?? 0))

export const dayLabel = (dia) => (dia == null ? 'Treino' : WEEKDAYS[dia].label)
export const dayShort = (dia) => (dia == null ? 'Livre' : WEEKDAYS[dia].short)

/** Atalhos de montagem da semana */
export const WEEK_PRESETS = [
  { key: 'seg-sex', label: 'Seg a Sex (5 dias)', dias: [1, 2, 3, 4, 5] },
  { key: 'seg-sab', label: 'Seg a Sáb (6 dias)', dias: [1, 2, 3, 4, 5, 6] },
  { key: 'alternado', label: 'Seg, Qua, Sex (3 dias)', dias: [1, 3, 5] },
]

/**
 * Resumo dos dias de uma ficha, ex.: "Seg a Sex · 5 dias" ou "Seg, Qua, Sex · 3 dias"
 * @param {{ dia_semana: number|null }[]} days
 */
export function summarizeDays(days) {
  const fixed = sortDays(days).filter((d) => d.dia_semana != null)
  if (!fixed.length) return days.length ? `${days.length} treino(s)` : '—'
  const pos = fixed.map((d) => weekPosition(d.dia_semana))
  const consecutive = pos.every((p, i) => i === 0 || p === pos[i - 1] + 1)
  const names = fixed.map((d) => dayShort(d.dia_semana))
  const text = consecutive && names.length > 2 ? `${names[0]} a ${names[names.length - 1]}` : names.join(', ')
  return `${text} · ${fixed.length} ${fixed.length > 1 ? 'dias' : 'dia'}`
}

/** Segunda-feira 00:00 da semana de `date` */
export function startOfWeek(date = new Date()) {
  const d = new Date(date)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  d.setHours(0, 0, 0, 0)
  return d
}

/** "1 exercício" / "3 exercícios" */
export const exercisesLabel = (n) => `${n} ${n === 1 ? 'exercício' : 'exercícios'}`
