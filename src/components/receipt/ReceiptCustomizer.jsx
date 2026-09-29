import { Download, ImagePlus, PenLine, RotateCcw, Save, Trash2, UserRound } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from '../../hooks/useForm'
import { isHexColor } from '../../utils/color'
import { errorMessage } from '../../utils/errors'
import Button from '../ui/Button'
import Card from '../ui/Card'
import { useConfirm } from '../ui/ConfirmDialog'
import FormGrid, { FullRow } from '../ui/FormGrid'
import Input from '../ui/Input'
import Switch from '../ui/Switch'
import Textarea from '../ui/Textarea'
import { useToast } from '../ui/Toast'
import { downloadBlob, generateReceiptPdf } from './pdfExport'
import styles from './ReceiptCustomizer.module.css'
import { buildReceiptModel, DEFAULT_RECEIPT_CONFIG } from './receiptModel'
import ReceiptView from './ReceiptView'

const PRESETS = ['#006EB8', '#0F766E', '#16A34A', '#7C3AED', '#DB2777', '#DC2626', '#EA580C', '#111827']

const STYLES = [
  { value: 'moderno', label: 'Moderno', hint: 'Cabeçalho colorido' },
  { value: 'classico', label: 'Clássico', hint: 'Cabeçalho branco com faixa' },
]

const SIGNATURE_MODES = [
  { value: 'linha', label: 'Só a linha', hint: 'Para assinar à mão' },
  { value: 'imagem', label: 'Imagem', hint: 'Assinatura em PNG' },
  { value: 'cursiva', label: 'Nome cursivo', hint: 'Nome em letra de mão' },
]

const toForm = (settings) => {
  const merged = { ...DEFAULT_RECEIPT_CONFIG, ...(settings ?? {}) }
  return Object.fromEntries(
    Object.keys(DEFAULT_RECEIPT_CONFIG).map((k) => [k, merged[k] ?? (typeof DEFAULT_RECEIPT_CONFIG[k] === 'boolean' ? false : '')]),
  )
}

/**
 * Editor de personalização do recibo com pré-visualização ao vivo.
 * Usado pelo Admin da academia (recibo do aluno) e pelo Super Admin (recibo da assinatura SaaS).
 *
 * @param {object} props
 * @param {object|null} props.settings personalização salva (null = padrão)
 * @param {object} props.sample dados de exemplo para a pré-visualização (formato de get_receipt)
 * @param {(values: object) => void} props.onSave
 * @param {boolean} props.saving
 * @param {(file: File, kind: 'logo'|'assinatura') => Promise<string>} props.onUpload retorna a URL pública
 * @param {string} [props.meName] nome do usuário logado (botão "Usar meu nome")
 * @param {{ mensagem?: string, mensagemPlaceholder?: string, rodapePlaceholder?: string, cidadePlaceholder?: string, endereco?: string }} [props.labels]
 */
export default function ReceiptCustomizer({ settings, sample, onSave, saving, onUpload, meName, labels = {} }) {
  const toast = useToast()
  const [confirm, confirmDialog] = useConfirm()
  const fileRef = useRef(null)
  const signatureRef = useRef(null)
  const [uploading, setUploading] = useState(null) // 'logo' | 'assinatura'
  const [exporting, setExporting] = useState(false)

  const { field, values, setValue, handleSubmit, reset } = useForm(toForm(settings), {
    titulo: [(v) => (!String(v).trim() ? 'Informe o título' : undefined)],
    cor: [(v) => (!isHexColor(v) ? 'Cor inválida (use #RRGGBB)' : undefined)],
  })
  useEffect(() => reset(toForm(settings)), [settings, reset])

  const model = useMemo(() => buildReceiptModel(sample, values), [sample, values])

  const toggles = [
    ['exibir_cnpj', 'Exibir CNPJ'],
    ['exibir_endereco', labels.endereco ?? 'Exibir endereço da unidade'],
    ['exibir_contato', 'Exibir telefone e e-mail'],
    ['exibir_selo', 'Exibir selo "PAGO"'],
    ['exibir_assinatura', 'Exibir linha de assinatura'],
  ]

  /** Upload de imagem (logo ou assinatura) → grava a URL no campo do formulário */
  const onImage = (kind, fieldName) => async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(kind)
    try {
      setValue(fieldName, await onUpload(file, kind))
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setUploading(null)
    }
  }

  const onExample = async () => {
    setExporting(true)
    try {
      downloadBlob(await generateReceiptPdf(model), 'recibo-exemplo.pdf')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setExporting(false)
    }
  }

  const onRestore = async () => {
    if (await confirm({ title: 'Restaurar padrão', message: 'Todas as personalizações voltarão ao padrão (clique em Salvar para aplicar).' })) {
      reset(toForm(null))
    }
  }

  return (
    <>
      {confirmDialog}
      <div className={styles.layout}>
        <form className={styles.form} onSubmit={handleSubmit(onSave)} noValidate>
          <Card title="Identidade visual">
            <div className={styles.logoRow}>
              <span className={styles.logoBox}>
                {model.logo ? <img src={model.logo} alt="Logo" /> : <span>{model.academia.iniciais}</span>}
              </span>
              <div className={styles.logoActions}>
                <Button variant="outline" size="sm" icon={ImagePlus} loading={uploading === 'logo'} onClick={() => fileRef.current?.click()}>
                  {values.logo_url ? 'Trocar logo' : 'Enviar logo'}
                </Button>
                {values.logo_url && (
                  <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setValue('logo_url', '')}>
                    Remover
                  </Button>
                )}
                <small className="text-muted">PNG ou JPG, até 2 MB. Fundo transparente fica melhor.</small>
              </div>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onImage('logo', 'logo_url')} />
            </div>

            <span className={styles.fieldLabel}>Cor de destaque</span>
            <div className={styles.colors}>
              {PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`${styles.swatch} ${values.cor.toUpperCase() === c ? styles.swatchActive : ''}`}
                  style={{ background: c }}
                  onClick={() => setValue('cor', c)}
                  aria-label={`Cor ${c}`}
                />
              ))}
              <label className={styles.customColor} title="Escolher outra cor">
                <input type="color" value={isHexColor(values.cor) ? values.cor : '#006EB8'} onChange={(e) => setValue('cor', e.target.value.toUpperCase())} />
              </label>
              <Input aria-label="Cor em hexadecimal" className={styles.hex} {...field('cor')} />
            </div>

            <span className={styles.fieldLabel}>Estilo</span>
            <div className={styles.styleOptions}>
              {STYLES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className={`${styles.styleOption} ${values.estilo === s.value ? styles.styleActive : ''}`}
                  onClick={() => setValue('estilo', s.value)}
                  aria-pressed={values.estilo === s.value}
                >
                  <span className={`${styles.styleThumb} ${styles[s.value]}`} style={{ '--c': values.cor }} />
                  <strong>{s.label}</strong>
                  <small>{s.hint}</small>
                </button>
              ))}
            </div>
          </Card>

          <Card title="Textos">
            <FormGrid columns={2}>
              <FullRow>
                <Input label="Título" required {...field('titulo')} />
              </FullRow>
              <FullRow>
                <Textarea
                  label={labels.mensagem ?? 'Mensagem ao aluno'}
                  rows={2}
                  placeholder={labels.mensagemPlaceholder ?? 'Ex.: Obrigado por treinar conosco!'}
                  {...field('mensagem')}
                />
              </FullRow>
              <FullRow>
                <Textarea
                  label="Rodapé"
                  rows={2}
                  placeholder={labels.rodapePlaceholder ?? 'Ex.: Em caso de dúvidas, fale com a recepção.'}
                  {...field('rodape')}
                />
              </FullRow>
              <Input
                label="Cidade (local de emissão)"
                placeholder={labels.cidadePlaceholder ?? 'Padrão: cidade da unidade'}
                {...field('cidade')}
              />
            </FormGrid>
          </Card>

          <Card title="Assinatura">
            <span className={styles.fieldLabel} style={{ marginTop: 0 }}>
              Acima da linha
            </span>
            <div className={styles.sigOptions} role="radiogroup" aria-label="Tipo de assinatura">
              {SIGNATURE_MODES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  role="radio"
                  aria-checked={values.assinatura_modo === s.value}
                  className={`${styles.styleOption} ${values.assinatura_modo === s.value ? styles.styleActive : ''}`}
                  onClick={() => setValue('assinatura_modo', s.value)}
                >
                  <strong>{s.label}</strong>
                  <small>{s.hint}</small>
                </button>
              ))}
            </div>

            {values.assinatura_modo === 'imagem' && (
              <div className={styles.sigUpload}>
                <span className={styles.sigBox}>
                  {values.assinatura_url ? <img src={values.assinatura_url} alt="Assinatura" /> : <small>Nenhuma imagem</small>}
                </span>
                <div className={styles.logoActions}>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={PenLine}
                    loading={uploading === 'assinatura'}
                    onClick={() => signatureRef.current?.click()}
                  >
                    {values.assinatura_url ? 'Trocar assinatura' : 'Enviar assinatura (PNG)'}
                  </Button>
                  {values.assinatura_url && (
                    <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setValue('assinatura_url', '')}>
                      Remover
                    </Button>
                  )}
                  <small className="text-muted">
                    PNG com fundo transparente, até 1 MB. Dica: assine em papel branco, fotografe e remova o fundo da imagem.
                  </small>
                </div>
                <input ref={signatureRef} type="file" accept="image/png,image/webp" hidden onChange={onImage('assinatura', 'assinatura_url')} />
              </div>
            )}

            <FormGrid columns={2}>
              <div>
                <Input
                  label={values.assinatura_modo === 'cursiva' ? 'Nome completo (aparece em letra cursiva)' : 'Nome abaixo da linha'}
                  placeholder={`Padrão: ${model.academia.nome}`}
                  {...field('assinatura_nome')}
                />
                {meName && values.assinatura_nome !== meName && (
                  <Button variant="ghost" size="sm" icon={UserRound} onClick={() => setValue('assinatura_nome', meName)}>
                    Usar meu nome
                  </Button>
                )}
              </div>
              <Input label="Cargo" {...field('assinatura_cargo')} />
            </FormGrid>
          </Card>

          <Card title="Informações exibidas">
            <div className={styles.toggles} style={{ marginTop: 0 }}>
              {toggles.map(([key, label]) => (
                <Switch key={key} label={label} checked={Boolean(values[key])} onChange={(v) => setValue(key, v)} />
              ))}
            </div>
          </Card>

          <div className={styles.actions}>
            <Button variant="ghost" icon={RotateCcw} onClick={onRestore}>
              Restaurar padrão
            </Button>
            <Button variant="outline" icon={Download} loading={exporting} onClick={onExample}>
              PDF de exemplo
            </Button>
            <Button type="submit" icon={Save} loading={saving}>
              Salvar
            </Button>
          </div>
        </form>

        <aside className={styles.preview} aria-label="Pré-visualização">
          <span className={styles.previewLabel}>Pré-visualização (dados de exemplo)</span>
          <div className={styles.desk}>
            <ReceiptView model={model} />
          </div>
        </aside>
      </div>
    </>
  )
}
