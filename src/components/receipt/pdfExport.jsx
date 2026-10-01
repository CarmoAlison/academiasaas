import { SIGNATURE_FONT_PATH } from './receiptModel'

/**
 * Converte uma imagem (URL pública) em PNG data URL para embutir no PDF, mantendo a transparência.
 * Aceita PNG/JPG/WEBP; se falhar (CORS, formato), retorna null e o PDF sai sem a imagem
 * (logo → iniciais; assinatura → só a linha).
 * @param {string|null} url
 * @param {number} maxSize maior lado em pixels
 */
async function imageToDataUrl(url, maxSize) {
  if (!url) return null
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = url
    await img.decode()
    const size = maxSize
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
  const [{ pdf }, { ReceiptDocument, registerSignatureFont }, logoDataUrl, signatureDataUrl] = await Promise.all([
    import('@react-pdf/renderer'),
    import('./ReceiptPdf'),
    imageToDataUrl(model.logo, 256),
    imageToDataUrl(model.assinatura.imagem, 600), // maior resolução: traço fino da assinatura
  ])
  if (model.assinatura.cursiva) registerSignatureFont(`${window.location.origin}${SIGNATURE_FONT_PATH}`)
  return pdf(<ReceiptDocument model={model} logoDataUrl={logoDataUrl} signatureDataUrl={signatureDataUrl} />).toBlob()
}

/**
 * Gera o PDF do contrato (mesmo visual do recibo).
 * @param {ReturnType<typeof import('../contract/contractModel').buildContractModel>} model
 * @returns {Promise<Blob>}
 */
export async function generateContractPdf(model) {
  const [{ pdf }, { ContractDocument }, { registerSignatureFont }, logoDataUrl, signatureDataUrl] = await Promise.all([
    import('@react-pdf/renderer'),
    import('../contract/ContractPdf'),
    import('./ReceiptPdf'),
    imageToDataUrl(model.logo, 256),
    imageToDataUrl(model.assinatura.imagem, 600),
  ])
  if (model.assinatura.cursiva) registerSignatureFont(`${window.location.origin}${SIGNATURE_FONT_PATH}`)
  return pdf(<ContractDocument model={model} logoDataUrl={logoDataUrl} signatureDataUrl={signatureDataUrl} />).toBlob()
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
