import { useQuery } from '@tanstack/react-query'
import { Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { AnnouncementItem } from '../../../components/announcements/AnnouncementBanner'
import QueryError from '../../../components/feedback/QueryError'
import { Badge, Button, Checkbox, DataTable, FormGrid, FullRow, Input, Modal, PageHeader, Select, Switch, Textarea, Tooltip, useConfirm } from '../../../components/ui'
import { useForm } from '../../../hooks/useForm'
import { useMutationToast } from '../../../hooks/useMutationToast'
import {
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_TYPES,
  listAnnouncements,
  removeAnnouncement,
  saveAnnouncement,
  toggleAnnouncement,
} from '../../../services/announcementService'
import { listModules } from '../../../services/moduleService'
import { listAcademies, listSaasPlans } from '../../../services/saasService'
import { formatDateTime } from '../../../utils/formatters'
import { rules } from '../../../utils/validators'

/** ISO → valor de <input type="datetime-local"> (horário local) */
const toLocalInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function situacao(a) {
  const now = Date.now()
  if (!a.ativo) return ['neutral', 'Desativado']
  if (new Date(a.inicio).getTime() > now) return ['info', 'Agendado']
  if (a.fim && new Date(a.fim).getTime() <= now) return ['neutral', 'Encerrado']
  return ['success', 'No ar']
}

function AvisoModal({ aviso, onClose }) {
  const academies = useQuery({ queryKey: ['academies'], queryFn: listAcademies })
  const plans = useQuery({ queryKey: ['saas-plans'], queryFn: listSaasPlans })
  const modules = useQuery({ queryKey: ['saas-modules'], queryFn: listModules })
  const { field, values, setValue, handleSubmit } = useForm(
    {
      titulo: aviso?.titulo ?? '',
      mensagem: aviso?.mensagem ?? '',
      tipo: aviso?.tipo ?? 'info',
      publico: aviso?.publico ?? 'equipe',
      academy_id: aviso?.academy_id ?? '',
      planos: aviso?.planos ?? [],
      modulo: aviso?.modulo ?? '',
      link: aviso?.link ?? '',
      inicio: toLocalInput(aviso?.inicio ?? new Date().toISOString()),
      fim: toLocalInput(aviso?.fim),
      ativo: aviso?.ativo ?? true,
    },
    {
      titulo: [rules.required(), (v) => (v.trim().length < 3 ? 'Mínimo de 3 caracteres' : undefined)],
      link: [(v) => (v && !/^https?:\/\//i.test(v) ? 'Use um link começando com https://' : undefined)],
      fim: [(v, all) => (v && all.inicio && v <= all.inicio ? 'O fim deve ser depois do início' : undefined)],
    },
  )
  const mutation = useMutationToast((v) => saveAnnouncement(aviso?.id, v), {
    success: aviso ? 'Aviso atualizado' : 'Aviso publicado',
    invalidate: [['announcements']],
    onSuccess: onClose,
  })
  const submit = handleSubmit((v) => mutation.mutate(v))

  return (
    <Modal
      open
      onClose={onClose}
      title={aviso ? 'Editar aviso' : 'Novo aviso'}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={mutation.isPending}>
            {aviso ? 'Salvar' : 'Publicar'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate>
        <FormGrid columns={2}>
          <FullRow>
            <Input label="Título" required maxLength={120} placeholder="Ex.: Manutenção programada domingo às 22h" {...field('titulo')} />
          </FullRow>
          <FullRow>
            <Textarea label="Mensagem" rows={3} maxLength={1000} placeholder="Detalhes (opcional)" {...field('mensagem')} />
          </FullRow>
          <Select label="Tipo" options={ANNOUNCEMENT_TYPES} hint={values.tipo === 'urgente' ? 'Urgente não pode ser fechado pelo usuário' : undefined} {...field('tipo')} />
          <Select label="Quem vê" options={ANNOUNCEMENT_AUDIENCES} {...field('publico')} />
          <Select
            label="Academia"
            placeholder="Todas as academias"
            options={(academies.data ?? []).map((a) => ({ value: a.id, label: a.nome }))}
            {...field('academy_id')}
          />
          <Select
            label="Só academias com o módulo"
            placeholder="Qualquer academia"
            options={(modules.data ?? []).filter((m) => m.ativo && !m.essencial).map((m) => ({ value: m.slug, label: m.nome }))}
            {...field('modulo')}
          />
          <FullRow>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Só academias dos planos</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px' }}>
              {(plans.data ?? []).map((p) => (
                <Checkbox
                  key={p.id}
                  label={p.nome}
                  checked={values.planos.includes(p.id)}
                  onChange={(on) => setValue('planos', on ? [...values.planos, p.id] : values.planos.filter((x) => x !== p.id))}
                />
              ))}
            </div>
            <small className="text-muted">Nenhum marcado = todos os planos</small>
          </FullRow>
          <Input label="Link (opcional)" type="url" placeholder="https://…" {...field('link')} />
          <Input label="Mostrar a partir de" type="datetime-local" {...field('inicio')} />
          <Input label="Até (opcional)" type="datetime-local" hint="Vazio = até desativar" {...field('fim')} />
        </FormGrid>
        <div style={{ marginTop: 16 }}>
          <Switch label="Ativo" checked={Boolean(values.ativo)} onChange={(v) => setValue('ativo', v)} />
        </div>
        {values.titulo.trim() && (
          <div style={{ marginTop: 20 }}>
            <span className="text-muted" style={{ fontSize: 12 }}>
              Pré-visualização
            </span>
            <div style={{ marginTop: 6, border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
              <AnnouncementItem aviso={values} onClose={values.tipo === 'urgente' ? null : () => {}} />
            </div>
          </div>
        )}
      </form>
    </Modal>
  )
}

/** Avisos do SaaS para as academias (faixa no topo do sistema) */
export default function Avisos() {
  const [editing, setEditing] = useState(null)
  const [confirm, confirmDialog] = useConfirm()
  const query = useQuery({ queryKey: ['announcements', 'all'], queryFn: listAnnouncements })
  const toggle = useMutationToast(({ id, ativo }) => toggleAnnouncement(id, ativo), {
    success: (_, v) => (v.ativo ? 'Aviso ativado' : 'Aviso desativado'),
    invalidate: [['announcements']],
  })
  const remove = useMutationToast(removeAnnouncement, { success: 'Aviso excluído', invalidate: [['announcements']] })

  if (query.isError) return <QueryError error={query.error} onRetry={query.refetch} />

  return (
    <>
      {confirmDialog}
      <PageHeader
        title="Avisos"
        subtitle="Faixa exibida no topo do sistema das academias: manutenções, novidades e comunicados"
        actions={
          <Button icon={Plus} onClick={() => setEditing({})}>
            Novo aviso
          </Button>
        }
      />
      <DataTable
        loading={query.isPending}
        data={query.data ?? []}
        searchKeys={['titulo', 'mensagem', 'academy.nome']}
        searchPlaceholder="Buscar aviso"
        emptyTitle="Nenhum aviso publicado"
        columns={[
          {
            key: 'titulo',
            header: 'Aviso',
            render: (a) => (
              <>
                <strong>{a.titulo}</strong>
                <div className="text-muted" style={{ fontSize: 12 }}>
                  {ANNOUNCEMENT_TYPES.find((t) => t.value === a.tipo)?.label} · {a.academy?.nome ?? 'Todas as academias'} ·{' '}
                  {ANNOUNCEMENT_AUDIENCES.find((p) => p.value === a.publico)?.label}
                  {a.planos?.length ? ` · ${a.planos.length} plano(s)` : ''}
                  {a.modulo ? ` · módulo ${a.modulo}` : ''}
                </div>
              </>
            ),
          },
          {
            key: 'inicio',
            header: 'Período',
            render: (a) => (
              <span style={{ fontSize: 13 }}>
                {formatDateTime(a.inicio)}
                {a.fim ? ` até ${formatDateTime(a.fim)}` : ' em diante'}
              </span>
            ),
          },
          {
            key: 'ativo',
            header: 'Situação',
            render: (a) => {
              const [tone, label] = situacao(a)
              return <Badge tone={tone}>{label}</Badge>
            },
          },
          {
            key: 'acoes',
            header: '',
            sortable: false,
            align: 'right',
            render: (a) => (
              <div style={{ display: 'inline-flex', gap: 4 }}>
                <Tooltip content="Editar">
                  <Button variant="ghost" size="sm" icon={Pencil} aria-label="Editar" onClick={() => setEditing(a)} />
                </Tooltip>
                <Tooltip content={a.ativo ? 'Desativar' : 'Ativar'}>
                  <Button variant="ghost" size="sm" icon={a.ativo ? EyeOff : Eye} aria-label={a.ativo ? 'Desativar' : 'Ativar'} onClick={() => toggle.mutate({ id: a.id, ativo: !a.ativo })} />
                </Tooltip>
                <Tooltip content="Excluir">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Trash2}
                    aria-label="Excluir"
                    onClick={async () => {
                      if (await confirm({ title: 'Excluir aviso', message: `Excluir "${a.titulo}"?`, danger: true, confirmLabel: 'Excluir' })) remove.mutate(a.id)
                    }}
                  />
                </Tooltip>
              </div>
            ),
          },
        ]}
      />
      {editing && <AvisoModal aviso={editing.id ? editing : null} onClose={() => setEditing(null)} />}
    </>
  )
}
