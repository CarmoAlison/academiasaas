import { Check, Copy, QrCode } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../../components/ui'
import { PIX_TIPOS, pixDisplay } from '../../../utils/cobranca'
import styles from '../client.module.css'

/** Chave PIX da academia com botão de copiar */
export default function PixBox({ settings }) {
  const [copied, setCopied] = useState(false)
  const chave = pixDisplay(settings)
  if (!chave) return null
  const tipo = PIX_TIPOS.find((t) => t.value === settings.pix_tipo)?.label

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(settings.pix_chave)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // navegador sem permissão: o aluno copia manualmente
    }
  }

  return (
    <section className={styles.tile}>
      <span className={styles.tileTitle}>
        <QrCode size={16} /> Pague com PIX
      </span>
      <span className={styles.big} style={{ fontSize: 18, overflowWrap: 'anywhere' }}>
        {chave}
      </span>
      <span className={styles.muted}>
        Chave {tipo}
        {settings.pix_favorecido ? ` · ${settings.pix_favorecido}` : ''}. Depois de pagar, envie o comprovante para a recepção.
      </span>
      <div>
        <Button size="sm" variant="secondary" icon={copied ? Check : Copy} onClick={copy}>
          {copied ? 'Copiada!' : 'Copiar chave'}
        </Button>
      </div>
    </section>
  )
}
