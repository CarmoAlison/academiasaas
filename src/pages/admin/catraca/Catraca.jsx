import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DoorOpen, LogIn, ShieldX, Unlock } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import QueryError from '../../../components/feedback/QueryError'
import { Badge, Button, DataTable, Modal, PageHeader, Select, StatCard, StatGrid, Textarea } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { usePermissions } from '../../../hooks/usePermissions'
import { liberarCatraca, listAcessos, listCatracasAcademia } from '../../../services/catracaService'
import { supabase } from '../../../services/supabaseClient'
import { formatDateTime, toISODate } from '../../../utils/formatters'

const RESULTADOS = {
  liberado: { label: 'Entrou', tone: 'success' },
  bloqueado: { label: 'Bloqueado', tone: 'danger' },
  manual: { label: 'Liberado pela recepção', tone: 'info' },
  desistencia: { label: 'Não passou', tone: 'neutral' },
  nao_identificado: { label: 'Não identificado', tone: 'warning' },
}
const METODOS = { facial: 'Rosto', cartao: 'Cartão', qrcode: 'QR Code', senha: 'Senha' }

/** Liberar o giro manualmente (permissão "Liberar giro") */
function LiberarModal({ catracas, onClose }) {
  const { academyId } = useTenant()
  const [device, setDevice] = useState(catracas[0]?.id ?? '')
  const [motivo, setMotivo] = useState('')
  const liberar = useMutationToast(() => liberarCatraca(device, motivo), {
    success: 'Liberação enviada: a catraca gira em alguns segundos',
    invalidate: [['catraca-acessos', academyId]],
    onSuccess: onClose,
  })
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Liberar giro"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button icon={Unlock} loading={liberar.isPending} disabled={!device || !motivo.trim()} onClick={() => liberar.mutate()}>
            Liberar
          </Button>
        </>
      }
    >
      {catracas.length > 1 && (
        <Select label="Catraca" options={catracas.map((c) => ({ value: c.id, label: c.unidade ? `${c.nome} · ${c.unidade}` : c.nome }))} value={device} onChange={(e) => setDevice(e.target.value)} />
      )}
      <div style={{ marginTop: catracas.length > 1 ? 12 : 0 }}>
        <Textarea
          label="Motivo"
          required
          rows={2}
          placeholder="Ex.: visitante, aula experimental, aluno esqueceu o celular"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          hint="Fica registrado com o seu nome"
        />
      </div>
    </Modal>
  )
}

/** Catraca: quem entrou, quem foi bloqueado e liberação manual */
export default function Catraca() {
  const { academyId } = useTenant()
  const { can } = usePermissions()
  const queryClient = useQueryClient()
  const [resultado, setResultado] = useState('')
  const [dia, setDia] = useState(toISODate())
  const [liberar, setLiberar] = useState(false)
  const inicio = new Date(`${dia}T00:00:00`).toISOString()
  const fim = new Date(new Date(`${dia}T00:00:00`).getTime() + 86400000).toISOString()

  const acessos = useQuery({
    queryKey: ['catraca-acessos', academyId, dia],
    queryFn: () => listAcessos(academyId, { de: inicio }),
    select: (rows) => rows.filter((r) => r.created_at < fim),
    refetchInterval: 30000,
  })
  const catracas = useQuery({ queryKey: ['catracas-academia', academyId], queryFn: () => listCatracasAcademia(academyId) })

  // novos acessos aparecem na hora
  useEffect(() => {
    const channel = supabase
      .channel(`catraca-${academyId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'catraca_acessos', filter: `academy_id=eq.${academyId}` }, () =>
        queryClient.invalidateQueries({ queryKey: ['catraca-acessos', academyId] }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [academyId, queryClient])

  if (acessos.isError) return <QueryError error={acessos.error} onRetry={acessos.refetch} />

  const all = acessos.data ?? []
  const rows = all.filter((r) => !resultado || r.resultado === resultado)
  const conta = (res) => all.filter((r) => r.resultado === res).length
  const nomeCatraca = (id) => catracas.data?.find((c) => c.id === id)?.nome ?? '—'

  return (
    <>
      <PageHeader
        title="Catraca"
        subtitle="Quem entrou e quem foi bloqueado, em tempo real"
        actions={
          can('catraca.liberar') && (
            <Button icon={Unlock} onClick={() => setLiberar(true)} disabled={!catracas.data?.length}>
              Liberar giro
            </Button>
          )
        }
      />
      <StatGrid>
        <StatCard label="Entradas" value={conta('liberado')} icon={LogIn} tone="success" loading={acessos.isPending} hint="Também contam como check-in" />
        <StatCard label="Bloqueios" value={conta('bloqueado') + conta('nao_identificado')} icon={ShieldX} tone="danger" loading={acessos.isPending} />
        <StatCard label="Liberações pela recepção" value={conta('manual')} icon={DoorOpen} loading={acessos.isPending} />
      </StatGrid>
      <DataTable
        loading={acessos.isPending}
        data={rows}
        searchKeys={['nome', 'motivo', 'por_nome']}
        searchPlaceholder="Buscar aluno ou motivo"
        filters={
          <>
            <input type="date" aria-label="Dia" value={dia} max={toISODate()} onChange={(e) => e.target.value && setDia(e.target.value)} style={{ height: 40, padding: '0 10px', borderRadius: 8, border: '1px solid var(--color-border-strong)', background: 'var(--color-surface)', color: 'var(--color-text)', font: 'inherit' }} />
            <Select
              aria-label="Resultado"
              placeholder="Todos"
              value={resultado}
              onChange={(e) => setResultado(e.target.value)}
              options={Object.entries(RESULTADOS).map(([value, r]) => ({ value, label: r.label }))}
            />
          </>
        }
        initialSort={{ key: 'created_at', dir: 'desc' }}
        emptyTitle="Nenhum acesso neste dia"
        columns={[
          { key: 'created_at', header: 'Horário', render: (r) => formatDateTime(r.created_at) },
          {
            key: 'nome',
            header: 'Aluno',
            render: (r) => (r.student_id ? <Link to={`/admin/alunos/${r.student_id}`}><strong>{r.nome ?? 'Aluno'}</strong></Link> : <span className="text-muted">{r.nome ?? '—'}</span>),
          },
          { key: 'resultado', header: 'Resultado', render: (r) => <Badge tone={RESULTADOS[r.resultado]?.tone}>{RESULTADOS[r.resultado]?.label ?? r.resultado}</Badge> },
          {
            key: 'motivo',
            header: 'Motivo',
            render: (r) => (
              <span>
                {r.motivo ?? '—'}
                {r.por_nome && (
                  <small className="text-muted" style={{ display: 'block' }}>
                    por {r.por_nome}
                  </small>
                )}
              </span>
            ),
          },
          { key: 'metodo', header: 'Como', render: (r) => METODOS[r.metodo] ?? '—' },
          ...((catracas.data?.length ?? 0) > 1 ? [{ key: 'device_id', header: 'Catraca', render: (r) => nomeCatraca(r.device_id) }] : []),
        ]}
      />
      {liberar && <LiberarModal catracas={catracas.data ?? []} onClose={() => setLiberar(false)} />}
    </>
  )
}
