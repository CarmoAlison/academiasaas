import { useQuery } from '@tanstack/react-query'
import { Pencil, Plus, Trash2, Video } from 'lucide-react'
import { useState } from 'react'
import QueryError from '../../../components/feedback/QueryError'
import { Button, DataTable, FormGrid, FullRow, Input, Modal, Select, Textarea, useConfirm } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { useForm } from '../../../hooks/useForm'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { usePermissions } from '../../../hooks/usePermissions'
import { exerciseService } from '../../../services/catalogServices'
import { MUSCLE_GROUPS } from '../../../utils/constants'
import { rules } from '../../../utils/validators'

const EMPTY = { nome: '', grupo_muscular: '', video_url: '', instrucoes: '' }

/**
 * Modal de cadastro/edição de exercício (também usado no formulário de treino)
 * @param {{ exercise?: object|null, onClose: () => void, onSaved?: (id: string) => void }} props
 */
export function ExerciseModal({ exercise, onClose, onSaved }) {
  const { academyId } = useTenant()
  const { field, handleSubmit } = useForm(
    exercise
      ? { nome: exercise.nome, grupo_muscular: exercise.grupo_muscular ?? '', video_url: exercise.video_url ?? '', instrucoes: exercise.instrucoes ?? '' }
      : EMPTY,
    { nome: [rules.required()] },
  )
  const mutation = useMutationToast(
    (v) => {
      const payload = { nome: v.nome, grupo_muscular: v.grupo_muscular || null, video_url: v.video_url || null, instrucoes: v.instrucoes || null }
      return exercise ? exerciseService.update(exercise.id, payload) : exerciseService.create(academyId, payload)
    },
    {
      success: exercise ? 'Exercício atualizado' : 'Exercício criado',
      invalidate: [['exercises', academyId]],
      onSuccess: (data) => {
        onSaved?.(data?.id ?? exercise?.id)
        onClose()
      },
    },
  )
  const submit = handleSubmit((v) => mutation.mutate(v))

  return (
    <Modal
      open
      onClose={onClose}
      title={exercise ? 'Editar exercício' : 'Novo exercício'}
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
          <Select label="Grupo muscular" placeholder="Selecione" options={MUSCLE_GROUPS.map((g) => ({ value: g, label: g }))} {...field('grupo_muscular')} />
          <FullRow>
            <Input label="Link do vídeo" type="url" placeholder="https://youtube.com/..." {...field('video_url')} />
          </FullRow>
          <FullRow>
            <Textarea label="Instruções de execução" {...field('instrucoes')} />
          </FullRow>
        </FormGrid>
      </form>
    </Modal>
  )
}

export default function ExerciciosTab() {
  const { academyId } = useTenant()
  const { can } = usePermissions()
  const [editing, setEditing] = useState(null)
  const [grupo, setGrupo] = useState('')
  const [confirm, confirmDialog] = useConfirm()
  const query = useQuery({ queryKey: ['exercises', academyId], queryFn: () => exerciseService.list(academyId) })
  const removeMutation = useMutationToast(exerciseService.remove, { success: 'Exercício removido', invalidate: [['exercises', academyId]] })

  if (query.isError) return <QueryError error={query.error} onRetry={query.refetch} />

  return (
    <>
      {confirmDialog}
      <DataTable
        loading={query.isPending}
        data={(query.data ?? []).filter((e) => !grupo || e.grupo_muscular === grupo)}
        searchKeys={['nome', 'grupo_muscular']}
        searchPlaceholder="Buscar exercício"
        filters={
          <Select aria-label="Grupo" placeholder="Todos os grupos" value={grupo} onChange={(e) => setGrupo(e.target.value)} options={MUSCLE_GROUPS.map((g) => ({ value: g, label: g }))} />
        }
        actions={
          can('treinos.criar') && (
            <Button icon={Plus} onClick={() => setEditing({})}>
              Novo exercício
            </Button>
          )
        }
        emptyTitle="Nenhum exercício cadastrado"
        columns={[
          { key: 'nome', header: 'Exercício', render: (e) => <strong>{e.nome}</strong> },
          { key: 'grupo_muscular', header: 'Grupo muscular', render: (e) => e.grupo_muscular ?? '—' },
          {
            key: 'video_url',
            header: 'Vídeo',
            sortable: false,
            render: (e) =>
              e.video_url ? (
                <a href={e.video_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                  <Video size={15} /> Assistir
                </a>
              ) : (
                '—'
              ),
          },
          {
            key: 'acoes',
            header: '',
            sortable: false,
            align: 'right',
            render: (e) => (
              <div style={{ display: 'inline-flex', gap: 4 }}>
                {can('treinos.editar') && <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditing(e)} aria-label="Editar" />}
                {can('treinos.excluir') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Trash2}
                    aria-label="Remover"
                    onClick={async () => {
                      if (await confirm({ title: 'Remover exercício', message: `Remover ${e.nome} da biblioteca? Treinos existentes não são afetados.`, danger: true, confirmLabel: 'Remover' })) {
                        removeMutation.mutate(e.id)
                      }
                    }}
                  />
                )}
              </div>
            ),
          },
        ]}
      />
      {editing && <ExerciseModal exercise={editing.id ? editing : null} onClose={() => setEditing(null)} />}
    </>
  )
}
