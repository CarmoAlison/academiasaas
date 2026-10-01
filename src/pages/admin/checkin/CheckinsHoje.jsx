import { useQuery } from '@tanstack/react-query'
import { LogIn, QrCode, Search, Trash2, UserCheck } from 'lucide-react'
import { useState } from 'react'
import QueryError from '../../../components/feedback/QueryError'
import { Avatar, Badge, Button, Card, EmptyState, Input, SkeletonCard, useConfirm } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { useDebounce } from '../../../hooks/useDebounce'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { usePermissions } from '../../../hooks/usePermissions'
import { listCheckins, manualCheckin, removeCheckin, searchActiveStudents } from '../../../services/checkinService'
import { addDays, formatCPF, formatTime } from '../../../utils/formatters'
import styles from './Checkin.module.css'

const startOfDay = (d = new Date()) => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function ManualCheckin() {
  const { academyId } = useTenant()
  const [term, setTerm] = useState('')
  const debounced = useDebounce(term.trim(), 300)
  const results = useQuery({
    queryKey: ['checkin-search', academyId, debounced],
    queryFn: () => searchActiveStudents(academyId, debounced),
    enabled: debounced.length >= 2,
  })
  const mutation = useMutationToast((studentId) => manualCheckin(studentId), {
    success: (r) => (r?.repetido ? 'Este aluno já tinha check-in nas últimas 3 horas' : 'Check-in registrado'),
    invalidate: [['checkins', academyId]],
    onSuccess: () => setTerm(''),
  })

  return (
    <Card title="Check-in manual" subtitle="Para quem está sem celular">
      <Input icon={Search} placeholder="Nome ou CPF do aluno" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Buscar aluno" />
      {debounced.length >= 2 && (
        <ul className={styles.list} style={{ marginTop: 12 }}>
          {results.isPending ? (
            <li><SkeletonCard lines={2} /></li>
          ) : !results.data?.length ? (
            <li className="text-muted">Nenhum aluno ativo encontrado.</li>
          ) : (
            results.data.map((s) => (
              <li key={s.id} className={styles.item}>
                <Avatar name={s.nome} src={s.avatar_url} size={32} />
                <div className={styles.itemInfo}>
                  <strong>{s.nome}</strong>
                  <span className="text-muted" style={{ fontSize: 12 }}>
                    {formatCPF(s.cpf)}
                  </span>
                </div>
                {s.inadimplente && <Badge tone="danger">Inadimplente</Badge>}
                <Button size="sm" icon={UserCheck} loading={mutation.isPending && mutation.variables === s.id} onClick={() => mutation.mutate(s.id)}>
                  Registrar
                </Button>
              </li>
            ))
          )}
        </ul>
      )}
    </Card>
  )
}

/** Entradas do dia (atualiza sozinho) + check-in manual */
export default function CheckinsHoje() {
  const { academyId } = useTenant()
  const { can } = usePermissions()
  const [confirm, confirmDialog] = useConfirm()
  const de = startOfDay()
  const query = useQuery({
    queryKey: ['checkins', academyId, de.toISOString()],
    queryFn: () => listCheckins(academyId, de.toISOString(), addDays(de, 1).toISOString()),
    refetchInterval: 15000,
  })
  const remove = useMutationToast(removeCheckin, { success: 'Check-in removido', invalidate: [['checkins', academyId]] })

  if (query.isError) return <QueryError error={query.error} onRetry={query.refetch} />
  const list = query.data ?? []

  return (
    <div className={styles.columns}>
      {confirmDialog}
      <Card title={`Entradas de hoje${query.data ? ` (${list.length})` : ''}`} subtitle="Atualiza automaticamente">
        {query.isPending ? (
          <SkeletonCard lines={4} />
        ) : !list.length ? (
          <EmptyState compact icon={LogIn} title="Nenhum check-in hoje" description="As entradas pelo QR Code aparecem aqui na hora." />
        ) : (
          <ul className={styles.list}>
            {list.map((c) => (
              <li key={c.id} className={styles.item}>
                <span className={styles.time}>{formatTime(new Date(c.created_at).toTimeString())}</span>
                <Avatar name={c.student?.profile?.nome} src={c.student?.profile?.avatar_url} size={32} />
                <div className={styles.itemInfo}>
                  <strong>{c.student?.profile?.nome}</strong>
                </div>
                <Badge tone={c.origem === 'qr' ? 'info' : 'neutral'}>
                  {c.origem === 'qr' ? (
                    <>
                      <QrCode size={12} /> QR
                    </>
                  ) : (
                    'Manual'
                  )}
                </Badge>
                {can('alunos.editar') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Trash2}
                    aria-label="Remover check-in"
                    onClick={async () => {
                      if (await confirm({ title: 'Remover check-in', message: `Remover a entrada de ${c.student?.profile?.nome}?`, danger: true, confirmLabel: 'Remover' })) {
                        remove.mutate(c.id)
                      }
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {can('alunos.editar') && <ManualCheckin />}
    </div>
  )
}
