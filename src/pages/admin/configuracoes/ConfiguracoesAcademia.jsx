import { useQuery } from '@tanstack/react-query'
import { Copy, ImageIcon, RotateCcw, Save, Upload, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { PageLoader } from '../../../components/feedback/FullPageLoader'
import QueryError from '../../../components/feedback/QueryError'
import { Button, Card, FormActions, FormGrid, FormSection, FullRow, Input, PageHeader, Switch, Textarea, useToast } from '../../../components/ui'
import { useAuth, useTenant } from '../../../hooks/useAuth'
import { useForm } from '../../../hooks/useForm'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { getAcademySettings, saveAcademySettings } from '../../../services/academySettingsService'
import { CONTRACT_VARIABLES, defaultContractText } from '../../../services/contractService'
import { uploadReceiptImage } from '../../../services/receiptService'
import { isHexColor, readableOn, tint } from '../../../utils/color'
import { errorMessage } from '../../../utils/errors'
import { rules } from '../../../utils/validators'
import { DEFAULT_TEMPLATES, TEMPLATE_KEYS, TEMPLATE_VARIABLES } from '../../../utils/whatsapp'
import styles from './Configuracoes.module.css'

const DEFAULT_COLOR = '#006EB8'
const SWATCHES = ['#006EB8', '#16A34A', '#DC2626', '#EA580C', '#7C3AED', '#DB2777', '#0F766E', '#111827']

const range = (min, max, { optional = false } = {}) => (v) => {
  if (optional && (v === '' || v === null || v === undefined)) return undefined
  const n = Number(v)
  if (v === '' || Number.isNaN(n) || !Number.isInteger(n)) return 'Informe um número inteiro'
  if (n < min || n > max) return `Entre ${min} e ${max}`
  return undefined
}

const NUMBER_FIELDS = ['dias_tolerancia', 'aulas_cancelamento_horas', 'aulas_limite_semana', 'dias_sumido', 'whatsapp_dias_lembrete']

const TEMPLATE_LABELS = {
  lembrete: 'Lembrete antes do vencimento',
  atraso: 'Aviso de mensalidade em atraso',
  recibo: 'Envio do recibo',
  sumido: 'Aluno sumido',
}

function SettingsForm({ initial }) {
  const { academyId } = useTenant()
  // campos vazios no formulário ('' em vez de null)
  const formInitial = useMemo(() => Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, v ?? ''])), [initial])
  const { field, values, setValue, handleSubmit, reset } = useForm(formInitial, {
    dias_tolerancia: [rules.required(), range(0, 90)],
    aulas_cancelamento_horas: [range(0, 72)],
    aulas_limite_semana: [range(1, 50, { optional: true })],
    dias_sumido: [range(3, 120)],
    whatsapp_dias_lembrete: [range(0, 15)],
    cor_primaria: [(v) => (v && !isHexColor(v) ? 'Use o formato #RRGGBB' : undefined)],
  })
  useEffect(() => reset(formInitial), [formInitial, reset])

  const { refresh } = useAuth()
  const toast = useToast()
  const logoRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const defaultText = useQuery({ queryKey: ['default-contract'], queryFn: defaultContractText, staleTime: Infinity })

  const mutation = useMutationToast(
    (v) => {
      const payload = { ...v }
      for (const k of NUMBER_FIELDS) payload[k] = v[k] === '' ? null : Number(v[k])
      for (const k of [...Object.values(TEMPLATE_KEYS), 'contrato_titulo', 'contrato_texto', 'logo_url']) payload[k] = v[k]?.trim() || null
      payload.cor_primaria = isHexColor(v.cor_primaria) ? v.cor_primaria.toUpperCase() : null
      return saveAcademySettings(academyId, payload)
    },
    {
      success: 'Configurações salvas',
      invalidate: [['academy-settings', academyId], ['students', academyId], ['admin-dashboard', academyId], ['onboarding', academyId]],
      // logo novo aparece no menu e na troca de academia
      onSuccess: () => refresh?.(),
    },
  )

  const onLogo = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      setValue('logo_url', await uploadReceiptImage(academyId, file, 'logo'))
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setUploading(false)
    }
  }
  const cor = isHexColor(values.cor_primaria) ? values.cor_primaria : DEFAULT_COLOR

  return (
    <form onSubmit={handleSubmit((v) => mutation.mutate(v))} noValidate>
      <FormSection
        title="Identidade visual"
        description="Logo e cor da academia aplicados no sistema da equipe e na área do aluno (claro e escuro)."
      >
        <div className={styles.identity}>
          <div className={styles.logoBox}>
            {values.logo_url ? <img src={values.logo_url} alt="Logo da academia" /> : <ImageIcon size={28} />}
          </div>
          <div className={styles.identityActions}>
            <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onLogo} />
            <Button type="button" variant="outline" size="sm" icon={Upload} loading={uploading} onClick={() => logoRef.current?.click()}>
              {values.logo_url ? 'Trocar logo' : 'Enviar logo'}
            </Button>
            {values.logo_url && (
              <Button type="button" variant="ghost" size="sm" icon={X} onClick={() => setValue('logo_url', '')}>
                Remover
              </Button>
            )}
            <span className="text-muted" style={{ fontSize: 12 }}>
              PNG, JPG ou WEBP de até 2 MB, quadrado e de preferência com fundo transparente.
            </span>
          </div>
        </div>
        <div className={styles.colorRow}>
          <label className={styles.colorPicker}>
            <input type="color" value={cor} onChange={(e) => setValue('cor_primaria', e.target.value.toUpperCase())} aria-label="Cor principal" />
          </label>
          <Input label="Cor principal" placeholder={DEFAULT_COLOR} {...field('cor_primaria')} />
          <div className={styles.swatches} role="group" aria-label="Sugestões de cor">
            {SWATCHES.map((c) => (
              <button key={c} type="button" style={{ background: c }} title={c} onClick={() => setValue('cor_primaria', c)} />
            ))}
          </div>
          {values.cor_primaria && (
            <Button type="button" variant="ghost" size="sm" icon={RotateCcw} onClick={() => setValue('cor_primaria', '')}>
              Cor padrão
            </Button>
          )}
        </div>
        <div className={styles.preview} style={{ '--p': cor, '--on': readableOn(cor), '--soft': tint(cor, 0.88) }}>
          <span className={styles.previewBtn}>Botão principal</span>
          <span className={styles.previewChip}>Destaque</span>
          <span className={styles.previewLink}>Link</span>
        </div>
      </FormSection>

      <FormSection
        title="Contrato"
        description="Modelo usado ao gerar o contrato do aluno, que aceita eletronicamente pela área dele. O visual (cor, logo e assinatura) é o mesmo do recibo."
      >
        <FormGrid columns={2}>
          <FullRow>
            <Input label="Título" placeholder="Contrato de prestação de serviços" {...field('contrato_titulo')} />
          </FullRow>
          <FullRow>
            <Textarea
              label="Texto do contrato"
              rows={14}
              placeholder={defaultText.data ?? 'Carregando modelo padrão…'}
              hint={`Deixe em branco para usar o modelo padrão. Variáveis: ${CONTRACT_VARIABLES.map((v) => `{${v}}`).join(' ')}`}
              {...field('contrato_texto')}
            />
            {!values.contrato_texto && defaultText.data && (
              <Button type="button" variant="ghost" size="sm" icon={Copy} onClick={() => setValue('contrato_texto', defaultText.data)}>
                Começar a partir do modelo padrão
              </Button>
            )}
          </FullRow>
        </FormGrid>
        <div style={{ marginTop: 16 }}>
          <Switch
            label="Enviar o contrato automaticamente ao cadastrar um aluno"
            checked={Boolean(values.contrato_automatico)}
            onChange={(v) => setValue('contrato_automatico', v)}
          />
        </div>
      </FormSection>

      <FormSection
        title="Mensalidades em atraso"
        description="O aluno passa a ser considerado inadimplente quando tem mensalidade vencida há mais dias que a tolerância."
      >
        <FormGrid columns={2}>
          <Input
            label="Tolerância (dias após o vencimento)"
            type="number"
            min="0"
            max="90"
            hint="Ex.: 5 → vencida no dia 10, vira inadimplente no dia 16"
            {...field('dias_tolerancia')}
          />
        </FormGrid>
        <div style={{ marginTop: 16 }}>
          <Switch
            label="Bloquear reservas de aulas de alunos inadimplentes"
            checked={Boolean(values.bloquear_reservas_inadimplente)}
            onChange={(v) => setValue('bloquear_reservas_inadimplente', v)}
          />
        </div>
      </FormSection>

      <FormSection title="Aulas coletivas" description="Regras de reserva aplicadas na área do aluno.">
        <FormGrid columns={2}>
          <Input
            label="Cancelamento até (horas antes da aula)"
            type="number"
            min="0"
            max="72"
            hint="0 = pode cancelar até o início. A equipe sempre pode cancelar."
            {...field('aulas_cancelamento_horas')}
          />
          <Input
            label="Limite de reservas por semana"
            type="number"
            min="1"
            max="50"
            placeholder="Sem limite"
            hint="Deixe vazio para não limitar"
            {...field('aulas_limite_semana')}
          />
        </FormGrid>
        <div style={{ marginTop: 16 }}>
          <Switch
            label="Lista de espera em aulas lotadas (vaga liberada vai para o 1º da fila)"
            checked={Boolean(values.aulas_lista_espera)}
            onChange={(v) => setValue('aulas_lista_espera', v)}
          />
        </div>
      </FormSection>

      <FormSection title="Frequência" description="Alerta de alunos ativos que pararam de fazer check-in.">
        <FormGrid columns={2}>
          <Input label="Considerar sumido após (dias sem check-in)" type="number" min="3" max="120" {...field('dias_sumido')} />
        </FormGrid>
      </FormSection>

      <FormSection
        title="Mensagens do WhatsApp"
        description="Modelos usados no envio em 1 clique. Use as variáveis entre chaves; deixe em branco para usar o texto padrão."
      >
        <FormGrid columns={2}>
          <Input
            label="Lembrete: quantos dias antes do vencimento"
            type="number"
            min="0"
            max="15"
            {...field('whatsapp_dias_lembrete')}
          />
          {Object.entries(TEMPLATE_KEYS).map(([tipo, key]) => (
            <FullRow key={key}>
              <Textarea
                label={TEMPLATE_LABELS[tipo]}
                rows={3}
                placeholder={DEFAULT_TEMPLATES[tipo]}
                hint={`Variáveis: ${TEMPLATE_VARIABLES[tipo].map((v) => `{${v}}`).join(' ')}`}
                {...field(key)}
              />
              {values[key] && (
                <Button type="button" variant="ghost" size="sm" icon={RotateCcw} onClick={() => setValue(key, '')}>
                  Voltar ao texto padrão
                </Button>
              )}
            </FullRow>
          ))}
        </FormGrid>
      </FormSection>

      <FormActions>
        <Button type="submit" icon={Save} loading={mutation.isPending}>
          Salvar configurações
        </Button>
      </FormActions>
    </form>
  )
}

/** Configurações da academia (somente perfil Admin) */
export default function ConfiguracoesAcademia() {
  const { academyId } = useTenant()
  const query = useQuery({ queryKey: ['academy-settings', academyId], queryFn: () => getAcademySettings(academyId) })

  return (
    <>
      <PageHeader title="Configurações da academia" subtitle="Regras de cobrança, aulas, frequência e mensagens" />
      <Card>
        {query.isPending ? (
          <PageLoader />
        ) : query.isError ? (
          <QueryError error={query.error} onRetry={query.refetch} />
        ) : (
          <SettingsForm initial={query.data} />
        )}
      </Card>
    </>
  )
}
