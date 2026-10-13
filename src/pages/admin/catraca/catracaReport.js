import { formatDate, formatDateTime } from '../../../utils/formatters'

export const RESULTADOS = {
  liberado: { label: 'Entrou', tone: 'success' },
  bloqueado: { label: 'Bloqueado', tone: 'danger' },
  manual: { label: 'Liberado pela recepção', tone: 'info' },
  desistencia: { label: 'Não passou', tone: 'neutral' },
  nao_identificado: { label: 'Não identificado', tone: 'warning' },
}
export const METODOS = { facial: 'Rosto', cartao: 'Cartão', qrcode: 'QR Code', senha: 'Senha' }

const resultadoLabel = (r) => RESULTADOS[r]?.label ?? r
const diaLocal = (iso) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const horaLocal = (iso) => new Date(iso).getHours()

/** Números do topo do relatório */
export function catracaResumo(rows) {
  const conta = (...res) => rows.filter((r) => res.includes(r.resultado)).length
  const entradas = rows.filter((r) => r.resultado === 'liberado')
  const alunos = new Set(entradas.map((r) => r.student_id).filter(Boolean)).size
  const dias = new Set(entradas.map((r) => diaLocal(r.created_at))).size
  return [
    { label: 'Entradas', value: conta('liberado') },
    { label: 'Alunos diferentes', value: alunos },
    { label: 'Média por dia', value: dias ? (entradas.length / dias).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : 0 },
    { label: 'Bloqueios', value: conta('bloqueado') },
    { label: 'Não identificados', value: conta('nao_identificado') },
    { label: 'Liberações da recepção', value: conta('manual') },
    { label: 'Não passaram', value: conta('desistencia') },
    { label: 'Total de registros', value: rows.length },
  ]
}

/**
 * Seções do relatório (mesmas para PDF e CSV).
 * value = texto exibido; raw = valor no CSV (quando diferente).
 */
export function catracaSections(rows, { nomeCatraca, variasCatracas }) {
  // por dia
  const porDia = new Map()
  for (const r of rows) {
    const k = diaLocal(r.created_at)
    const d = porDia.get(k) ?? { dia: k, entradas: 0, bloqueios: 0, recepcao: 0, alunos: new Set() }
    if (r.resultado === 'liberado') {
      d.entradas++
      if (r.student_id) d.alunos.add(r.student_id)
    } else if (r.resultado === 'bloqueado' || r.resultado === 'nao_identificado') d.bloqueios++
    else if (r.resultado === 'manual') d.recepcao++
    porDia.set(k, d)
  }

  // por horário (entradas)
  const porHora = new Map()
  for (const r of rows) {
    if (r.resultado !== 'liberado') continue
    const h = horaLocal(r.created_at)
    porHora.set(h, (porHora.get(h) ?? 0) + 1)
  }

  // por aluno
  const porAluno = new Map()
  for (const r of rows) {
    if (!r.student_id) continue
    const a = porAluno.get(r.student_id) ?? { nome: r.nome ?? 'Aluno', entradas: 0, bloqueios: 0, ultima: null, dias: new Set() }
    if (r.resultado === 'liberado') {
      a.entradas++
      a.dias.add(diaLocal(r.created_at))
      if (!a.ultima || r.created_at > a.ultima) a.ultima = r.created_at
    } else if (r.resultado === 'bloqueado') a.bloqueios++
    porAluno.set(r.student_id, a)
  }

  // motivos de bloqueio
  const motivos = new Map()
  for (const r of rows) {
    if (r.resultado !== 'bloqueado' && r.resultado !== 'nao_identificado') continue
    const m = r.motivo ?? resultadoLabel(r.resultado)
    motivos.set(m, (motivos.get(m) ?? 0) + 1)
  }

  return [
    {
      key: 'por_dia',
      file: 'catraca-por-dia',
      title: 'Movimento por dia',
      columns: [
        { header: 'Dia', value: (r) => formatDate(r.dia), raw: (r) => r.dia },
        { header: 'Entradas', value: (r) => r.entradas, align: 'right' },
        { header: 'Alunos diferentes', value: (r) => r.alunos.size, align: 'right' },
        { header: 'Bloqueios', value: (r) => r.bloqueios, align: 'right' },
        { header: 'Liberações da recepção', value: (r) => r.recepcao, align: 'right' },
      ],
      rows: [...porDia.values()].sort((a, b) => a.dia.localeCompare(b.dia)),
    },
    {
      key: 'por_hora',
      file: 'catraca-por-horario',
      title: 'Horários de maior movimento',
      subtitle: 'Entradas por faixa de horário',
      columns: [
        { header: 'Horário', value: (r) => `${String(r.hora).padStart(2, '0')}h às ${String(r.hora + 1).padStart(2, '0')}h` },
        { header: 'Entradas', value: (r) => r.total, align: 'right' },
      ],
      rows: [...porHora.entries()].map(([hora, total]) => ({ hora, total })).sort((a, b) => a.hora - b.hora),
    },
    {
      key: 'por_aluno',
      file: 'catraca-por-aluno',
      title: 'Frequência por aluno',
      subtitle: 'Do aluno que mais entrou para o que menos entrou',
      columns: [
        { header: 'Aluno', value: (r) => r.nome },
        { header: 'Entradas', value: (r) => r.entradas, align: 'right' },
        { header: 'Dias que veio', value: (r) => r.dias.size, align: 'right' },
        { header: 'Bloqueios', value: (r) => r.bloqueios, align: 'right' },
        { header: 'Última entrada', value: (r) => (r.ultima ? formatDateTime(r.ultima) : '—'), raw: (r) => r.ultima ?? '' },
      ],
      rows: [...porAluno.values()].sort((a, b) => b.entradas - a.entradas || a.nome.localeCompare(b.nome)),
    },
    {
      key: 'motivos',
      file: 'catraca-bloqueios',
      title: 'Motivos de bloqueio',
      columns: [
        { header: 'Motivo', value: (r) => r.motivo },
        { header: 'Vezes', value: (r) => r.total, align: 'right' },
      ],
      rows: [...motivos.entries()].map(([motivo, total]) => ({ motivo, total })).sort((a, b) => b.total - a.total),
    },
    {
      key: 'acessos',
      file: 'catraca-acessos',
      title: 'Todos os acessos',
      columns: [
        { header: 'Horário', value: (r) => formatDateTime(r.created_at), raw: (r) => r.created_at },
        { header: 'Aluno', value: (r) => r.nome ?? '—' },
        { header: 'Resultado', value: (r) => resultadoLabel(r.resultado) },
        { header: 'Motivo', value: (r) => [r.motivo, r.por_nome && `por ${r.por_nome}`].filter(Boolean).join(' · ') || '—' },
        { header: 'Como', value: (r) => METODOS[r.metodo] ?? '—' },
        ...(variasCatracas ? [{ header: 'Catraca', value: (r) => nomeCatraca(r.device_id) }] : []),
      ],
      rows,
    },
  ]
}
