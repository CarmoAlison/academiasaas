import { useQuery } from '@tanstack/react-query'
import { Download, ImagePlus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { PageLoader } from '../../../components/feedback/FullPageLoader'
import QueryError from '../../../components/feedback/QueryError'
import { downloadBlob, generateReceiptPdf } from '../../../components/receipt/pdfExport'
import { buildReceiptModel, DEFAULT_RECEIPT_CONFIG, sampleReceiptData } from '../../../components/receipt/receiptModel'
import ReceiptView from '../../../components/receipt/ReceiptView'
import { Button, Card, FormGrid, FullRow, Input, PageHeader, Switch, Textarea, useConfirm, useToast } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { useForm } from '../../../hooks/useForm'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { unitService } from '../../../services/catalogServices'
import { getReceiptSettings, saveReceiptSettings, uploadReceiptLogo } from '../../../services/receiptService'
import { getAcademy } from '../../../services/saasService'
import { isHexColor } from '../../../utils/color'
import { errorMessage } from '../../../utils/errors'
import styles from './PersonalizarRecibo.module.css'

const PRESETS = ['#006EB8', '#0F766E', '#16A34A', '#7C3AED', '#DB2777', '#DC2626', '#EA580C', '#111827']

const STYLES = [
  { value: 'moderno', label: 'Moderno', hint: 'Cabeçalho colorido' },
  { value: 'classico', label: 'Clássico', hint: 'Cabeçalho branco com faixa' },
]

const TOGGLES = [
  ['exibir_cnpj', 'Exibir CNPJ'],
  ['exibir_endereco', 'Exibir endereço da unidade'],
  ['exibir_contato', 'Exibir telefone e e-mail'],
  ['exibir_selo', 'Exibir selo "PAGO"'],
  ['exibir_assinatura', 'Exibir linha de assinatura'],
]

const toForm = (settings) => {
  const merged = { ...DEFAULT_RECEIPT_CONFIG, ...(settings ?? {}) }
  return Object.fromEntries(Object.keys(DEFAULT_RECEIPT_CONFIG).map((k) => [k, merged[k] ?? (typeof DEFAULT_RECEIPT_CONFIG[k] === 'boolean' ? false : '')]))
}

function Editor({ settings, sample }) {
  const { academyId } = useTenant()
  const toast = useToast()
  const [confirm, confirmDialog] = useConfirm()
  const fileRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [exporting, setExporting] = useState(false)

  const { field, values, setValue, handleSubmit, reset } = useForm(toForm(settings), {
    titulo: [(v) => (!String(v).trim() ? 'Informe o título' : undefined)],
    cor: [(v) => (!isHexColor(v) ? 'Cor inválida (use #RRGGBB)' : undefined)],
  })
  useEffect(() => reset(toForm(settings)), [settings, reset])

  const model = useMemo(() => buildReceiptModel(sample, values), [sample, values])

  const mutation = useMutationToast((v) => saveReceiptSettings(academyId, v), {
    success: 'Recibo personalizado salvo. Os próximos recibos (e os já emitidos) usam este visual.',
    invalidate: [['receipt-settings', academyId], ['receipt']],
  })

  const onLogo = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      setValue('logo_url', await uploadReceiptLogo(academyId, file))
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setUploading(false)
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
        <form className={styles.form} onSubmit={handleSubmit((v) => mutation.mutate(v))} noValidate>
          <Card title="Identidade visual">
            <div className={styles.logoRow}>
              <span className={styles.logoBox}>
                {model.logo ? <img src={model.logo} alt="Logo" /> : <span>{model.academia.iniciais}</span>}
              </span>
              <div className={styles.logoActions}>
                <Button variant="outline" size="sm" icon={ImagePlus} loading={uploading} onClick={() => fileRef.current?.click()}>
                  {values.logo_url ? 'Trocar logo' : 'Enviar logo'}
                </Button>
                {values.logo_url && (
                  <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setValue('logo_url', '')}>
                    Remover
                  </Button>
                )}
                <small className="text-muted">PNG ou JPG, até 2 MB. Fundo transparente fica melhor.</small>
              </div>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onLogo} />
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
                <Textarea label="Mensagem ao aluno" rows={2} placeholder="Ex.: Obrigado por treinar conosco!" {...field('mensagem')} />
              </FullRow>
              <FullRow>
                <Textarea label="Rodapé" rows={2} placeholder="Ex.: Em caso de dúvidas, fale com a recepção." {...field('rodape')} />
              </FullRow>
              <Input label="Cidade (local de emissão)" placeholder="Padrão: cidade da unidade" {...field('cidade')} />
            </FormGrid>
          </Card>

          <Card title="Assinatura e informações">
            <FormGrid columns={2}>
              <Input label="Nome na assinatura" placeholder={`Padrão: ${model.academia.nome}`} {...field('assinatura_nome')} />
              <Input label="Cargo" {...field('assinatura_cargo')} />
            </FormGrid>
            <div className={styles.toggles}>
              {TOGGLES.map(([key, label]) => (
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
            <Button type="submit" icon={Save} loading={mutation.isPending}>
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

export default function PersonalizarRecibo() {
  const { academyId, membership } = useTenant()
  const settings = useQuery({ queryKey: ['receipt-settings', academyId], queryFn: () => getReceiptSettings(academyId) })
  const academy = useQuery({ queryKey: ['academy', academyId], queryFn: () => getAcademy(academyId) })
  const units = useQuery({ queryKey: ['units', academyId], queryFn: () => unitService.list(academyId) })

  const sample = useMemo(
    () =>
      academy.data
        ? sampleReceiptData({
            academia: academy.data,
            unidade: units.data?.[0] ?? null,
            recebidoPor: membership?.profile?.nome ?? 'Recepção',
          })
        : null,
    [academy.data, units.data, membership],
  )

  const error = settings.error || academy.error
  return (
    <>
      <PageHeader
        title="Personalizar recibo"
        subtitle="Visual do recibo enviado aos alunos após o pagamento"
        breadcrumb={[{ label: 'Financeiro', to: '/admin/financeiro' }, { label: 'Personalizar recibo' }]}
      />
      {error ? (
        <QueryError error={error} onRetry={() => Promise.all([settings.refetch(), academy.refetch()])} />
      ) : settings.isPending || !sample ? (
        <PageLoader />
      ) : (
        <Editor settings={settings.data} sample={sample} />
      )}
    </>
  )
}
