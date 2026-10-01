import { useQuery } from '@tanstack/react-query'
import { Pencil, Plus, Trash2, Upload, Video, X } from 'lucide-react'
import { useRef, useState } from 'react'
import QueryError from '../../../components/feedback/QueryError'
import { Button, DataTable, FormGrid, FullRow, Input, Modal, Select, Textarea, useConfirm, useToast } from '../../../components/ui'
import VideoPlayer, { VideoModal } from '../../../components/video/VideoPlayer'
import { useTenant } from '../../../hooks/useAuth'
import { useForm } from '../../../hooks/useForm'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { usePermissions } from '../../../hooks/usePermissions'
import { exerciseService, uploadExerciseVideo } from '../../../services/catalogServices'
import { MUSCLE_GROUPS } from '../../../utils/constants'
import { errorMessage } from '../../../utils/errors'
import { rules } from '../../../utils/validators'
import { parseVideo, VIDEO_MAX_MB } from '../../../utils/video'

const EMPTY = { nome: '', grupo_muscular: '', video_url: '', instrucoes: '' }

/**
 * Modal de cadastro/edição de exercício (também usado no formulário de treino)
 * @param {{ exercise?: object|null, onClose: () => void, onSaved?: (id: string) => void }} props
 */
export function ExerciseModal({ exercise, onClose, onSaved }) {
  const { academyId } = useTenant()
  const toast = useToast()
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)
  const { field, values, setValue, handleSubmit } = useForm(
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

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      setValue('video_url', await uploadExerciseVideo(academyId, file))
      toast.success('Vídeo enviado')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setUploading(false)
    }
  }

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
          <Button onClick={submit} loading={mutation.isPending} disabled={uploading}>
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
            <Input
              label="Vídeo"
              type="url"
              placeholder="Cole o link do YouTube/Vimeo ou envie um arquivo"
              hint={`Arquivo: MP4, WEBM ou MOV de até ${VIDEO_MAX_MB} MB`}
              {...field('video_url')}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <input ref={fileRef} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={onFile} />
              <Button type="button" variant="outline" size="sm" icon={Upload} loading={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? 'Enviando…' : 'Enviar arquivo de vídeo'}
              </Button>
              {values.video_url && (
                <Button type="button" variant="ghost" size="sm" icon={X} onClick={() => setValue('video_url', '')}>
                  Remover vídeo
                </Button>
              )}
            </div>
            {values.video_url && parseVideo(values.video_url) && (
              <div style={{ marginTop: 12 }}>
                <VideoPlayer url={values.video_url} title={values.nome || 'Vídeo do exercício'} />
              </div>
            )}
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
  const [watching, setWatching] = useState(null)
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
                <Button variant="ghost" size="sm" icon={Video} onClick={() => setWatching(e)}>
                  Assistir
                </Button>
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
      <VideoModal url={watching?.video_url} title={watching?.nome} onClose={() => setWatching(null)} />
    </>
  )
}
