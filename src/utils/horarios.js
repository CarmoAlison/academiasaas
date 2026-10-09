/** Horário de funcionamento: lista de 7 dias (índice 0 = domingo), cada um { aberto, abre, fecha } */

export const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

/** Sugestão inicial: seg–sex 06h–22h, sábado 08h–14h, domingo fechado */
export const defaultHorarios = () =>
  DIAS_SEMANA.map((_, i) => ({
    aberto: i !== 0,
    abre: i === 6 ? '08:00' : '06:00',
    fecha: i === 6 ? '14:00' : '22:00',
  }))

const minutes = (hhmm) => {
  const [h, m] = String(hhmm || '00:00').split(':').map(Number)
  return h * 60 + (m || 0)
}

/** "06:00 – 22:00", "24 horas" ou "Fechado" */
export function horarioLabel(dia) {
  if (!dia?.aberto) return 'Fechado'
  if (dia.abre === dia.fecha) return '24 horas'
  return `${dia.abre} – ${dia.fecha}`
}

/** Aberta agora? (mesma regra do banco: fechamento após a meia-noite é aceito) */
export function isOpenNow(horarios, now = new Date()) {
  if (!Array.isArray(horarios) || horarios.length !== 7) return null
  const dia = horarios[now.getDay()]
  if (!dia?.aberto) return false
  const t = now.getHours() * 60 + now.getMinutes()
  const abre = minutes(dia.abre)
  const fecha = minutes(dia.fecha)
  return fecha <= abre ? t >= abre || t < fecha : t >= abre && t < fecha
}
