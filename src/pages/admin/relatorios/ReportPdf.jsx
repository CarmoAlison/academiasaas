import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'
import { reportSections, summaryCards } from './reportSections'

const INK = '#111827'
const MUTED = '#6B7280'
const LINE = '#E5E7EB'
const MAX_ROWS = 300

const s = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 40, paddingHorizontal: 28, fontFamily: 'Helvetica', fontSize: 9, color: INK },
  header: { paddingBottom: 10, marginBottom: 12, borderBottomWidth: 3 },
  title: { fontFamily: 'Helvetica-Bold', fontSize: 16 },
  sub: { fontSize: 9, color: MUTED, marginTop: 3 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 },
  card: { width: '25%', padding: 4 },
  cardInner: { borderWidth: 1, borderColor: LINE, borderRadius: 6, padding: 8 },
  cardLabel: { fontSize: 7.5, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  cardValue: { fontFamily: 'Helvetica-Bold', fontSize: 12, marginTop: 2 },
  section: { marginTop: 12 },
  sectionTitle: { fontFamily: 'Helvetica-Bold', fontSize: 11, marginBottom: 2 },
  sectionSub: { fontSize: 8, color: MUTED, marginBottom: 4 },
  table: { borderWidth: 1, borderColor: LINE, borderRadius: 4 },
  tr: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: LINE },
  th: { flexDirection: 'row', backgroundColor: '#F3F4F6' },
  cell: { flex: 1, paddingVertical: 4, paddingHorizontal: 5 },
  thText: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: MUTED, textTransform: 'uppercase' },
  empty: { padding: 6, color: MUTED },
  footer: { position: 'absolute', bottom: 16, left: 28, right: 28, fontSize: 7.5, color: MUTED, textAlign: 'center' },
})

function Table({ section }) {
  const rows = section.rows.slice(0, MAX_ROWS)
  return (
    <View style={s.section}>
      {/* título não fica sozinho no fim da página */}
      <View wrap={false} minPresenceAhead={70}>
        <Text style={s.sectionTitle}>{section.title}</Text>
        {section.subtitle ? <Text style={s.sectionSub}>{section.subtitle}</Text> : null}
      </View>
      <View style={s.table}>
        <View style={s.th} fixed>
          {section.columns.map((c) => (
            <Text key={c.header} style={[s.cell, s.thText, c.align === 'right' && { textAlign: 'right' }]}>
              {c.header}
            </Text>
          ))}
        </View>
        {rows.length ? (
          rows.map((r, i) => (
            <View key={i} style={s.tr} wrap={false}>
              {section.columns.map((c) => (
                <Text key={c.header} style={[s.cell, c.align === 'right' && { textAlign: 'right' }]}>
                  {String(c.value(r) ?? '')}
                </Text>
              ))}
            </View>
          ))
        ) : (
          <Text style={[s.empty, s.tr]}>Sem dados no período.</Text>
        )}
      </View>
      {section.rows.length > MAX_ROWS ? <Text style={s.sectionSub}>Mostrando {MAX_ROWS} de {section.rows.length}. Use o CSV para a lista completa.</Text> : null}
    </View>
  )
}

function ReportDocument({ data, meta }) {
  return (
    <Document title={`Relatório ${meta.academia} ${meta.periodo}`} author={meta.academia}>
      <Page size="A4" style={s.page} wrap>
        <View style={[s.header, { borderBottomColor: meta.cor }]}>
          <Text style={s.title}>Relatório gerencial — {meta.academia}</Text>
          <Text style={s.sub}>
            Período: {meta.periodo}
            {meta.filtros ? ` · ${meta.filtros}` : ''} · Gerado em {new Date().toLocaleString('pt-BR')}
          </Text>
        </View>
        <View style={s.cards}>
          {summaryCards(data.resumo).map((c) => (
            <View key={c.label} style={s.card}>
              <View style={s.cardInner}>
                <Text style={s.cardLabel}>{c.label}</Text>
                <Text style={s.cardValue}>{String(c.value)}</Text>
              </View>
            </View>
          ))}
        </View>
        {reportSections(data).map((sec) => (
          <Table key={sec.key} section={sec} />
        ))}
        <Text style={s.footer} fixed render={({ pageNumber, totalPages }) => `${meta.academia} · Página ${pageNumber} de ${totalPages}`} />
      </Page>
    </Document>
  )
}

/** Gera o PDF do relatório */
export function generateReportPdf(data, meta) {
  return pdf(<ReportDocument data={data} meta={meta} />).toBlob()
}
