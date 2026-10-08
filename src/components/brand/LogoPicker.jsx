import { ImageIcon, Moon, Sun, Upload, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { uploadReceiptImage } from '../../services/receiptService'
import { errorMessage } from '../../utils/errors'
import Button from '../ui/Button'
import { useToast } from '../ui/Toast'
import styles from './LogoPicker.module.css'

function Slot({ mode, url, folder, onChange }) {
  const toast = useToast()
  const ref = useRef(null)
  const [busy, setBusy] = useState(false)
  const dark = mode === 'dark'

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      onChange(await uploadReceiptImage(folder, file, 'logo'))
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.slot}>
      <span className={styles.slotTitle}>
        {dark ? <Moon size={14} /> : <Sun size={14} />} {dark ? 'Modo escuro' : 'Modo claro'}
      </span>
      <div className={`${styles.preview} ${dark ? styles.dark : styles.light}`}>
        {url ? <img src={url} alt={`Logo para o modo ${dark ? 'escuro' : 'claro'}`} /> : <ImageIcon size={26} />}
      </div>
      <div className={styles.actions}>
        <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onFile} />
        <Button type="button" variant="outline" size="sm" icon={Upload} loading={busy} onClick={() => ref.current?.click()}>
          {url ? 'Trocar' : 'Enviar'}
        </Button>
        {url && (
          <Button type="button" variant="ghost" size="sm" icon={X} onClick={() => onChange('')}>
            Remover
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * Duas logos: uma para o modo claro e outra para o escuro (se só uma for enviada, ela vale para os dois).
 * @param {{ light: string, dark: string, onChange: (v: { light: string, dark: string }) => void, folder: string }} props
 *   folder: id da academia ou 'saas' (Super Admin)
 */
export default function LogoPicker({ light, dark, onChange, folder }) {
  return (
    <div className={styles.root}>
      <div className={styles.slots}>
        <Slot mode="light" url={light} folder={folder} onChange={(v) => onChange({ light: v, dark })} />
        <Slot mode="dark" url={dark} folder={folder} onChange={(v) => onChange({ light, dark: v })} />
      </div>
      <p className={styles.hint}>
        Com logo enviada, o menu mostra só a logo (sem o nome e o ícone). Use PNG ou WEBP com fundo transparente, de preferência horizontal, até 2 MB.
        Se enviar só uma, ela é usada nos dois modos.
      </p>
    </div>
  )
}
