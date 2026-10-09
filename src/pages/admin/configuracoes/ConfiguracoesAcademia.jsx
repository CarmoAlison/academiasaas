import { useQuery } from '@tanstack/react-query'
import { Copy, RotateCcw, Save } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageLoader } from '../../../components/feedback/FullPageLoader'
import LogoPicker from '../../../components/brand/LogoPicker'
import QueryError from '../../../components/feedback/QueryError'
import { Button, Card, FormActions, FormGrid, FormSection, FullRow, Input, PageHeader, Select, Switch, Tabs, Textarea } from '../../../components/ui'
import { useAuth, useTenant } from '../../../hooks/useAuth'
import { useForm } from '../../../hooks/useForm'
import { useModules } from '../../../hooks/useModules'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { getAcademySettings, saveAcademySettings } from '../../../services/academySettingsService'
import { CONTRACT_VARIABLES, defaultContractText } from '../../../services/contractService'
import { calcEncargos, PIX_TIPOS, pixText } from '../../../utils/cobranca'
import { isHexColor, readableOn, tint } from '../../../utils/color'
import { addDays, formatCurrency, onlyDigits, toISODate } from '../../../utils/formatters'
import { rules, validate } from '../../../utils/validators'
import { DEFAULT_TEMPLATES, TEMPLATE_KEYS, TEMPLATE_VARIABLES } from '../../../utils/whatsapp'
import AcademyDataForm from './AcademyDataForm'
import styles from './Configuracoes.module.css'
import HorariosEditor from './HorariosEditor'

const DEFAULT_COLOR = '#006EB8'
const SWATCHES = ['#006EB8', '#16A34A', '#DC2626', '#EA580C', '#7C3AED', '#DB2777', '#0F766E', '#111827']

const range = (min, max, { optional = false } = {}) => (v) => {
  if (optional && (v === '' || v === null || v === undefined)) return undefined
  const n = Number(v)
  if (v === '' || Number.isNaN(n) || !Number.isInteger(n)) return 'Informe um número inteiro'
  if (n < min || n > max) return `Entre ${min} e ${max}`
  return undefined
}

/** Percentual com até 2 casas (aceita vírgula) */
const percent = (max, msg) => (v) => {
  if (v === '' || v === null || v === undefined) return undefined
  const n = Number(String(v).replace(',', '.'))
  if (Number.isNaN(n) || n < 0) return 'Informe um número'
  if (n > max) return msg
  return undefined
}
const toPercent = (v) => (v === '' || v === null || v === undefined ? 0 : Math.round(Number(String(v).replace(',', '.')) * 100) / 100)

const NUMBER_FIELDS = ['dias_tolerancia', 'aulas_cancelamento_horas', 'aulas_limite_semana', 'dias_sumido', 'whatsapp_dias_lembrete']

const TEMPLATE_LABELS = {
  lembrete: 'Lembrete antes do vencimento',
  atraso: 'Aviso de mensalidade em atraso',
  recibo: 'Envio do recibo',
  sumido: 'Aluno sumido',
  aniversario: 'Parabéns de aniversário',
}

const SCHEMA = {
  dias_tolerancia: [rules.required(), range(0, 90)],
  aulas_cancelamento_horas: [range(0, 72)],
  aulas_limite_semana: [range(1, 50, { optional: true })],
  dias_sumido: [range(3, 120)],
  whatsapp_dias_lembrete: [range(0, 15)],
  cor_primaria: [(v) => (v && !isHexColor(v) ? 'Use o formato #RRGGBB' : undefined)],
  multa_percent: [percent(2, 'Máximo de 2% (Código de Defesa do Consumidor)')],
  juros_mes_percent: [percent(1, 'Máximo de 1% ao mês')],
  pix_chave: [(v, all) => (v && !all.pix_tipo ? 'Escolha o tipo da chave' : undefined)],
}

/** Em que aba fica cada campo validado (para abrir a aba certa quando houver erro) */
const FIELD_TAB = {
  cor_primaria: 'identidade',
  dias_tolerancia: 'cobranca',
  multa_percent: 'cobranca',
  juros_mes_percent: 'cobranca',
  pix_chave: 'cobranca',
  aulas_cancelamento_horas: 'regras',
  aulas_limite_semana: 'regras',
  dias_sumido: 'regras',
  whatsapp_dias_lembrete: 'mensagens',
}

/** Abas conforme os módulos liberados para a academia */
function tabsFor(has) {
  return [
    has('identidade') && { key: 'identidade', label: 'Identidade' },
    { key: 'dados', label: 'Dados e endereço' },
    { key: 'horario', label: 'Horário de funcionamento' },
    (has('aulas') || has('checkin')) && { key: 'regras', label: 'Regras' },
    has('financeiro') && { key: 'cobranca', label: 'Cobrança' },
    has('contratos') && { key: 'contrato', label: 'Contrato' },
    has('whatsapp') && { key: 'mensagens', label: 'Mensagens' },
  ].filter(Boolean)
}

function SettingsForm({ initial, tab, onTab }) {
  const { academyId } = useTenant()
  const mod = useModules()
  // campos vazios no formulário ('' em vez de null)
  const formInitial = useMemo(() => Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, v ?? ''])), [initial])
  const { field, values, setValue, handleSubmit, reset } = useForm(formInitial, SCHEMA)
  useEffect(() => reset(formInitial), [formInitial, reset])

  const { refresh } = useAuth()
  const defaultText = useQuery({ queryKey: ['default-contract'], queryFn: defaultContractText, staleTime: Infinity, enabled: tab === 'contrato' })

  const mutation = useMutationToast(
    (v) => {
      const payload = { ...v }
      for (const k of NUMBER_FIELDS) payload[k] = v[k] === '' ? null : Number(v[k])
      for (const k of [...Object.values(TEMPLATE_KEYS), 'contrato_titulo', 'contrato_texto', 'logo_url', 'logo_url_dark', 'pix_favorecido']) payload[k] = v[k]?.trim() || null
      payload.cor_primaria = isHexColor(v.cor_primaria) ? v.cor_primaria.toUpperCase() : null
      payload.multa_percent = toPercent(v.multa_percent)
      payload.juros_mes_percent = toPercent(v.juros_mes_percent)
      payload.pix_tipo = v.pix_chave?.trim() ? v.pix_tipo || null : null
      payload.pix_chave = !v.pix_chave?.trim() ? null : ['cpf', 'cnpj', 'telefone'].includes(v.pix_tipo) ? onlyDigits(v.pix_chave) : v.pix_chave.trim()
      payload.horarios = Array.isArray(v.horarios) ? v.horarios : null
      payload.checkin_somente_aberto = Array.isArray(v.horarios) && Boolean(v.checkin_somente_aberto)
      return saveAcademySettings(academyId, payload)
    },
    {
      success: 'Configurações salvas',
      invalidate: [['academy-settings', academyId], ['students', academyId], ['admin-dashboard', academyId], ['onboarding', academyId], ['payments', academyId]],
      // logo novo aparece no menu e na troca de academia
      onSuccess: () => refresh?.(),
    },
  )

  const submit = (e) => {
    // erro em outra aba: abre a aba do primeiro campo com problema
    const errs = validate(values, SCHEMA)
    const first = Object.keys(errs).find((k) => errs[k])
    if (first && FIELD_TAB[first] && FIELD_TAB[first] !== tab) onTab(FIELD_TAB[first])
    return handleSubmit((v) => mutation.mutate(v))(e)
  }

  const cor = isHexColor(values.cor_primaria) ? values.cor_primaria : DEFAULT_COLOR
  // exemplo de multa/juros: R$ 100,00 vencida há 10 dias
  const exemplo = calcEncargos(
    { valor: 100, vencimento: toISODate(addDays(new Date(), -10)) },
    { multa_percent: toPercent(values.multa_percent), juros_mes_percent: toPercent(values.juros_mes_percent) },
  )
  const pixPreview = pixText({ pix_tipo: values.pix_tipo, pix_chave: values.pix_chave, pix_favorecido: values.pix_favorecido })

  return (
    <form onSubmit={submit} noValidate>
      {tab === 'identidade' && (
        <FormSection
          title="Identidade visual"
          description="Logo e cor da academia aplicados no sistema da equipe e na área do aluno (claro e escuro)."
        >
          <div className={styles.identity}>
            <LogoPicker
              folder={academyId}
              light={values.logo_url}
              dark={values.logo_url_dark}
              onChange={({ light, dark }) => {
                setValue('logo_url', light)
                setValue('logo_url_dark', dark)
              }}
            />
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
      )}

      {tab === 'horario' && (
        <FormSection
          title="Horário de funcionamento"
          description="Aparece na área do aluno. Se quiser, o check-in pelo QR Code só funciona com a academia aberta."
        >
          <HorariosEditor value={Array.isArray(values.horarios) ? values.horarios : null} onChange={(h) => setValue('horarios', h ?? '')} />
          {mod.has('checkin') && Array.isArray(values.horarios) && (
            <div style={{ marginTop: 16 }}>
              <Switch
                label="Aceitar check-in pelo QR Code só no horário de funcionamento"
                checked={Boolean(values.checkin_somente_aberto)}
                onChange={(v) => setValue('checkin_somente_aberto', v)}
              />
              <small className="text-muted" style={{ display: 'block', marginTop: 4 }}>
                O check-in manual feito pela recepção continua liberado a qualquer hora.
              </small>
            </div>
          )}
        </FormSection>
      )}

      {tab === 'regras' && (
        <>
          {mod.has('aulas') && (
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
              <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
                <Switch
                  label="Lista de espera em aulas lotadas (vaga liberada vai para o 1º da fila)"
                  checked={Boolean(values.aulas_lista_espera)}
                  onChange={(v) => setValue('aulas_lista_espera', v)}
                />
                {mod.has('financeiro') && (
                  <Switch
                    label="Bloquear reservas de aulas de alunos inadimplentes"
                    checked={Boolean(values.bloquear_reservas_inadimplente)}
                    onChange={(v) => setValue('bloquear_reservas_inadimplente', v)}
                  />
                )}
              </div>
            </FormSection>
          )}
          {mod.has('checkin') && (
            <FormSection title="Check-in e frequência" description="Alerta de alunos ativos que pararam de fazer check-in.">
              <FormGrid columns={2}>
                <Input label="Considerar sumido após (dias sem check-in)" type="number" min="3" max="120" {...field('dias_sumido')} />
              </FormGrid>
              <p className="text-muted" style={{ marginTop: 12, fontSize: 14 }}>
                Para aceitar check-in só com a academia aberta, configure a aba <strong>Horário de funcionamento</strong>.
              </p>
            </FormSection>
          )}
        </>
      )}

      {tab === 'cobranca' && (
        <>
          <FormSection
            title="Inadimplência"
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
          </FormSection>
          <FormSection
            title="Multa e juros por atraso"
            description="Calculados a partir do dia seguinte ao vencimento. Aparecem no Financeiro, ao registrar o pagamento (você escolhe se cobra) e nas mensagens de atraso."
          >
            <FormGrid columns={2}>
              <Input label="Multa (%)" inputMode="decimal" placeholder="0" hint="Cobrada uma vez. Limite legal: 2%." {...field('multa_percent')} />
              <Input label="Juros ao mês (%)" inputMode="decimal" placeholder="0" hint="Proporcional aos dias de atraso. Usual: 1% ao mês." {...field('juros_mes_percent')} />
            </FormGrid>
            {exemplo.encargos > 0 && (
              <p className="text-muted" style={{ marginTop: 12, fontSize: 14 }}>
                Exemplo: mensalidade de R$ 100,00 com 10 dias de atraso → multa {formatCurrency(exemplo.multa)} + juros {formatCurrency(exemplo.juros)} ={' '}
                <strong>{formatCurrency(exemplo.total)}</strong>
              </p>
            )}
          </FormSection>
          <FormSection title="PIX" description="Aparece para o aluno na área dele e no final das mensagens de cobrança do WhatsApp.">
            <FormGrid columns={2}>
              <Select label="Tipo da chave" placeholder="Selecione" options={PIX_TIPOS} {...field('pix_tipo')} />
              <Input label="Chave PIX" {...field('pix_chave')} />
              <FullRow>
                <Input label="Favorecido" placeholder="Nome que aparece no banco (opcional)" {...field('pix_favorecido')} />
              </FullRow>
            </FormGrid>
            {pixPreview && (
              <p className="text-muted" style={{ marginTop: 12, fontSize: 14 }}>
                Como aparece: <strong>{pixPreview}</strong>
              </p>
            )}
          </FormSection>
        </>
      )}

      {tab === 'contrato' && (
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
      )}

      {tab === 'mensagens' && (
        <FormSection
          title="Mensagens do WhatsApp"
          description="Modelos usados no envio em 1 clique. Use as variáveis entre chaves; deixe em branco para usar o texto padrão."
        >
          <FormGrid columns={2}>
            <Input label="Lembrete: quantos dias antes do vencimento" type="number" min="0" max="15" {...field('whatsapp_dias_lembrete')} />
            {Object.entries(TEMPLATE_KEYS).map(([tipo, key]) => (
              <FullRow key={key}>
                <Textarea
                  label={TEMPLATE_LABELS[tipo]}
                  rows={3}
                  placeholder={DEFAULT_TEMPLATES[tipo].replace(/\{pix_linha\}|\{encargos_linha\}/g, '')}
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
      )}

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
  const mod = useModules()
  const [params, setParams] = useSearchParams()
  const query = useQuery({ queryKey: ['academy-settings', academyId], queryFn: () => getAcademySettings(academyId) })

  const tabs = tabsFor(mod.has)
  const tab = tabs.some((t) => t.key === params.get('tab')) ? params.get('tab') : tabs[0].key
  const setTab = (key) => setParams({ tab: key }, { replace: true })

  return (
    <>
      <PageHeader title="Configurações da academia" subtitle="Identidade, dados, horário, regras, cobrança e mensagens" />
      <Tabs items={tabs} value={tab} onChange={setTab} />
      <Card>
        {tab === 'dados' && <AcademyDataForm />}
        {/* o formulário fica montado nas outras abas para não perder o que foi editado */}
        <div hidden={tab === 'dados'}>
          {query.isPending ? (
            <PageLoader />
          ) : query.isError ? (
            <QueryError error={query.error} onRetry={query.refetch} />
          ) : (
            <SettingsForm initial={query.data} tab={tab} onTab={setTab} />
          )}
        </div>
      </Card>
    </>
  )
}
