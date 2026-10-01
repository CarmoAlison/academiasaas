import { formatCurrency, formatDate, formatMonth } from '../../../utils/formatters'

export const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const pct = (part, total) => (total ? `${Math.round((part / total) * 100)}%` : '—')
const SITUACAO = { inativo: 'Inativo', trancado: 'Trancado', removido: 'Removido', ativo: 'Ativo' }

/**
 * Seções do relatório: mesma definição para tela, CSV e PDF.
 * Cada coluna tem `value` (texto já formatado) e opcionalmente `raw` (número para CSV).
 * @param {object} d retorno de report_data
 */
export function reportSections(d) {
  const receitaTotal = d.receita_por_plano.reduce((a, r) => a + Number(r.total), 0)
  const horarios = [...d.horarios].sort((a, b) => b.total - a.total)

  return [
    {
      key: 'receita_por_plano',
      title: 'Receita por plano',
      file: 'receita-por-plano',
      rows: d.receita_por_plano,
      columns: [
        { header: 'Plano', value: (r) => r.plano },
        { header: 'Receita', value: (r) => formatCurrency(r.total), raw: (r) => Number(r.total).toFixed(2).replace('.', ','), align: 'right' },
        { header: 'Pagamentos', value: (r) => r.pagamentos, align: 'right' },
        { header: '% da receita', value: (r) => pct(Number(r.total), receitaTotal), align: 'right' },
      ],
    },
    {
      key: 'mensal',
      title: 'Evolução mensal',
      file: 'evolucao-mensal',
      rows: d.mensal,
      columns: [
        { header: 'Mês', value: (r) => formatMonth(r.mes) },
        { header: 'Receita', value: (r) => formatCurrency(r.receita), raw: (r) => Number(r.receita).toFixed(2).replace('.', ','), align: 'right' },
        { header: 'Matrículas', value: (r) => r.novos, align: 'right' },
        { header: 'Cancelamentos', value: (r) => r.cancelamentos, align: 'right' },
        { header: 'Saldo', value: (r) => r.novos - r.cancelamentos, align: 'right' },
      ],
    },
    {
      key: 'cancelamentos',
      title: 'Cancelamentos',
      file: 'cancelamentos',
      rows: d.cancelamentos,
      columns: [
        { header: 'Aluno', value: (r) => r.nome },
        { header: 'Plano', value: (r) => r.plano ?? '—' },
        { header: 'Matrícula', value: (r) => formatDate(r.data_matricula) },
        { header: 'Saída', value: (r) => formatDate(r.saida) },
        { header: 'Tempo de casa', value: (r) => (r.meses < 1 ? 'menos de 1 mês' : `${r.meses} ${r.meses === 1 ? 'mês' : 'meses'}`), raw: (r) => r.meses },
        { header: 'Situação', value: (r) => SITUACAO[r.status] ?? r.status },
      ],
    },
    {
      key: 'por_professor',
      title: 'Alunos por professor',
      subtitle: 'Alunos ativos com ficha de treino vigente',
      file: 'alunos-por-professor',
      rows: d.por_professor,
      columns: [
        { header: 'Professor', value: (r) => r.professor },
        { header: 'Alunos', value: (r) => r.alunos, align: 'right' },
        { header: 'Fichas', value: (r) => r.fichas, align: 'right' },
      ],
    },
    {
      key: 'aulas',
      title: 'Aulas coletivas',
      file: 'aulas',
      rows: d.aulas,
      columns: [
        { header: 'Aula', value: (r) => r.aula },
        { header: 'Horário', value: (r) => r.horario },
        { header: 'Reservas', value: (r) => r.reservas, align: 'right' },
        { header: 'Presenças', value: (r) => r.presencas, align: 'right' },
        { header: 'Faltas', value: (r) => r.faltas, align: 'right' },
        { header: 'Comparecimento', value: (r) => pct(r.presencas, r.presencas + r.faltas), align: 'right' },
      ],
    },
    {
      key: 'horarios',
      title: 'Horários mais movimentados',
      subtitle: 'Check-ins por dia da semana e hora',
      file: 'horarios',
      rows: horarios,
      columns: [
        { header: 'Dia', value: (r) => WEEKDAY_SHORT[r.dow] },
        { header: 'Hora', value: (r) => `${String(r.hora).padStart(2, '0')}h` },
        { header: 'Check-ins', value: (r) => r.total, align: 'right' },
      ],
    },
  ]
}

/** Cards de resumo */
export const summaryCards = (r) => [
  { label: 'Receita', value: formatCurrency(r.receita), hint: `${r.pagamentos} pagamento(s)` },
  { label: 'Ticket médio', value: formatCurrency(r.ticket_medio) },
  { label: 'Novas matrículas', value: r.novos },
  { label: 'Cancelamentos', value: r.cancelamentos },
  { label: 'Check-ins', value: r.checkins },
  { label: 'Alunos ativos', value: r.ativos, hint: 'hoje' },
  { label: 'Inadimplência', value: formatCurrency(r.inadimplencia), hint: 'em aberto hoje' },
]
