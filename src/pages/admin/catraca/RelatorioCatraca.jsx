import { useQuery } from '@tanstack/react-query'
import { Download, FileDown } from 'lucide-react'
import { useMemo, useState } from 'react'
import QueryError from '../../../components/feedback/QueryError'
import { downloadBlob } from '../../../components/receipt/pdfExport'
import { Button, Input, Modal, Select, StatCard, StatGrid, useToast } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { listAcessosPeriodo } from '../../../services/catracaService'
import { exportCSV } from '../../../utils/csv'
import { errorMessage } from '../../../utils/errors'
import { formatDate, toISODate } from '../../../utils/formatters'
import { RESULTADOS, catracaResumo, catracaSections } from './catracaReport'

const PERIODOS = [
  { value: 'hoje', label: 'Hoje' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: 'mes', label: 'Este mês' },
  { value: 'mes_anterior', label: 'Mês anterior' },
  { value: 'custom', label: 'Personalizado' },
]

function periodo(key) {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()
  switch (key) {
    case 'hoje':
      return { de: toISODate(now), ate: toISODate(now) }
    case '7d':
      return { de: toISODate(new Date(y, m, d - 6)), ate: toISODate(now) }
    case '30d':
      return { de: toISODate(new Date(y, m, d - 29)), ate: toISODate(now) }
    case 'mes_anterior':
      return { de: toISODate(new Date(y, m - 1, 1)), ate: toISODate(new Date(y, m, 0)) }
    default:
      return { de: toISODate(new Date(y, m, 1)), ate: toISODate(now) }
  }
}

/** Relatório de acessos da catraca: período e filtros, com PDF e CSV */
export default function RelatorioCatraca({ catracas, onClose }) {
  const { academyId, academy } = useTenant()
  const toast = useToast()
  const [chave, setChave] = useState('mes')
  const [custom, setCustom] = useState(() => periodo('mes'))
  const [deviceId, setDeviceId] = useState('')
  const [resultado, setResultado] = useState('')
  const [busy, setBusy] = useState(false)

  const range = chave === 'custom' ? custom : periodo(chave)
  const valido = Boolean(range.de && range.ate && range.de <= range.ate)
  // dias no horário local: do início do "de" até o início do dia seguinte ao "até"
  const inicio = valido ? new Date(`${range.de}T00:00:00`).toISOString() : null
  const fim = valido ? new Date(new Date(`${range.ate}T00:00:00`).getTime() + 86400000).toISOString() : null

  const query = useQuery({
    queryKey: ['catraca-relatorio', academyId, inicio, fim, deviceId, resultado],
    queryFn: () => listAcessosPeriodo(academyId, { de: inicio, ate: fim, deviceId, resultado }),
    enabled: valido,
    placeholderData: (prev) => prev,
  })

  const variasCatracas = catracas.length > 1
  const nomeCatraca = (id) => catracas.find((c) => c.id === id)?.nome ?? '—'
  const rows = useMemo(() => query.data ?? [], [query.data])
  const resumo = useMemo(() => catracaResumo(rows), [rows])
  const sections = useMemo(
    () => catracaSections(rows, { nomeCatraca: (id) => catracas.find((c) => c.id === id)?.nome ?? '—', variasCatracas: catracas.length > 1 }),
    [rows, catracas],
  )

  const periodoTexto = `${formatDate(range.de)} a ${formatDate(range.ate)}`
  const filtrosTexto = [
    deviceId && `Catraca: ${nomeCatraca(deviceId)}`,
    resultado && `Resultado: ${RESULTADOS[resultado]?.label ?? resultado}`,
  ]
    .filter(Boolean)
    .join(' · ')

  const csv = (key) => {
    const sec = sections.find((x) => x.key === key)
    exportCSV(`${sec.file}-${range.de}-a-${range.ate}`, sec.columns.map((c) => ({ header: c.header, value: c.raw ?? c.value })), sec.rows)
  }

  const pdf = async () => {
    setBusy(true)
    try {
      const { generateCatracaReportPdf } = await import('./CatracaReportPdf')
      const cor = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#006EB8'
      const blob = await generateCatracaReportPdf(resumo, sections, { academia: academy?.nome ?? '', periodo: periodoTexto, filtros: filtrosTexto, cor })
      downloadBlob(blob, `catraca-${range.de}-a-${range.ate}.pdf`)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const pronto = valido && query.isSuccess && !query.isFetching

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Relatório de acessos"
      footer={
        <>
          <Button variant="outline" icon={Download} disabled={!pronto || !rows.length} onClick={() => csv('por_aluno')}>
            CSV por aluno
          </Button>
          <Button variant="outline" icon={Download} disabled={!pronto || !rows.length} onClick={() => csv('acessos')}>
            CSV dos acessos
          </Button>
          <Button icon={FileDown} loading={busy} disabled={!pronto || busy} onClick={pdf}>
            Baixar PDF
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <Select label="Período" value={chave} onChange={(e) => setChave(e.target.value)} options={PERIODOS} />
        {chave === 'custom' && (
          <>
            <Input label="De" type="date" value={custom.de} max={custom.ate || toISODate()} onChange={(e) => setCustom((c) => ({ ...c, de: e.target.value }))} />
            <Input label="Até" type="date" value={custom.ate} min={custom.de} max={toISODate()} onChange={(e) => setCustom((c) => ({ ...c, ate: e.target.value }))} />
          </>
        )}
        {variasCatracas && (
          <Select
            label="Catraca"
            placeholder="Todas"
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            options={catracas.map((c) => ({ value: c.id, label: c.unidade ? `${c.nome} · ${c.unidade}` : c.nome }))}
          />
        )}
        <Select
          label="Resultado"
          placeholder="Todos"
          value={resultado}
          onChange={(e) => setResultado(e.target.value)}
          options={Object.entries(RESULTADOS).map(([value, r]) => ({ value, label: r.label }))}
        />
      </div>
      <p className="text-muted" style={{ fontSize: 12, margin: '8px 0 16px' }}>
        {valido ? `Período: ${periodoTexto}` : 'Escolha um período válido'}
        {filtrosTexto ? ` · ${filtrosTexto}` : ''}
      </p>

      {query.isError ? (
        <QueryError error={query.error} onRetry={query.refetch} />
      ) : (
        <StatGrid>
          {resumo.map((c) => (
            <StatCard key={c.label} label={c.label} value={c.value} loading={!query.data || query.isFetching} />
          ))}
        </StatGrid>
      )}
      <p className="text-muted" style={{ fontSize: 12, marginTop: 12 }}>
        O PDF traz o resumo, o movimento por dia, os horários de maior movimento, a frequência por aluno, os motivos de bloqueio e a lista de
        acessos. Os CSVs abrem no Excel.
      </p>
    </Modal>
  )
}
