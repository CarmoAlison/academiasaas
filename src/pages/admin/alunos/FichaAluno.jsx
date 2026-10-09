import { useQuery } from '@tanstack/react-query'
import {
  CalendarCheck,
  CircleDollarSign,
  Dumbbell,
  FileSignature,
  MessageCircle,
  Pencil,
  Plus,
  ScanLine,
  ShieldAlert,
  UserCheck,
  UserPlus,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import ContractModal from '../../../components/contract/ContractModal'
import QueryError from '../../../components/feedback/QueryError'
import Timeline from '../../../components/timeline/Timeline'
import { Badge, Button, Card, DataTable, EmptyState, SkeletonCard, StatCard, StatGrid, StatusBadge } from '../../../components/ui'
import { useAcademySettings } from '../../../hooks/useAcademySettings'
import { useModules } from '../../../hooks/useModules'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { usePermissions } from '../../../hooks/usePermissions'
import { listStudentCheckins, manualCheckin } from '../../../services/checkinService'
import { cancelContract, issueContract, listStudentContracts } from '../../../services/contractService'
import { listStudentPaymentsAdmin } from '../../../services/paymentService'
import { studentHistory } from '../../../services/studentService'
import { listWorkoutsByStudent } from '../../../services/workoutService'
import { calcEncargos } from '../../../utils/cobranca'
import { PAYMENT_METHODS, STUDENT_STATUS } from '../../../utils/constants'
import { formatCurrency, formatDate, formatDateTime, toISODate } from '../../../utils/formatters'

/** Abas da ficha conforme módulos e permissões */
export function fichaTabs({ can, has }) {
  return [
    { key: 'dados', label: 'Dados' },
    { key: 'plano', label: has('financeiro') && can('financeiro.ver') ? 'Plano e pagamentos' : 'Plano' },
    has('treinos') && can('treinos.ver') && { key: 'treinos', label: 'Treinos' },
    has('checkin') && { key: 'frequencia', label: 'Frequência' },
    has('contratos') && { key: 'contratos', label: 'Contratos' },
    { key: 'historico', label: 'Histórico' },
  ].filter(Boolean)
}

/** Situação do plano (validade) */
export function PlanoResumo({ student }) {
  if (!student.plan) return <p className="text-muted">Sem plano.</p>
  return (
    <p>
      <strong>{student.plan.nome}</strong> · {formatCurrency(student.plan.valor)}
      <br />
      {student.plano_valido_ate ? (
        student.plano_valido_ate < toISODate() ? (
          <span style={{ color: 'var(--color-danger)' }}>Venceu em {formatDate(student.plano_valido_ate)} — gere a renovação no Financeiro</span>
        ) : (
          <span className="text-muted">Válido até {formatDate(student.plano_valido_ate)}</span>
        )
      ) : (
        <span className="text-muted">Validade definida no primeiro pagamento</span>
      )}
    </p>
  )
}

export function PlanoTab({ student, academyId }) {
  const mod = useModules()
  const { can } = usePermissions()
  const settings = useAcademySettings().data
  const fin = mod.has('financeiro') && can('financeiro.ver')
  const payments = useQuery({
    queryKey: ['payments', academyId, 'student', student.id, 'all'],
    queryFn: () => listStudentPaymentsAdmin(academyId, student.id, 200),
    enabled: fin,
  })
  const list = payments.data ?? []
  const pagos = list.filter((p) => p.status === 'pago')
  const abertos = list.filter((p) => p.status === 'pendente')
  const atrasados = abertos.filter((p) => p.vencimento < toISODate())
  const totalAberto = abertos.reduce((acc, p) => acc + calcEncargos(p, settings).total, 0)

  return (
    <>
      <Card title="Plano">
        <PlanoResumo student={student} />
      </Card>
      {fin && (
        <>
          <div style={{ marginTop: 20 }}>
            <StatGrid>
              <StatCard label="Total pago" value={formatCurrency(pagos.reduce((a, p) => a + Number(p.valor), 0))} icon={CircleDollarSign} tone="success" loading={payments.isPending} hint={`${pagos.length} pagamento(s)`} />
              <StatCard
                label="Em aberto"
                value={formatCurrency(totalAberto)}
                icon={CalendarCheck}
                tone={atrasados.length ? 'danger' : 'warning'}
                loading={payments.isPending}
                hint={atrasados.length ? `${atrasados.length} parcela(s) vencida(s)${totalAberto ? ' · com multa e juros' : ''}` : `${abertos.length} parcela(s) a vencer`}
              />
            </StatGrid>
          </div>
          {payments.isError ? (
            <QueryError error={payments.error} onRetry={payments.refetch} />
          ) : (
            <DataTable
              loading={payments.isPending}
              searchable={false}
              data={list}
              emptyTitle="Nenhuma cobrança para este aluno"
              emptyAction={can('financeiro.criar') && <Button variant="outline" to="/admin/financeiro">Ir para o Financeiro</Button>}
              columns={[
                { key: 'vencimento', header: 'Vencimento', render: (p) => formatDate(p.vencimento) },
                { key: 'descricao', header: 'Descrição', render: (p) => `${p.descricao ?? 'Cobrança'}${p.plano_nome ? ` · ${p.plano_nome}` : ''}` },
                { key: 'valor', header: 'Valor', align: 'right', render: (p) => formatCurrency(p.valor) },
                { key: 'situacao', header: 'Status', render: (p) => <StatusBadge status={p.situacao} /> },
                {
                  key: 'pago_em',
                  header: 'Pagamento',
                  render: (p) =>
                    p.pago_em ? `${formatDate(p.pago_em)} · ${PAYMENT_METHODS.find((m) => m.value === p.forma_pagamento)?.label ?? ''}` : <span className="text-muted">—</span>,
                },
              ]}
            />
          )}
        </>
      )}
    </>
  )
}

export function TreinosTab({ student, academyId }) {
  const { can } = usePermissions()
  const workouts = useQuery({
    queryKey: ['workouts', academyId, 'student', student.id],
    queryFn: () => listWorkoutsByStudent(academyId, student.id),
  })
  if (workouts.isError) return <QueryError error={workouts.error} onRetry={workouts.refetch} />
  return (
    <DataTable
      loading={workouts.isPending}
      data={workouts.data ?? []}
      emptyTitle="Nenhum treino para este aluno"
      emptyAction={can('treinos.criar') && <Button icon={Plus} to={`/admin/treinos/novo?aluno=${student.id}`}>Montar treino</Button>}
      actions={
        can('treinos.criar') && (
          <Button size="sm" icon={Plus} to={`/admin/treinos/novo?aluno=${student.id}`}>
            Novo treino
          </Button>
        )
      }
      columns={[
        {
          key: 'nome',
          header: 'Treino',
          render: (w) => (
            <Link to={`/admin/treinos/${w.id}`} style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontWeight: 600 }}>
              <Dumbbell size={16} /> {w.nome}
            </Link>
          ),
        },
        { key: 'objetivo', header: 'Objetivo', render: (w) => w.objetivo || <span className="text-muted">—</span> },
        { key: 'professor_nome', header: 'Professor', render: (w) => w.professor_nome || <span className="text-muted">—</span> },
        { key: 'data_inicio', header: 'Período', render: (w) => `${formatDate(w.data_inicio)}${w.data_fim ? ` a ${formatDate(w.data_fim)}` : ''}` },
        { key: 'vigente', header: 'Situação', render: (w) => (w.vigente ? <Badge tone="success">Vigente</Badge> : <Badge>Encerrado</Badge>) },
      ]}
    />
  )
}

export function FrequenciaTab({ student, academyId }) {
  const { can } = usePermissions()
  const checkins = useQuery({
    queryKey: ['checkins', academyId, 'student', student.id, 'ficha'],
    queryFn: () => listStudentCheckins(student.id, 200),
  })
  const checkin = useMutationToast(() => manualCheckin(student.id), {
    success: (r) => (r?.repetido ? 'Já havia check-in nas últimas 3 horas' : 'Check-in registrado'),
    invalidate: [['checkins', academyId]],
  })
  if (checkins.isError) return <QueryError error={checkins.error} onRetry={checkins.refetch} />

  const list = checkins.data ?? []
  const desde = (dias) => list.filter((c) => Date.now() - new Date(c.created_at) <= dias * 86400000).length
  // média semanal nas últimas 8 semanas
  const media = (desde(56) / 8).toLocaleString('pt-BR', { maximumFractionDigits: 1 })

  return (
    <>
      <StatGrid>
        <StatCard label="Últimos 30 dias" value={desde(30)} icon={ScanLine} loading={checkins.isPending} hint="check-ins" />
        <StatCard label="Média por semana" value={media} icon={CalendarCheck} tone="success" loading={checkins.isPending} hint="Últimas 8 semanas" />
        <StatCard
          label="Último check-in"
          value={list[0] ? formatDate(list[0].created_at) : '—'}
          icon={UserCheck}
          tone="warning"
          loading={checkins.isPending}
          hint={list[0] ? `${Math.floor((Date.now() - new Date(list[0].created_at)) / 86400000)} dia(s) atrás` : 'Nenhum check-in ainda'}
        />
      </StatGrid>
      <DataTable
        loading={checkins.isPending}
        searchable={false}
        data={list}
        emptyTitle="Nenhum check-in"
        actions={
          can('alunos.editar') && (
            <Button size="sm" icon={UserCheck} loading={checkin.isPending} onClick={() => checkin.mutate()}>
              Registrar check-in
            </Button>
          )
        }
        columns={[
          { key: 'created_at', header: 'Data e hora', render: (c) => formatDateTime(c.created_at) },
          { key: 'origem', header: 'Origem', render: (c) => (c.origem === 'qr' ? 'QR Code' : 'Manual (recepção)') },
        ]}
      />
    </>
  )
}

export function ContratosTab({ student }) {
  const { can } = usePermissions()
  const [open, setOpen] = useState(null)
  const contracts = useQuery({ queryKey: ['contracts', student.id], queryFn: () => listStudentContracts(student.id) })
  const issue = useMutationToast(() => issueContract(student.id), {
    success: 'Contrato enviado. O aluno aceita pela área do aluno.',
    invalidate: [['contracts', student.id]],
  })
  const cancel = useMutationToast(cancelContract, { success: 'Contrato cancelado', invalidate: [['contracts', student.id]] })
  if (contracts.isError) return <QueryError error={contracts.error} onRetry={contracts.refetch} />
  const list = contracts.data ?? []

  return (
    <>
      <DataTable
        loading={contracts.isPending}
        searchable={false}
        data={list}
        emptyTitle="Nenhum contrato"
        emptyDescription="Gere a partir do modelo em Configurações; o aluno aceita pela área dele."
        actions={
          can('alunos.editar') && (
            <Button size="sm" icon={FileSignature} loading={issue.isPending} onClick={() => issue.mutate()}>
              {list.some((c) => c.status !== 'cancelado') ? 'Gerar novo contrato' : 'Gerar contrato'}
            </Button>
          )
        }
        columns={[
          { key: 'titulo', header: 'Contrato', render: (c) => <strong>{c.titulo}</strong> },
          { key: 'created_at', header: 'Enviado em', render: (c) => formatDateTime(c.created_at) },
          { key: 'status', header: 'Status', render: (c) => <StatusBadge status={c.status} /> },
          { key: 'aceito_em', header: 'Aceite', render: (c) => (c.aceito_em ? formatDateTime(c.aceito_em) : <span className="text-muted">—</span>) },
          {
            key: 'acoes',
            header: '',
            sortable: false,
            align: 'right',
            render: (c) => (
              <span style={{ display: 'inline-flex', gap: 4 }}>
                <Button size="sm" variant="outline" onClick={() => setOpen(c.id)}>
                  Ver
                </Button>
                {c.status === 'pendente' && can('alunos.editar') && (
                  <Button size="sm" variant="ghost" loading={cancel.isPending} onClick={() => cancel.mutate(c.id)}>
                    Cancelar
                  </Button>
                )}
              </span>
            ),
          },
        ]}
      />
      <ContractModal contractId={open} onClose={() => setOpen(null)} />
    </>
  )
}

const statusLabel = (v) => STUDENT_STATUS.find((s) => s.value === v)?.label.toLowerCase() ?? v
const WA_LABEL = { lembrete: 'lembrete de vencimento', atraso: 'cobrança de atraso', recibo: 'recibo', sumido: 'mensagem de aluno sumido', aniversario: 'parabéns de aniversário', livre: 'mensagem' }
const CAMPOS = { nome: 'nome', telefone: 'telefone', email_contato: 'e-mail', data_nascimento: 'nascimento', endereco: 'endereço', cidade: 'cidade', responsavel: 'responsável', observacoes: 'observações', unit_id: 'unidade' }

/** Registro do histórico → frases legíveis */
function describe(r, plans) {
  const a = r.dados_antes ?? {}
  const d = r.dados_depois ?? {}
  const plan = (id) => plans?.find((p) => p.id === id)?.nome ?? (id ? 'outro plano' : 'sem plano')
  const out = []
  if (r.origem === 'whatsapp') return [{ icon: MessageCircle, text: `WhatsApp: ${WA_LABEL[r.tabela] ?? 'mensagem'} enviada` }]
  if (r.origem === 'contrato')
    return [{ icon: FileSignature, text: r.acao === 'aceito' ? `Contrato aceito: ${r.tabela}` : `Contrato enviado: ${r.tabela}`, tone: r.acao === 'aceito' ? 'ok' : undefined }]

  if (r.tabela === 'students') {
    if (r.acao === 'insert') out.push({ icon: UserPlus, text: `Aluno matriculado${d.plan_id ? ` no plano ${plan(d.plan_id)}` : ''}`, tone: 'ok' })
    else if (r.acao === 'soft_delete') out.push({ icon: ShieldAlert, text: 'Aluno excluído', tone: 'bad' })
    else {
      if (a.status !== d.status) out.push({ icon: ShieldAlert, text: `Status: ${statusLabel(a.status)} → ${statusLabel(d.status)}`, tone: d.status === 'ativo' ? 'ok' : 'bad' })
      if ((a.plan_id ?? null) !== (d.plan_id ?? null)) out.push({ icon: CircleDollarSign, text: `Plano: ${plan(a.plan_id)} → ${plan(d.plan_id)}` })
      if (a.plano_valido_ate !== d.plano_valido_ate && d.plano_valido_ate)
        out.push({ icon: CalendarCheck, text: `Plano válido até ${formatDate(d.plano_valido_ate)}` })
      const outros = Object.keys(CAMPOS).filter((k) => (a[k] ?? null) !== (d[k] ?? null))
      if (outros.length) out.push({ icon: Pencil, text: `Cadastro atualizado: ${outros.map((k) => CAMPOS[k]).join(', ')}` })
    }
  }
  if (r.tabela === 'profiles' && r.acao === 'update') {
    const outros = ['nome', 'telefone', 'email_contato'].filter((k) => (a[k] ?? null) !== (d[k] ?? null))
    if (outros.length) out.push({ icon: Pencil, text: `Contato atualizado: ${outros.map((k) => CAMPOS[k]).join(', ')}` })
    if (a.must_change_password === false && d.must_change_password === true) out.push({ icon: ShieldAlert, text: 'Senha redefinida pela academia' })
  }
  if (r.tabela === 'payments') {
    const venc = formatDate(d.vencimento ?? a.vencimento)
    if (r.acao === 'insert') out.push({ icon: CircleDollarSign, text: `Cobrança criada: ${formatCurrency(d.valor)} (venc. ${venc})` })
    else if (r.acao === 'soft_delete') out.push({ icon: CircleDollarSign, text: `Cobrança excluída: ${formatCurrency(a.valor)} (venc. ${venc})`, tone: 'bad' })
    else if (a.status !== d.status) {
      const label = { pago: 'paga', cancelado: 'cancelada', pendente: 'reaberta' }[d.status] ?? d.status
      out.push({ icon: CircleDollarSign, text: `Cobrança de ${formatCurrency(d.valor)} (venc. ${venc}) ${label}`, tone: d.status === 'pago' ? 'ok' : undefined })
    }
  }
  if (r.tabela === 'workouts') {
    if (r.acao === 'insert') out.push({ icon: Dumbbell, text: `Treino criado: ${d.nome}` })
    else if (r.acao === 'soft_delete') out.push({ icon: Dumbbell, text: `Treino excluído: ${a.nome}` })
  }
  if (r.tabela === 'class_bookings' && r.acao === 'insert') out.push({ icon: CalendarCheck, text: `Reservou aula para ${formatDate(d.data)}` })
  return out
}

export function HistoricoTab({ student, plans }) {
  const query = useQuery({ queryKey: ['student', student.id, 'history'], queryFn: () => studentHistory(student.id) })
  if (query.isError) return <QueryError error={query.error} onRetry={query.refetch} />
  if (query.isPending) return <SkeletonCard lines={6} />

  const events = query.data
    .flatMap((r, i) => describe(r, plans).map((e, j) => ({ ...e, key: `${i}-${j}`, at: r.created_at, by: r.user_nome })))
    .sort((x, y) => y.at.localeCompare(x.at))

  return (
    <Card title="Histórico" subtitle="Matrícula, mudanças de plano e status, pagamentos, treinos, contratos e mensagens enviadas">
      {events.length ? <Timeline events={events} /> : <EmptyState compact title="Sem histórico ainda" />}
    </Card>
  )
}

