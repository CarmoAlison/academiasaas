import { useQuery } from '@tanstack/react-query'
import { Copy, Download, ImagePlus, Info, PenLine, RotateCcw, Save, Trash2, UserRound } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { buildContractModel } from '../../../components/contract/contractModel'
import ContractView from '../../../components/contract/ContractView'
import { PageLoader } from '../../../components/feedback/FullPageLoader'
import QueryError from '../../../components/feedback/QueryError'
import { downloadBlob, generateContractPdf } from '../../../components/receipt/pdfExport'
import styles from '../../../components/receipt/ReceiptCustomizer.module.css'
import { Button, Card, FormGrid, FullRow, Input, PageHeader, Textarea, useConfirm, useToast } from '../../../components/ui'
import { useAuth } from '../../../hooks/useAuth'
import { useForm } from '../../../hooks/useForm'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { uploadReceiptImage } from '../../../services/receiptService'
import {
  SAAS_CONTRACT_DEFAULTS,
  SAAS_CONTRACT_VARIABLES,
  defaultSaasContractText,
  fillSampleVariables,
  getSaasContractSettings,
  saveSaasContractSettings,
} from '../../../services/saasContractService'
import { isHexColor } from '../../../utils/color'
import { formatCNPJ } from '../../../utils/formatters'
import { errorMessage } from '../../../utils/errors'

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
const TITULO_PADRAO = 'Contrato de licença de uso do sistema'
const TEXTO_ID = 'contrato-saas-texto'

const toForm = (cfg) => {
  const merged = { ...SAAS_CONTRACT_DEFAULTS, ...(cfg ?? {}) }
  return Object.fromEntries(Object.keys(SAAS_CONTRACT_DEFAULTS).map((k) => [k, merged[k] ?? '']))
}

/** Dados de exemplo no formato de get_saas_contract */
function sampleData(values, dados, textoPadrao) {
  const texto = values.texto?.trim() ? values.texto : textoPadrao
  return {
    tipo: 'saas',
    contrato: {
      id: '00000000-exemplo',
      titulo: values.titulo?.trim() || TITULO_PADRAO,
      // seus dados (Configurações) entram de verdade; os da academia são de exemplo
      conteudo: fillSampleVariables(texto, {
        empresa: dados.nome,
        empresa_cnpj: dados.cnpj ? formatCNPJ(String(dados.cnpj).replace(/\D/g, '')) : '',
        cidade: dados.cidade,
      }),
      status: 'pendente',
      hash: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
      created_at: new Date().toISOString(),
    },
    contratante: { nome: 'Academia Exemplo', cnpj: '11444777000161' },
    academia: { nome: dados.nome || 'Sua empresa', cnpj: (dados.cnpj ?? '').replace(/\D/g, '') || null, email: dados.email_suporte, telefone: dados.telefone },
    unidade: { endereco: dados.endereco, cidade: dados.cidade, estado: dados.estado, cep: dados.cep },
    config: values,
  }
}

function Editor({ settings, dados, textoPadrao }) {
  const toast = useToast()
  const { context } = useAuth()
  const meName = context?.super_admin?.nome
  const [confirm, confirmDialog] = useConfirm()
  const logoRef = useRef(null)
  const signatureRef = useRef(null)
  const [uploading, setUploading] = useState(null)
  const [exporting, setExporting] = useState(false)

  const { field, values, setValue, handleSubmit, reset } = useForm(toForm(settings), {
    cor: [(v) => (!isHexColor(v) ? 'Cor inválida (use #RRGGBB)' : undefined)],
  })
  useEffect(() => reset(toForm(settings)), [settings, reset])

  const save = useMutationToast(saveSaasContractSettings, {
    success: 'Modelo do contrato salvo. Vale para os próximos contratos gerados.',
    invalidate: [['saas-contract-settings'], ['saas-settings']],
  })

  const model = useMemo(() => buildContractModel(sampleData(values, dados, textoPadrao)), [values, dados, textoPadrao])

  /** Insere a variável onde está o cursor no texto */
  const inserir = (key) => {
    const token = `{${key}}`
    const base = values.texto?.trim() ? values.texto : textoPadrao
    const el = document.getElementById(TEXTO_ID)
    const ini = el && values.texto ? el.selectionStart : base.length
    const fim = el && values.texto ? el.selectionEnd : base.length
    setValue('texto', base.slice(0, ini) + token + base.slice(fim))
    requestAnimationFrame(() => {
      const t = document.getElementById(TEXTO_ID)
      t?.focus()
      t?.setSelectionRange(ini + token.length, ini + token.length)
    })
  }

  const onImage = (kind, fieldName) => async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(kind)
    try {
      setValue(fieldName, await uploadReceiptImage('saas', file, kind))
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setUploading(null)
    }
  }

  const onExample = async () => {
    setExporting(true)
    try {
      downloadBlob(await generateContractPdf(model), 'contrato-exemplo.pdf')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setExporting(false)
    }
  }

  const onRestore = async () => {
    if (await confirm({ title: 'Restaurar padrão', message: 'Texto, visual e assinatura voltarão ao padrão (clique em Salvar para aplicar).' })) {
      reset(toForm(null))
    }
  }

  return (
    <>
      {confirmDialog}
      <div className={styles.layout}>
        <form className={styles.form} onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
          <Card title="Texto do contrato">
            <FormGrid columns={1}>
              <Input label="Título" placeholder={TITULO_PADRAO} {...field('titulo')} />
              <FullRow>
                <span className={styles.fieldLabel} style={{ marginTop: 0 }}>
                  Variáveis — clique para inserir onde está o cursor
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {SAAS_CONTRACT_VARIABLES.map((v) => (
                    <Button key={v.key} type="button" size="sm" variant="outline" title={`${v.label} — ex.: ${v.exemplo}`} onClick={() => inserir(v.key)}>
                      {`{${v.key}}`}
                    </Button>
                  ))}
                </div>
                <Textarea
                  id={TEXTO_ID}
                  label="Texto"
                  rows={18}
                  placeholder="Deixe em branco para usar o modelo padrão"
                  hint="Separe as cláusulas com uma linha em branco. Se a 1ª linha estiver em MAIÚSCULAS, ela vira o título no documento."
                  {...field('texto')}
                />
                {!values.texto && textoPadrao && (
                  <Button type="button" variant="ghost" size="sm" icon={Copy} onClick={() => setValue('texto', textoPadrao)}>
                    Começar pelo modelo padrão
                  </Button>
                )}
              </FullRow>
            </FormGrid>
          </Card>

          <Card title="Identidade visual">
            <div className={styles.logoRow}>
              <span className={styles.logoBox}>
                {model.logo ? <img src={model.logo} alt="Logo" /> : <span>{model.academia.iniciais}</span>}
              </span>
              <div className={styles.logoActions}>
                <Button variant="outline" size="sm" icon={ImagePlus} loading={uploading === 'logo'} onClick={() => logoRef.current?.click()}>
                  {values.logo_url ? 'Trocar logo' : 'Enviar logo'}
                </Button>
                {values.logo_url && (
                  <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setValue('logo_url', '')}>
                    Remover
                  </Button>
                )}
                <small className="text-muted">PNG ou JPG, até 2 MB. Fundo transparente fica melhor.</small>
              </div>
              <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onImage('logo', 'logo_url')} />
            </div>

            <span className={styles.fieldLabel}>Cor de destaque</span>
            <div className={styles.colors}>
              {PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`${styles.swatch} ${String(values.cor).toUpperCase() === c ? styles.swatchActive : ''}`}
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

          <Card title="Sua assinatura">
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
                  <Button variant="outline" size="sm" icon={PenLine} loading={uploading === 'assinatura'} onClick={() => signatureRef.current?.click()}>
                    {values.assinatura_url ? 'Trocar assinatura' : 'Enviar assinatura (PNG)'}
                  </Button>
                  {values.assinatura_url && (
                    <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setValue('assinatura_url', '')}>
                      Remover
                    </Button>
                  )}
                  <small className="text-muted">PNG com fundo transparente, até 1 MB.</small>
                </div>
                <input ref={signatureRef} type="file" accept="image/png,image/webp" hidden onChange={onImage('assinatura', 'assinatura_url')} />
              </div>
            )}

            <FormGrid columns={2}>
              <div>
                <Input
                  label={values.assinatura_modo === 'cursiva' ? 'Nome completo (em letra cursiva)' : 'Nome abaixo da linha'}
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

          <div className={styles.actions}>
            <Button variant="ghost" icon={RotateCcw} onClick={onRestore}>
              Restaurar padrão
            </Button>
            <Button variant="outline" icon={Download} loading={exporting} onClick={onExample}>
              PDF de exemplo
            </Button>
            <Button type="submit" icon={Save} loading={save.isPending}>
              Salvar
            </Button>
          </div>
        </form>

        <aside className={styles.preview} aria-label="Pré-visualização">
          <span className={styles.previewLabel}>Pré-visualização (dados de exemplo)</span>
          <div className={styles.desk}>
            <ContractView model={model} />
          </div>
        </aside>
      </div>
    </>
  )
}

/** Super Admin → Contrato: modelo do contrato que as academias assinam */
export default function ContratoSaas() {
  const query = useQuery({ queryKey: ['saas-contract-settings'], queryFn: getSaasContractSettings })
  const padrao = useQuery({ queryKey: ['saas-contract-default'], queryFn: defaultSaasContractText, staleTime: Infinity })

  return (
    <>
      <PageHeader title="Contrato" subtitle="Modelo do contrato que você envia às academias para assinatura eletrônica" />
      <p className="text-muted" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 20, fontSize: 13 }}>
        <Info size={16} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>
          Para enviar, abra a academia em <Link to="/super-admin/academias">Academias</Link> → aba <strong>Contrato</strong> → Gerar contrato. O admin da
          academia assina pelo painel dele. Seus dados (nome, CNPJ, endereço) vêm de{' '}
          <Link to="/super-admin/configuracoes">Configurações</Link>.
        </span>
      </p>
      {query.isError ? (
        <QueryError error={query.error} onRetry={query.refetch} />
      ) : query.isPending || padrao.isPending ? (
        <PageLoader />
      ) : (
        <Editor settings={query.data.contrato} dados={query.data.dados} textoPadrao={padrao.data ?? ''} />
      )}
    </>
  )
}
