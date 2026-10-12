import { useQuery } from '@tanstack/react-query'
import { RotateCcw, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import QueryError from '../../../components/feedback/QueryError'
import { Badge, Button, DataTable, PageHeader, Select, Tooltip, useConfirm } from '../../../components/ui'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { useSuperRole } from '../../../hooks/useSuperRole'
import { listTrash, purgeTrashItem, restoreTrash } from '../../../services/saasService'
import { formatDateTime } from '../../../utils/formatters'

const DIAS = 15

const TIPOS = {
  mensalidade: { label: 'Mensalidade', tone: 'warning' },
  aluno: { label: 'Aluno', tone: 'info' },
  equipe: { label: 'Equipe', tone: 'info' },
  plano: { label: 'Plano', tone: 'neutral' },
  unidade: { label: 'Unidade', tone: 'neutral' },
  exercicio: { label: 'Exercício', tone: 'neutral' },
  treino: { label: 'Treino', tone: 'neutral' },
  aula: { label: 'Aula', tone: 'neutral' },
  perfil: { label: 'Perfil de acesso', tone: 'neutral' },
}

/** O que é apagado junto, para o aviso do "Apagar agora" */
const APAGA_JUNTO = {
  aluno: 'as mensalidades (inclusive pagas), recibos, contratos, check-ins, reservas, treinos e o acesso dele',
  plano: 'os alunos que usam este plano ficarão sem plano',
  unidade: 'os alunos e aulas desta unidade ficarão sem unidade',
  exercicio: 'ele sai de todas as fichas de treino',
  equipe: 'ele deixa de aparecer como professor em treinos e aulas',
  aula: 'as reservas desta aula',
  treino: 'os dias, exercícios e registros de carga deste treino',
  perfil: 'quem tinha este perfil perde as permissões dele',
}

/** Dias até a exclusão definitiva */
const restante = (excluidoEm) => Math.max(0, DIAS - Math.floor((Date.now() - new Date(excluidoEm)) / 86400000))

/** Lixeira: tudo que as academias excluíram (apagado de vez após 15 dias) */
export default function Lixeira() {
  const { superCan } = useSuperRole()
  const [confirm, confirmDialog] = useConfirm()
  const [academia, setAcademia] = useState('')
  const [tipo, setTipo] = useState('')
  const query = useQuery({ queryKey: ['trash'], queryFn: listTrash })
  const restore = useMutationToast(restoreTrash, { success: 'Item restaurado', invalidate: [['trash']] })
  const purge = useMutationToast(purgeTrashItem, { success: 'Apagado definitivamente', invalidate: [['trash']] })
  const pode = superCan('academias')

  const academias = useMemo(() => {
    const map = new Map()
    for (const r of query.data ?? []) map.set(r.academy_id, r.academy?.nome ?? '—')
    return [...map].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
  }, [query.data])
  const rows = (query.data ?? []).filter((r) => (!academia || r.academy_id === academia) && (!tipo || r.tipo === tipo))

  if (query.isError) return <QueryError error={query.error} onRetry={query.refetch} />

  return (
    <>
      {confirmDialog}
      <PageHeader
        title="Lixeira"
        subtitle={`Tudo que as academias excluíram. Não aparece nem conta em lugar nenhum e é apagado de vez após ${DIAS} dias.`}
      />
      <DataTable
        loading={query.isPending}
        data={rows}
        searchKeys={['titulo', 'subtitulo', (r) => r.academy?.nome, 'excluido_por_nome']}
        searchPlaceholder="Buscar item, academia ou quem excluiu"
        filters={
          <>
            <Select
              aria-label="Tipo"
              placeholder="Todos os tipos"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              options={Object.entries(TIPOS).map(([value, t]) => ({ value, label: t.label }))}
            />
            {academias.length > 1 && (
              <Select aria-label="Academia" placeholder="Todas as academias" value={academia} onChange={(e) => setAcademia(e.target.value)} options={academias} />
            )}
          </>
        }
        initialSort={{ key: 'excluido_em', dir: 'desc' }}
        emptyTitle="Lixeira vazia"
        emptyDescription="Quando uma academia excluir algo, aparece aqui por 15 dias."
        columns={[
          { key: 'tipo', header: 'Tipo', render: (r) => <Badge tone={TIPOS[r.tipo]?.tone}>{TIPOS[r.tipo]?.label ?? r.tipo}</Badge> },
          {
            key: 'titulo',
            header: 'Item',
            render: (r) => (
              <span>
                <strong>{r.titulo ?? '—'}</strong>
                {r.subtitulo && (
                  <small className="text-muted" style={{ display: 'block' }}>
                    {r.subtitulo}
                  </small>
                )}
              </span>
            ),
          },
          { key: 'academia', header: 'Academia', render: (r) => r.academy?.nome ?? '—' },
          {
            key: 'excluido_em',
            header: 'Excluído',
            render: (r) => (
              <span>
                {formatDateTime(r.excluido_em)}
                <small className="text-muted" style={{ display: 'block' }}>
                  {r.excluido_por_nome ?? 'sistema'}
                </small>
              </span>
            ),
          },
          {
            key: 'restante',
            header: 'Apaga em',
            sortable: false,
            render: (r) => {
              const d = restante(r.excluido_em)
              return <Badge tone={d <= 2 ? 'danger' : 'neutral'}>{d === 0 ? 'hoje' : `${d} dia(s)`}</Badge>
            },
          },
          pode && {
            key: 'acoes',
            header: '',
            sortable: false,
            align: 'right',
            render: (r) => (
              <span style={{ display: 'inline-flex', gap: 4 }}>
                <Tooltip content="Restaurar">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={RotateCcw}
                    aria-label="Restaurar"
                    loading={restore.isPending && restore.variables === r.id}
                    onClick={async () => {
                      if (
                        await confirm({
                          title: 'Restaurar',
                          message: `"${r.titulo ?? 'Item'}" volta para a academia exatamente como estava${r.tipo === 'aluno' ? ', com as mensalidades e treinos dele' : ''}.`,
                          confirmLabel: 'Restaurar',
                        })
                      ) {
                        restore.mutate(r.id)
                      }
                    }}
                  />
                </Tooltip>
                <Tooltip content="Apagar agora">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Trash2}
                    aria-label="Apagar agora"
                    onClick={async () => {
                      if (
                        await confirm({
                          title: 'Apagar definitivamente',
                          message: `"${r.titulo ?? 'Item'}" será apagado de vez, sem esperar os ${DIAS} dias.${APAGA_JUNTO[r.tipo] ? ` Junto: ${APAGA_JUNTO[r.tipo]}.` : ''} Não tem volta.`,
                          danger: true,
                          confirmLabel: 'Apagar',
                        })
                      ) {
                        purge.mutate(r.id)
                      }
                    }}
                  />
                </Tooltip>
              </span>
            ),
          },
        ].filter(Boolean)}
      />
    </>
  )
}
