import { Document, Font, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'

// Sem hifenização automática (quebrava nomes: "Albu-querque")
Font.registerHyphenationCallback((word) => [word])

let signatureFontSrc = null

/** Registra a fonte cursiva da assinatura (URL no navegador ou caminho de arquivo) */
export function registerSignatureFont(src) {
  if (signatureFontSrc === src) return
  Font.register({ family: 'Assinatura', src })
  signatureFontSrc = src
}

/** Helvetica (fonte padrão do PDF) não tem emojis: remove-os */
const clean = (s) => String(s ?? '').replace(/\p{Extended_Pictographic}|️|‍/gu, '').trim()

const INK = '#111827'
const MUTED = '#6B7280'
const LINE = '#E5E7EB'

const base = StyleSheet.create({
  page: { padding: 32, fontFamily: 'Helvetica', fontSize: 10, color: INK, backgroundColor: '#FFFFFF' },
  card: { borderWidth: 1, borderColor: LINE, borderRadius: 10, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 18, paddingHorizontal: 22 },
  brand: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  logo: { width: 46, height: 46, borderRadius: 8, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  logoImg: { width: 40, height: 40, objectFit: 'contain' },
  initials: { fontFamily: 'Helvetica-Bold', fontSize: 15 },
  brandName: { fontFamily: 'Helvetica-Bold', fontSize: 14 },
  brandSub: { fontSize: 9, marginTop: 2 },
  docTitle: { alignItems: 'flex-end' },
  docLabel: { fontFamily: 'Helvetica-Bold', fontSize: 8, letterSpacing: 1.2, textTransform: 'uppercase' },
  docNumber: { fontFamily: 'Helvetica-Bold', fontSize: 17, marginTop: 2 },
  body: { paddingHorizontal: 22, paddingTop: 18 },
  amount: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 8, borderWidth: 1 },
  label: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: MUTED, letterSpacing: 0.8, textTransform: 'uppercase' },
  value: { fontFamily: 'Helvetica-Bold', fontSize: 24, marginTop: 2 },
  extenso: { fontFamily: 'Helvetica-Oblique', fontSize: 9, color: MUTED, marginTop: 2 },
  stamp: { borderWidth: 2, borderColor: '#16A34A', borderRadius: 6, paddingVertical: 4, paddingHorizontal: 10, transform: 'rotate(-6deg)' },
  stampText: { fontFamily: 'Helvetica-Bold', fontSize: 12, color: '#16A34A', letterSpacing: 2 },
  statement: { fontSize: 11, lineHeight: 1.55, marginVertical: 14, color: '#1F2937' },
  bold: { fontFamily: 'Helvetica-Bold' },
  details: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: 1, borderColor: LINE, borderRadius: 8, marginBottom: 14 },
  detail: { width: '50%', paddingVertical: 8, paddingHorizontal: 11, borderColor: LINE },
  detailLabel: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: MUTED, letterSpacing: 0.6, textTransform: 'uppercase' },
  detailValue: { fontSize: 10.5, marginTop: 2 },
  message: { borderLeftWidth: 3, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 14, fontFamily: 'Helvetica-Oblique', fontSize: 10.5, color: '#1F2937' },
  signRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingTop: 16, paddingBottom: 18 },
  place: { fontSize: 9.5, color: MUTED },
  signature: { width: 200, alignItems: 'center' },
  signMark: { height: 44, width: '100%', alignItems: 'center', justifyContent: 'flex-end', marginBottom: -4 },
  signImage: { maxWidth: 170, maxHeight: 44, objectFit: 'contain' },
  signCursive: { fontFamily: 'Assinatura', fontSize: 26, color: '#1E3A8A' },
  signLine: { width: '100%', borderTopWidth: 1, borderTopColor: '#9CA3AF', marginBottom: 4 },
  signName: { fontFamily: 'Helvetica-Bold', fontSize: 10 },
  signRole: { fontSize: 8.5, color: MUTED },
  footer: { paddingVertical: 11, paddingHorizontal: 22, backgroundColor: '#FAFAFA', borderTopWidth: 1, borderTopColor: LINE, borderTopStyle: 'dashed' },
  footerText: { fontSize: 8, color: MUTED, textAlign: 'center', marginTop: 2 },
  code: { fontFamily: 'Courier-Bold', color: INK },
})

/**
 * Recibo em PDF (A4).
 * @param {{ model: ReturnType<typeof import('./receiptModel').buildReceiptModel>, logoDataUrl?: string|null, signatureDataUrl?: string|null }} props
 *   Para o modo cursivo, chame registerSignatureFont() antes de renderizar.
 */
export function ReceiptDocument({ model: m, logoDataUrl, signatureDataUrl }) {
  const { accent, accentText, accentTint, accentSoft, accentDeep } = m.colors
  const modern = m.cfg.estilo !== 'classico'
  const headerStyle = modern
    ? { backgroundColor: accent, color: accentText }
    : { backgroundColor: '#FFFFFF', color: INK, borderBottomWidth: 3, borderBottomColor: accent }
  const subColor = modern ? accentText : MUTED

  return (
    <Document title={`Recibo ${m.numero} - ${m.academia.nome}`} author={m.academia.nome} subject={clean(m.cfg.titulo)}>
      <Page size="A4" style={base.page}>
        <View style={base.card}>
          <View style={[base.header, headerStyle]}>
            <View style={base.brand}>
              <View style={[base.logo, !modern && { borderWidth: 1, borderColor: LINE }]}>
                {logoDataUrl ? (
                  <Image src={logoDataUrl} style={base.logoImg} />
                ) : (
                  <Text style={[base.initials, { color: accent }]}>{m.academia.iniciais}</Text>
                )}
              </View>
              <View style={{ flexShrink: 1 }}>
                <Text style={base.brandName}>{m.academia.nome}</Text>
                {m.academia.cnpj ? <Text style={[base.brandSub, { color: subColor }]}>{m.academia.cnpj}</Text> : null}
              </View>
            </View>
            <View style={base.docTitle}>
              <Text style={[base.docLabel, { color: subColor }]}>{clean(m.cfg.titulo)}</Text>
              <Text style={[base.docNumber, !modern && { color: accentDeep }]}>Nº {m.numero}</Text>
            </View>
          </View>

          <View style={base.body}>
            <View style={[base.amount, { backgroundColor: accentTint, borderColor: accentSoft }]}>
              <View style={{ flexShrink: 1 }}>
                <Text style={base.label}>Valor recebido</Text>
                <Text style={[base.value, { color: accentDeep }]}>{m.valor}</Text>
                <Text style={base.extenso}>({m.valorExtenso})</Text>
              </View>
              {m.cfg.exibir_selo ? (
                <View style={base.stamp}>
                  <Text style={base.stampText}>PAGO</Text>
                </View>
              ) : null}
            </View>

            <Text style={base.statement}>
              Recebemos de <Text style={base.bold}>{m.aluno.nome}</Text>
              {m.aluno.documento ? `, ${m.aluno.documento}` : ''}, a importância de <Text style={base.bold}>{m.valor}</Text> (
              {m.valorExtenso}), referente a <Text style={base.bold}>{m.referencia}</Text>, dando plena e total quitação.
            </Text>

            <View style={base.details}>
              {m.detalhes.map(([label, value], i) => (
                <View
                  key={label}
                  style={[base.detail, { borderRightWidth: i % 2 === 0 ? 1 : 0, borderBottomWidth: i < m.detalhes.length - 2 ? 1 : 0 }]}
                >
                  <Text style={base.detailLabel}>{label}</Text>
                  <Text style={base.detailValue}>{value}</Text>
                </View>
              ))}
            </View>

            {clean(m.cfg.mensagem) ? (
              <Text style={[base.message, { borderLeftColor: accent, backgroundColor: accentTint }]}>{clean(m.cfg.mensagem)}</Text>
            ) : null}

            <View style={base.signRow}>
              <Text style={base.place}>{m.localData}</Text>
              {m.assinatura.exibir ? (
                <View style={base.signature}>
                  {signatureDataUrl ? (
                    <View style={base.signMark}>
                      <Image src={signatureDataUrl} style={base.signImage} />
                    </View>
                  ) : m.assinatura.cursiva && signatureFontSrc ? (
                    <View style={base.signMark}>
                      <Text style={[base.signCursive, { fontSize: 26 * m.assinatura.cursivaEscala }]}>{clean(m.assinatura.cursiva)}</Text>
                    </View>
                  ) : null}
                  <View style={base.signLine} />
                  <Text style={base.signName}>{m.assinatura.nome}</Text>
                  {m.assinatura.cargo ? <Text style={base.signRole}>{m.assinatura.cargo}</Text> : null}
                </View>
              ) : null}
            </View>
          </View>

          <View style={base.footer}>
            {m.academia.endereco || m.academia.contato ? (
              <Text style={base.footerText}>{[m.academia.endereco, m.academia.contato].filter(Boolean).join(' · ')}</Text>
            ) : null}
            {clean(m.cfg.rodape) ? <Text style={base.footerText}>{clean(m.cfg.rodape)}</Text> : null}
            <Text style={base.footerText}>
              Código de autenticidade <Text style={base.code}>{m.codigo}</Text> · Documento gerado eletronicamente
            </Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}
