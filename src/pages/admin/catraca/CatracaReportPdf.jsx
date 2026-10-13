import { Document, Page, Text, View, pdf } from '@react-pdf/renderer'
import { PdfTable, reportStyles as s } from '../relatorios/ReportPdf'

const MAX_ACESSOS = 1000

function CatracaReportDocument({ resumo, sections, meta }) {
  return (
    <Document title={`Acessos da catraca ${meta.academia} ${meta.periodo}`} author={meta.academia}>
      <Page size="A4" style={s.page} wrap>
        <View style={[s.header, { borderBottomColor: meta.cor }]}>
          <Text style={s.title}>Relatório de acessos da catraca — {meta.academia}</Text>
          <Text style={s.sub}>
            Período: {meta.periodo}
            {meta.filtros ? ` · ${meta.filtros}` : ''} · Gerado em {new Date().toLocaleString('pt-BR')}
          </Text>
        </View>
        <View style={s.cards}>
          {resumo.map((c) => (
            <View key={c.label} style={s.card}>
              <View style={s.cardInner}>
                <Text style={s.cardLabel}>{c.label}</Text>
                <Text style={s.cardValue}>{String(c.value)}</Text>
              </View>
            </View>
          ))}
        </View>
        {sections.map((sec) => (
          <PdfTable key={sec.key} section={sec} maxRows={sec.key === 'acessos' ? MAX_ACESSOS : 300} />
        ))}
        <Text style={s.footer} fixed render={({ pageNumber, totalPages }) => `${meta.academia} · Página ${pageNumber} de ${totalPages}`} />
      </Page>
    </Document>
  )
}

/** Gera o PDF do relatório de acessos da catraca */
export function generateCatracaReportPdf(resumo, sections, meta) {
  return pdf(<CatracaReportDocument resumo={resumo} sections={sections} meta={meta} />).toBlob()
}
