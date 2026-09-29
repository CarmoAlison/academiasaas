/**
 * Converte a logo (URL pública) em PNG data URL para embutir no PDF.
 * Aceita PNG/JPG/WEBP; se falhar (CORS, formato), o PDF sai com as iniciais.
 */
async function logoToDataUrl(url) {
  if (!url) return null
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = url
    await img.decode()
    const size = 256
    const scale = Math.min(size / img.naturalWidth, size / img.naturalHeight, 1)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

/**
 * Gera o PDF do recibo (carrega @react-pdf/renderer sob demanda).
 * @param {ReturnType<typeof import('./receiptModel').buildReceiptModel>} model
 * @returns {Promise<Blob>}
 */
export async function generateReceiptPdf(model) {
  const [{ pdf }, { ReceiptDocument }, logoDataUrl] = await Promise.all([
    import('@react-pdf/renderer'),
    import('./ReceiptPdf'),
    logoToDataUrl(model.logo),
  ])
  return pdf(<ReceiptDocument model={model} logoDataUrl={logoDataUrl} />).toBlob()
}

/** Baixa o blob como arquivo */
export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Compartilhamento nativo (celular: WhatsApp, e-mail…) quando suportado */
export function canShareFiles() {
  try {
    return Boolean(navigator.canShare?.({ files: [new File([''], 'x.pdf', { type: 'application/pdf' })] }))
  } catch {
    return false
  }
}
