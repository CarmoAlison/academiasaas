import { useQuery } from '@tanstack/react-query'
import { Check, Copy, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import QueryError from '../../../components/feedback/QueryError'
import {
  Badge,
  Button,
  Checkbox,
  DataTable,
  FormGrid,
  FullRow,
  Input,
  Modal,
  PageHeader,
  Select,
  SkeletonCard,
  Switch,
  Tabs,
  Textarea,
  Tooltip,
  useConfirm,
} from '../../../components/ui'
import { useForm } from '../../../hooks/useForm'
import { useMutationToast } from '../../../hooks/useMutationToast'
import {
  duplicateSaasOffer,
  duplicateSaasPlan,
  listSaasAddons,
  listSaasOffers,
  listSaasPlans,
  offerUsage,
  removeSaasOffer,
  removeSaasPlan,
  saveSaasAddon,
  saveSaasOffer,
  saveSaasPlan,
} from '../../../services/saasService'
import { listModules, saveModule } from '../../../services/moduleService'
import { UFS } from '../../../utils/constants'
import { formatCurrency, formatDate, toISODate } from '../../../utils/formatters'
import { annualMonthly } from '../../../utils/saasPricing'
import { rules } from '../../../utils/validators'
import styles from './PlanosSaas.module.css'

const pctRule = (max) => (v) => (v !== '' && (Number(v) < 0 || Number(v) > max) ? `Entre 0 e ${max}` : undefined)

// ---------------------------------------------------------------------
// Planos
// ---------------------------------------------------------------------
const EMPTY_PLAN = {
  nome: '',
  descricao: '',
  valor: '',
  limite_alunos: '',
  limite_unidades: '',
  desconto_anual_pct: '15',
  recursos: '',
  destaque: false,
  ordem: '0',
  ativo: true,
  modulos_todos: true,
  modulos: [],
}

/** Módulos incluídos no plano (essenciais sempre entram) */
function PlanModulesField({ all, selected, onChange }) {
  const modules = useQuery({ queryKey: ['saas-modules'], queryFn: listModules })
  const optional = (modules.data ?? []).filter((m) => m.ativo && !m.essencial)
  return (
    <div className={styles.modField}>
      <span className={styles.modTitle}>Módulos incluídos</span>
      <Switch
        label="Todos os módulos (inclusive os que forem criados depois)"
        checked={all}
        onChange={(v) => onChange(v, v ? selected : optional.map((m) => m.slug))}
      />
      {!all && (
        <div className={styles.modGrid}>
          {optional.map((m) => (
            <Checkbox
              key={m.slug}
              label={m.nome}
              checked={selected.includes(m.slug)}
              onChange={(on) => onChange(false, on ? [...selected, m.slug] : selected.filter((s) => s !== m.slug))}
            />
          ))}
        </div>
      )}
      <small className="text-muted">Os essenciais (alunos, cadastros e dashboard) estão sempre incluídos. Dá para ajustar cada academia pelo ícone ⚙ na lista de academias.</small>
    </div>
  )
}

function PlanModal({ plan, onClose }) {
  const { field, values, setValue, handleSubmit } = useForm(
    plan
      ? {
          ...EMPTY_PLAN,
          ...plan,
          descricao: plan.descricao ?? '',
          limite_alunos: plan.limite_alunos ?? '',
          limite_unidades: plan.limite_unidades ?? '',
          desconto_anual_pct: String(plan.desconto_anual_pct ?? 0),
          recursos: (plan.recursos ?? []).join('\n'),
          ordem: String(plan.ordem ?? 0),
          modulos_todos: plan.modulos == null,
          modulos: plan.modulos ?? [],
        }
      : EMPTY_PLAN,
    { nome: [rules.required()], valor: [rules.required(), rules.min(0)], desconto_anual_pct: [pctRule(90)] },
  )
  const mutation = useMutationToast((v) => saveSaasPlan(plan?.id, v), {
    success: plan ? 'Plano atualizado' : 'Plano criado',
    invalidate: [['saas-plans']],
    onSuccess: onClose,
  })
  const submit = handleSubmit((v) => mutation.mutate(v))
  const anual = values.valor ? annualMonthly({ valor: values.valor, desconto_anual_pct: values.desconto_anual_pct }) : null

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={plan ? 'Editar plano' : 'Novo plano'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={mutation.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate>
        <FormGrid columns={2}>
          <Input label="Nome" required {...field('nome')} />
          <Input label="Ordem de exibição" type="number" {...field('ordem')} />
          <Input label="Valor mensal (R$)" type="number" step="0.01" min="0" required {...field('valor')} />
          <Input
            label="Desconto no anual (%)"
            type="number"
            min="0"
            max="90"
            hint={anual ? `No anual sai ${formatCurrency(anual)}/mês (${formatCurrency(anual * 12)}/ano)` : undefined}
            {...field('desconto_anual_pct')}
          />
          <Input label="Limite de alunos ativos" type="number" min="0" hint="Vazio = ilimitado" {...field('limite_alunos')} />
          <Input label="Limite de unidades" type="number" min="0" hint="Vazio = ilimitado" {...field('limite_unidades')} />
          <FullRow>
            <Input label="Descrição curta" {...field('descricao')} />
          </FullRow>
          <FullRow>
            <Textarea label="O que está incluso" rows={5} hint="Um item por linha (aparece no cartão do plano)" {...field('recursos')} />
          </FullRow>
          <FullRow>
            <PlanModulesField
              all={values.modulos_todos}
              selected={values.modulos}
              onChange={(all, selected) => {
                setValue('modulos_todos', all)
                setValue('modulos', selected)
              }}
            />
          </FullRow>
          <Switch label="Destacar como “Mais vendido”" checked={values.destaque} onChange={(v) => setValue('destaque', v)} />
          <Switch label="Plano ativo (disponível para novas academias)" checked={values.ativo} onChange={(v) => setValue('ativo', v)} />
        </FormGrid>
      </form>
    </Modal>
  )
}

function PlansTab() {
  const [editing, setEditing] = useState(null)
  const [confirm, confirmDialog] = useConfirm()
  const query = useQuery({ queryKey: ['saas-plans'], queryFn: listSaasPlans })
  const remove = useMutationToast(removeSaasPlan, { success: 'Plano removido', invalidate: [['saas-plans']] })
  const duplicate = useMutationToast(duplicateSaasPlan, { success: 'Plano duplicado (inativo, ajuste e ative)', invalidate: [['saas-plans']] })

  if (query.isError) return <QueryError error={query.error} onRetry={query.refetch} />

  return (
    <>
      {confirmDialog}
      <div className={styles.toolbar}>
        <Button icon={Plus} onClick={() => setEditing({})}>
          Novo plano
        </Button>
      </div>
      {query.isPending ? (
        <SkeletonCard lines={6} />
      ) : (
        <div className={styles.cards}>
          {query.data.map((p) => (
            <article key={p.id} className={`${styles.card} ${p.destaque ? styles.featured : ''} ${p.ativo ? '' : styles.inactive}`}>
              {p.destaque && (
                <span className={styles.ribbon}>
                  <Star size={12} /> Mais vendido
                </span>
              )}
              <header>
                <h3>{p.nome}</h3>
                {!p.ativo && <Badge>Inativo</Badge>}
              </header>
              {p.descricao && <p className="text-muted">{p.descricao}</p>}
              <div className={styles.price}>
                <strong>{formatCurrency(p.valor)}</strong>
                <span>/mês</span>
              </div>
              {Number(p.desconto_anual_pct) > 0 && (
                <p className={styles.annual}>
                  Anual: {formatCurrency(annualMonthly(p))}/mês <Badge tone="success">−{Number(p.desconto_anual_pct)}%</Badge>
                </p>
              )}
              <ul>
                <li>
                  <Check size={14} /> {p.limite_alunos ? `Até ${p.limite_alunos} alunos ativos` : 'Alunos ilimitados'}
                </li>
                <li>
                  <Check size={14} /> {p.limite_unidades ? `${p.limite_unidades} unidade(s)` : 'Unidades ilimitadas'}
                </li>
                <li>
                  <Check size={14} /> {p.modulos == null ? 'Todos os módulos' : `${p.modulos.length} módulo(s) opcional(is) + essenciais`}
                </li>
                {(p.recursos ?? []).map((r) => (
                  <li key={r}>
                    <Check size={14} /> {r}
                  </li>
                ))}
              </ul>
              <footer>
                <Button variant="outline" size="sm" icon={Pencil} onClick={() => setEditing(p)}>
                  Editar
                </Button>
                <Button variant="ghost" size="sm" icon={Copy} loading={duplicate.isPending && duplicate.variables?.id === p.id} onClick={() => duplicate.mutate(p)}>
                  Duplicar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Trash2}
                  aria-label="Remover"
                  onClick={async () => {
                    if (await confirm({ title: 'Remover plano', message: `Remover o plano ${p.nome}? Academias já vinculadas mantêm o plano.`, danger: true, confirmLabel: 'Remover' })) {
                      remove.mutate(p.id)
                    }
                  }}
                />
              </footer>
            </article>
          ))}
        </div>
      )}
      {editing && <PlanModal plan={editing.id ? editing : null} onClose={() => setEditing(null)} />}
    </>
  )
}

// ---------------------------------------------------------------------
// Adicionais
// ---------------------------------------------------------------------
function AddonModal({ addon, onClose }) {
  const { field, values, setValue, handleSubmit } = useForm(
    { nome: addon?.nome ?? '', descricao: addon?.descricao ?? '', valor: addon?.valor ?? '', ativo: addon?.ativo ?? true, slug: addon?.slug ?? '' },
    { nome: [rules.required()], valor: [rules.required(), rules.min(0)] },
  )
  const mutation = useMutationToast((v) => saveSaasAddon(addon?.id, v), {
    success: addon ? 'Adicional atualizado' : 'Adicional criado',
    invalidate: [['saas-addons']],
    onSuccess: onClose,
  })
  const submit = handleSubmit((v) => mutation.mutate(v))
  return (
    <Modal
      open
      onClose={onClose}
      title={addon ? 'Editar adicional' : 'Novo adicional'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={mutation.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate>
        <FormGrid columns={2}>
          <Input label="Nome" required {...field('nome')} />
          <Input label="Valor fixo mensal (R$)" type="number" step="0.01" min="0" required {...field('valor')} />
          <FullRow>
            <Textarea label="Descrição" rows={2} {...field('descricao')} />
          </FullRow>
          <Switch label="Disponível para contratação" checked={values.ativo} onChange={(v) => setValue('ativo', v)} />
        </FormGrid>
        <p className="text-muted" style={{ fontSize: 12, marginTop: 12 }}>
          Mudar o valor vale para novas contratações; quem já contratou mantém o preço.
        </p>
      </form>
    </Modal>
  )
}

function AddonsTab() {
  const [editing, setEditing] = useState(null)
  const query = useQuery({ queryKey: ['saas-addons'], queryFn: listSaasAddons })
  if (query.isError) return <QueryError error={query.error} onRetry={query.refetch} />
  return (
    <>
      <DataTable
        loading={query.isPending}
        data={query.data ?? []}
        searchable={false}
        actions={
          <Button icon={Plus} onClick={() => setEditing({})}>
            Novo adicional
          </Button>
        }
        emptyTitle="Nenhum adicional"
        columns={[
          {
            key: 'nome',
            header: 'Adicional',
            render: (a) => (
              <>
                <strong>{a.nome}</strong>
                {a.descricao && <div className="text-muted" style={{ fontSize: 12 }}>{a.descricao}</div>}
              </>
            ),
          },
          { key: 'valor', header: 'Valor fixo/mês', align: 'right', render: (a) => formatCurrency(a.valor) },
          { key: 'ativo', header: 'Status', render: (a) => <Badge tone={a.ativo ? 'success' : 'neutral'}>{a.ativo ? 'Disponível' : 'Indisponível'}</Badge> },
          {
            key: 'acoes',
            header: '',
            sortable: false,
            align: 'right',
            render: (a) => <Button variant="ghost" size="sm" icon={Pencil} aria-label="Editar" onClick={() => setEditing(a)} />,
          },
        ]}
      />
      <p className="text-muted" style={{ fontSize: 12, marginTop: 12 }}>
        Os adicionais são ligados a cada academia na página dela (Academias → abrir → Assinatura). No plano anual, o adicional é cobrado × 12, sem desconto.
      </p>
      {editing && <AddonModal addon={editing.id ? editing : null} onClose={() => setEditing(null)} />}
    </>
  )
}

// ---------------------------------------------------------------------
// Ofertas
// ---------------------------------------------------------------------
function OfferModal({ offer, onClose }) {
  const { field, values, setValue, handleSubmit } = useForm(
    {
      nome: offer?.nome ?? '',
      descricao: offer?.descricao ?? '',
      desconto_pct: offer?.desconto_pct ?? '',
      meses: offer?.meses ?? '',
      limite_academias: offer?.limite_academias ?? '',
      uf: offer?.uf ?? '',
      cidade: offer?.cidade ?? '',
      valido_ate: offer?.valido_ate ?? '',
      ativo: offer?.ativo ?? true,
    },
    {
      nome: [rules.required()],
      desconto_pct: [rules.required(), (v) => (Number(v) <= 0 || Number(v) > 100 ? 'Entre 1 e 100' : undefined)],
      meses: [(v) => (v !== '' && (Number(v) < 1 || Number(v) > 60) ? 'Entre 1 e 60' : undefined)],
      limite_academias: [(v) => (v !== '' && Number(v) < 1 ? 'Mínimo 1' : undefined)],
    },
  )
  const mutation = useMutationToast((v) => saveSaasOffer(offer?.id, v), {
    success: offer ? 'Oferta atualizada' : 'Oferta criada',
    invalidate: [['saas-offers']],
    onSuccess: onClose,
  })
  const submit = handleSubmit((v) => mutation.mutate(v))
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={offer ? 'Editar oferta' : 'Nova oferta'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={mutation.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate>
        <FormGrid columns={2}>
          <FullRow>
            <Input label="Nome" required placeholder="Ex.: Lançamento — 10 primeiras de Campinas" {...field('nome')} />
          </FullRow>
          <Input label="Desconto (%)" type="number" min="1" max="100" required hint="Aplicado sobre o plano (não nos adicionais)" {...field('desconto_pct')} />
          <Input label="Duração do desconto (meses)" type="number" min="1" max="60" hint="Vazio = enquanto a assinatura durar" {...field('meses')} />
          <Input label="Vagas (nº de academias)" type="number" min="1" hint="Vazio = sem limite" {...field('limite_academias')} />
          <Input label="Válida para adesões até" type="date" hint="Vazio = sem data de término" {...field('valido_ate')} />
          <Select label="Região — UF" placeholder="Todo o Brasil" options={UFS.map((u) => ({ value: u, label: u }))} {...field('uf')} />
          <Input label="Região — cidade" placeholder="Opcional" {...field('cidade')} />
          <FullRow>
            <Textarea label="Observações" rows={2} {...field('descricao')} />
          </FullRow>
          <Switch label="Oferta ativa" checked={values.ativo} onChange={(v) => setValue('ativo', v)} />
        </FormGrid>
      </form>
    </Modal>
  )
}

function OffersTab() {
  const [editing, setEditing] = useState(null)
  const [confirm, confirmDialog] = useConfirm()
  const query = useQuery({ queryKey: ['saas-offers'], queryFn: listSaasOffers })
  const usage = useQuery({ queryKey: ['saas-offers', 'usage'], queryFn: offerUsage })
  const remove = useMutationToast(removeSaasOffer, { success: 'Oferta excluída', invalidate: [['saas-offers']] })
  const duplicate = useMutationToast(duplicateSaasOffer, { success: 'Oferta duplicada (inativa, ajuste e ative)', invalidate: [['saas-offers']] })
  if (query.isError) return <QueryError error={query.error} onRetry={query.refetch} />
  const hoje = toISODate()

  return (
    <>
      {confirmDialog}
      <DataTable
        loading={query.isPending}
        data={query.data ?? []}
        searchable={false}
        actions={
          <Button icon={Plus} onClick={() => setEditing({})}>
            Nova oferta
          </Button>
        }
        emptyTitle="Nenhuma oferta"
        emptyDescription="Crie, por exemplo, “50% por 3 meses para as 10 primeiras academias de SP”."
        columns={[
          {
            key: 'nome',
            header: 'Oferta',
            render: (o) => (
              <>
                <strong>{o.nome}</strong>
                <div className="text-muted" style={{ fontSize: 12 }}>
                  {Number(o.desconto_pct)}% {o.meses ? `por ${o.meses} mês(es)` : 'enquanto durar a assinatura'}
                  {o.uf || o.cidade ? ` · ${[o.cidade, o.uf].filter(Boolean).join('/')}` : ' · todo o Brasil'}
                </div>
              </>
            ),
          },
          {
            key: 'vagas',
            header: 'Vagas',
            sortable: false,
            render: (o) => {
              const used = usage.data?.[o.id] ?? 0
              return o.limite_academias ? (
                <Badge tone={used >= o.limite_academias ? 'danger' : 'info'}>
                  {used}/{o.limite_academias}
                </Badge>
              ) : (
                `${used} academia(s)`
              )
            },
          },
          { key: 'valido_ate', header: 'Adesões até', render: (o) => (o.valido_ate ? formatDate(o.valido_ate) : '—') },
          {
            key: 'ativo',
            header: 'Status',
            render: (o) => {
              const encerrada = o.valido_ate && o.valido_ate < hoje
              const esgotada = o.limite_academias && (usage.data?.[o.id] ?? 0) >= o.limite_academias
              if (!o.ativo) return <Badge>Inativa</Badge>
              if (encerrada) return <Badge>Encerrada</Badge>
              if (esgotada) return <Badge tone="warning">Esgotada</Badge>
              return <Badge tone="success">Disponível</Badge>
            },
          },
          {
            key: 'acoes',
            header: '',
            sortable: false,
            align: 'right',
            render: (o) => (
              <div style={{ display: 'inline-flex', gap: 4 }}>
                <Button variant="ghost" size="sm" icon={Pencil} aria-label="Editar" onClick={() => setEditing(o)} />
                <Tooltip content="Duplicar">
                  <Button variant="ghost" size="sm" icon={Copy} aria-label="Duplicar" onClick={() => duplicate.mutate(o)} />
                </Tooltip>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Trash2}
                  aria-label="Excluir"
                  onClick={async () => {
                    const used = usage.data?.[o.id] ?? 0
                    if (
                      await confirm({
                        title: 'Excluir oferta',
                        message: used
                          ? `${used} academia(s) usam esta oferta e perderão o desconto nas próximas faturas. Prefira desativar a oferta para só impedir novas adesões.`
                          : `Excluir "${o.nome}"?`,
                        danger: true,
                        confirmLabel: 'Excluir',
                      })
                    ) {
                      remove.mutate(o.id)
                    }
                  }}
                />
              </div>
            ),
          },
        ]}
      />
      <p className="text-muted" style={{ fontSize: 12, marginTop: 12 }}>
        Desativar ou encerrar a oferta impede novas adesões; quem já aderiu mantém o desconto pelo período da oferta.
      </p>
      {editing && <OfferModal offer={editing.id ? editing : null} onClose={() => setEditing(null)} />}
    </>
  )
}

// ---------------------------------------------------------------------
// Módulos (catálogo)
// ---------------------------------------------------------------------
const GRUPOS = [
  { value: 'gestao', label: 'Gestão' },
  { value: 'aluno', label: 'Área do aluno' },
  { value: 'ambos', label: 'Gestão e área do aluno' },
]

function ModuleModal({ module, onClose }) {
  const isNew = !module
  const { field, values, setValue, handleSubmit } = useForm(
    {
      slug: module?.slug ?? '',
      nome: module?.nome ?? '',
      descricao: module?.descricao ?? '',
      grupo: module?.grupo ?? 'gestao',
      ordem: String(module?.ordem ?? 100),
      ativo: module?.ativo ?? true,
    },
    {
      nome: [rules.required()],
      slug: isNew ? [rules.required(), (v) => (/^[a-z0-9_]{2,40}$/.test(v) ? undefined : 'Use só letras minúsculas, números e _')] : [],
    },
  )
  const mutation = useMutationToast((v) => saveModule(module?.slug, v, isNew), {
    success: isNew ? 'Módulo criado' : 'Módulo atualizado',
    invalidate: [['saas-modules']],
    onSuccess: onClose,
  })
  const submit = handleSubmit((v) => mutation.mutate(v))
  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Novo módulo' : `Editar módulo — ${module.nome}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={mutation.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate>
        <FormGrid columns={2}>
          <Input label="Nome" required {...field('nome')} />
          <Input label="Código" required={isNew} disabled={!isNew} placeholder="ex.: nutricao" hint="Identificador fixo, sem espaços" {...field('slug')} />
          <Select label="Onde aparece" options={GRUPOS} {...field('grupo')} />
          <Input label="Ordem" type="number" {...field('ordem')} />
          <FullRow>
            <Textarea label="Descrição" rows={2} {...field('descricao')} />
          </FullRow>
          <Switch label="Módulo ativo no catálogo" checked={values.ativo} onChange={(v) => setValue('ativo', v)} />
        </FormGrid>
        {isNew && (
          <p className="text-muted" style={{ fontSize: 12, marginTop: 12 }}>
            Um módulo novo começa desligado nos planos com lista de módulos e ligado nos planos com “Todos os módulos”. Para ele ter efeito
            nas telas, a funcionalidade correspondente precisa existir no sistema.
          </p>
        )}
      </form>
    </Modal>
  )
}

function ModulesTab() {
  const [editing, setEditing] = useState(null)
  const query = useQuery({ queryKey: ['saas-modules'], queryFn: listModules })
  if (query.isError) return <QueryError error={query.error} onRetry={query.refetch} />
  return (
    <>
      <DataTable
        loading={query.isPending}
        data={(query.data ?? []).map((m) => ({ ...m, id: m.slug }))}
        searchKeys={['nome', 'descricao', 'slug']}
        searchPlaceholder="Buscar módulo"
        actions={
          <Button icon={Plus} onClick={() => setEditing({})}>
            Novo módulo
          </Button>
        }
        columns={[
          {
            key: 'nome',
            header: 'Módulo',
            render: (m) => (
              <>
                <strong>{m.nome}</strong>
                {m.descricao && <div className="text-muted" style={{ fontSize: 12 }}>{m.descricao}</div>}
              </>
            ),
          },
          { key: 'grupo', header: 'Onde aparece', render: (m) => GRUPOS.find((g) => g.value === m.grupo)?.label },
          {
            key: 'ativo',
            header: 'Tipo',
            render: (m) =>
              m.essencial ? <Badge>Essencial</Badge> : <Badge tone={m.ativo ? 'success' : 'neutral'}>{m.ativo ? 'Opcional' : 'Inativo'}</Badge>,
          },
          {
            key: 'acoes',
            header: '',
            sortable: false,
            align: 'right',
            render: (m) => <Button variant="ghost" size="sm" icon={Pencil} aria-label="Editar" onClick={() => setEditing(m)} />,
          },
        ]}
      />
      <p className="text-muted" style={{ fontSize: 12, marginTop: 12 }}>
        Defina quais módulos cada plano inclui em Planos → Editar. Para liberar ou bloquear algo só para uma academia, use o ícone ⚙ na lista de academias.
      </p>
      {editing && <ModuleModal module={editing.slug ? editing : null} onClose={() => setEditing(null)} />}
    </>
  )
}

const TABS = [
  { key: 'planos', label: 'Planos' },
  { key: 'adicionais', label: 'Adicionais' },
  { key: 'ofertas', label: 'Ofertas' },
  { key: 'modulos', label: 'Módulos' },
]

export default function PlanosSaas() {
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'planos'
  return (
    <>
      <PageHeader title="Planos SaaS" subtitle="Planos, adicionais e ofertas que você vende para as academias" />
      <Tabs items={TABS} value={tab} onChange={(key) => setParams({ tab: key }, { replace: true })} />
      <div style={{ marginTop: 20 }}>
        {tab === 'planos' && <PlansTab />}
        {tab === 'adicionais' && <AddonsTab />}
        {tab === 'ofertas' && <OffersTab />}
        {tab === 'modulos' && <ModulesTab />}
      </div>
    </>
  )
}
