import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { isSignatureFontRegistered } from '../receipt/ReceiptPdf'

/** Helvetica (fonte padrão do PDF) não tem emojis */
const clean = (s) => String(s ?? '').replace(/\p{Extended_Pictographic}|️|‍/gu, '').trim()

const INK = '#111827'
const MUTED = '#6B7280'
const LINE = '#E5E7EB'

const s = StyleSheet.create({
  page: { paddingTop: 32, paddingBottom: 48, paddingHorizontal: 36, fontFamily: 'Helvetica', fontSize: 10, color: INK, backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, paddingHorizontal: 20, borderRadius: 8, marginBottom: 18 },
  brand: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  logo: { width: 42, height: 42, borderRadius: 8, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  logoImg: { width: 36, height: 36, objectFit: 'contain' },
  wordmark: { height: 42, width: 180, borderRadius: 8, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  wordmarkImg: { height: 34, width: 164, objectFit: 'contain' },
  initials: { fontFamily: 'Helvetica-Bold', fontSize: 14 },
  brandName: { fontFamily: 'Helvetica-Bold', fontSize: 13 },
  brandSub: { fontSize: 8.5, marginTop: 2 },
  docLabel: { fontFamily: 'Helvetica-Bold', fontSize: 8, letterSpacing: 1.2, textTransform: 'uppercase', textAlign: 'right' },
  docCode: { fontFamily: 'Courier-Bold', fontSize: 11, marginTop: 3, textAlign: 'right' },
  title: { fontFamily: 'Helvetica-Bold', fontSize: 14, textAlign: 'center', marginBottom: 14 },
  heading: { fontFamily: 'Helvetica-Bold', fontSize: 11, textAlign: 'center', marginBottom: 12, lineHeight: 1.5 },
  paragraph: { fontSize: 10.5, lineHeight: 1.6, textAlign: 'justify', marginBottom: 9, color: '#1F2937' },
  acceptance: { flexDirection: 'row', padding: 12, borderRadius: 8, borderWidth: 1, marginTop: 14 },
  accTitle: { fontFamily: 'Helvetica-Bold', fontSize: 10.5, marginBottom: 2 },
  accText: { fontSize: 9.5, color: '#374151', lineHeight: 1.4 },
  signRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 22 },
  place: { fontSize: 9, color: MUTED, maxWidth: 220 },
  signature: { width: 200, alignItems: 'center' },
  signMark: { height: 44, width: '100%', alignItems: 'center', justifyContent: 'flex-end', marginBottom: -4 },
  signImage: { maxWidth: 170, maxHeight: 44, objectFit: 'contain' },
  signCursive: { fontFamily: 'Assinatura', fontSize: 26, color: '#1E3A8A' },
  signLine: { width: '100%', borderTopWidth: 1, borderTopColor: '#9CA3AF', marginBottom: 4 },
  signName: { fontFamily: 'Helvetica-Bold', fontSize: 10 },
  signRole: { fontSize: 8.5, color: MUTED },
  footer: { position: 'absolute', bottom: 18, left: 36, right: 36, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 6 },
  footerText: { fontSize: 7.5, color: MUTED, textAlign: 'center' },
  code: { fontFamily: 'Courier-Bold', color: INK },
  h1: { fontFamily: 'Helvetica-Bold', fontSize: 12.5, textAlign: 'center', marginTop: 4, marginBottom: 12, lineHeight: 1.4 },
  h2: { fontFamily: 'Helvetica-Bold', fontSize: 11, marginTop: 8, marginBottom: 6, lineHeight: 1.4 },
  listItem: { flexDirection: 'row', marginBottom: 3, paddingLeft: 6 },
  bullet: { width: 12, fontSize: 10.5, lineHeight: 1.6 },
  listText: { flex: 1, fontSize: 10.5, lineHeight: 1.6, color: '#1F2937' },
  hr: { borderTopWidth: 1, borderTopColor: '#D1D5DB', marginVertical: 10 },
})

/** Helvetica: uma fonte por combinação de negrito/itálico */
const FONT = { '00': 'Helvetica', 10: 'Helvetica-Bold', '01': 'Helvetica-Oblique', 11: 'Helvetica-BoldOblique' }

/** Remove emojis sem cortar os espaços entre os trechos */
const cleanRun = (t) => String(t ?? '').replace(/\p{Extended_Pictographic}|️|‍/gu, '')

/** Trechos com negrito, itálico e sublinhado (texto aninhado do react-pdf) */
const runs = (list, bold = false) =>
  list.map((r, k) => (
    <Text key={k} style={{ fontFamily: FONT[`${r.b || bold ? 1 : 0}${r.i ? 1 : 0}`], textDecoration: r.u ? 'underline' : 'none' }}>
      {cleanRun(r.text)}
    </Text>
  ))

/** Um bloco do texto formatado (ver contractFormat.js) */
function PdfBlock({ block: b, accent }) {
  switch (b.type) {
    case 'h1':
      return <Text style={s.h1}>{runs(b.runs, true)}</Text>
    case 'h2':
      return <Text style={[s.h2, { color: accent }]}>{runs(b.runs, true)}</Text>
    case 'center':
      return <Text style={[s.paragraph, { textAlign: 'center' }]}>{runs(b.runs)}</Text>
    case 'hr':
      return <View style={s.hr} />
    case 'list':
      return (
        <View style={{ marginBottom: 8 }}>
          {b.items.map((it, k) => (
            <View key={k} style={s.listItem} wrap={false}>
              <Text style={s.bullet}>•</Text>
              <Text style={s.listText}>{runs(it)}</Text>
            </View>
          ))}
        </View>
      )
    default:
      return (
        <Text style={s.paragraph}>
          {b.lines.map((line, k) => (
            <Text key={k}>
              {k > 0 ? '\n' : ''}
              {runs(line)}
            </Text>
          ))}
        </Text>
      )
  }
}


/**
 * Contrato em PDF (A4, várias páginas).
 * @param {{ model: ReturnType<typeof import('./contractModel').buildContractModel>, logoDataUrl?: string|null, signatureDataUrl?: string|null }} props
 */
export function ContractDocument({ model: m, logoDataUrl, signatureDataUrl }) {
  const { accent, accentText, accentTint, accentSoft, accentDeep } = m.colors
  const modern = m.cfg.estilo !== 'classico'
  const headerStyle = modern
    ? { backgroundColor: accent, color: accentText }
    : { backgroundColor: '#FFFFFF', color: INK, borderBottomWidth: 3, borderBottomColor: accent, borderRadius: 0 }
  const subColor = modern ? accentText : MUTED

  return (
    <Document title={`${clean(m.titulo)} - ${m.contratante.nome}`} author={m.academia.nome} subject="Contrato">
      <Page size="A4" style={s.page} wrap>
        <View style={[s.header, headerStyle]}>
          {m.logoCompleta && logoDataUrl ? (
            <View style={{ flexShrink: 1 }}>
              <View style={[s.wordmark, !modern && { borderWidth: 1, borderColor: LINE }]}>
                <Image src={logoDataUrl} style={s.wordmarkImg} />
              </View>
              {m.academia.cnpj ? <Text style={[s.brandSub, { color: subColor, marginTop: 4 }]}>{m.academia.cnpj}</Text> : null}
            </View>
          ) : (
          <View style={s.brand}>
            <View style={[s.logo, !modern && { borderWidth: 1, borderColor: LINE }]}>
              {logoDataUrl ? <Image src={logoDataUrl} style={s.logoImg} /> : <Text style={[s.initials, { color: accent }]}>{m.academia.iniciais}</Text>}
            </View>
            <View style={{ flexShrink: 1 }}>
              <Text style={s.brandName}>{m.academia.nome}</Text>
              {m.academia.cnpj ? <Text style={[s.brandSub, { color: subColor }]}>{m.academia.cnpj}</Text> : null}
            </View>
          </View>
          )}
          <View>
            <Text style={[s.docLabel, { color: subColor }]}>Contrato</Text>
            <Text style={[s.docCode, !modern && { color: accentDeep }]}>{m.codigo.slice(0, 9)}</Text>
          </View>
        </View>

        {!m.temCabecalho ? <Text style={s.title}>{clean(m.titulo)}</Text> : null}
        {m.blocos.map((b, i) => (
          <PdfBlock key={i} block={b} accent={accentDeep} />
        ))}

        <View style={[s.acceptance, { backgroundColor: accentTint, borderColor: accentSoft }]} wrap={false}>
          <View style={{ flexShrink: 1 }}>
            {m.aceite ? (
              <>
                <Text style={s.accTitle}>Aceito eletronicamente</Text>
                <Text style={s.accText}>
                  Por {m.aceite.nome}
                  {m.aceite.cpf ? `, CPF ${m.aceite.cpf}` : ''}, em {m.aceite.em}, a partir do endereço IP {m.aceite.ip}, mediante login pessoal {m.textos.via}.
                </Text>
              </>
            ) : (
              <>
                <Text style={s.accTitle}>{m.status === 'cancelado' ? 'Contrato cancelado' : m.textos.aguardando}</Text>
                <Text style={s.accText}>
                  Contratante: {m.contratante.nome}
                  {m.contratante.doc ? `, ${m.contratante.doc}` : ''}
                </Text>
              </>
            )}
          </View>
        </View>

        <View style={s.signRow} wrap={false}>
          <Text style={s.place}>Emitido em {m.emitidoEm}</Text>
          <View style={s.signature}>
            {signatureDataUrl ? (
              <View style={s.signMark}>
                <Image src={signatureDataUrl} style={s.signImage} />
              </View>
            ) : m.assinatura.cursiva && isSignatureFontRegistered() ? (
              <View style={s.signMark}>
                <Text style={[s.signCursive, { fontSize: 26 * m.assinatura.cursivaEscala }]}>{clean(m.assinatura.cursiva)}</Text>
              </View>
            ) : null}
            <View style={s.signLine} />
            <Text style={s.signName}>{m.assinatura.nome}</Text>
            {m.assinatura.cargo ? <Text style={s.signRole}>{m.assinatura.cargo}</Text> : null}
          </View>
        </View>

        <View style={s.footer} fixed>
          {m.academia.rodape ? <Text style={s.footerText}>{m.academia.rodape}</Text> : null}
          <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) => `Código de verificação ${m.codigo} · Documento eletrônico · Página ${pageNumber} de ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  )
}
