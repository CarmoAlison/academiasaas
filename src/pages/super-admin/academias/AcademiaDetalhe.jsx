import { useQuery } from '@tanstack/react-query'
import { Building2, FileText, LogIn, MapPin, Package, Trash2, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ResetPasswordButton from '../../../components/auth/ResetPasswordButton'
import { PageLoader } from '../../../components/feedback/FullPageLoader'
import QueryError from '../../../components/feedback/QueryError'
import ReceiptModal from '../../../components/receipt/ReceiptModal'
import {
  Button,
  Card,
  DataTable,
  FormActions,
  FormGrid,
  Grid,
  Input,
  PageHeader,
  Select,
  StatCard,
  StatGrid,
  StatusBadge,
  useConfirm,
} from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { useForm } from '../../../hooks/useForm'
import { useMutationToast } from '../../../hooks/useMutationToast'
import {
  academyPrice,
  academyStats,
  getAcademy,
  listAcademyAdmins,
  listSaasInvoices,
  removeAcademy,
  setAcademySubscription,
  updateAcademy,
} from '../../../services/saasService'
import { ACADEMY_STATUS, UFS } from '../../../utils/constants'
import { formatCNPJ, formatCPF, formatCurrency, formatDate, formatPhone, paymentStatus } from '../../../utils/formatters'
import { rules } from '../../../utils/validators'
import { useSuperRole } from '../../../hooks/useSuperRole'
import SubscriptionFields from './SubscriptionFields'

function EditForm({ academy }) {
  const canEdit = useSuperRole().superCan('academias')
  const { field, handleSubmit, reset } = useForm(
    {
      nome: academy.nome,
      cnpj: formatCNPJ(academy.cnpj ?? ''),
      email: academy.email ?? '',
      telefone: formatPhone(academy.telefone ?? ''),
      uf: academy.uf ?? '',
      cidade: academy.cidade ?? '',
      status: academy.status,
    },
    { nome: [rules.required()], cnpj: [rules.cnpj()], email: [rules.email()] },
  )

  useEffect(() => {
    reset({
      nome: academy.nome,
      cnpj: formatCNPJ(academy.cnpj ?? ''),
      email: academy.email ?? '',
      telefone: formatPhone(academy.telefone ?? ''),
      uf: academy.uf ?? '',
      cidade: academy.cidade ?? '',
      status: academy.status,
    })
  }, [academy, reset])

  const mutation = useMutationToast((v) => updateAcademy(academy.id, v), {
    success: 'Academia atualizada',
    invalidate: [['academy', academy.id], ['academies'], ['super-dashboard']],
  })

  return (
    <form onSubmit={handleSubmit((v) => mutation.mutate(v))} noValidate>
      <FormGrid columns={2}>
        <Input label="Nome" required {...field('nome')} />
        <Input label="CNPJ" {...field('cnpj', { mask: 'cnpj' })} />
        <Input label="E-mail" type="email" {...field('email')} />
        <Input label="Telefone" {...field('telefone', { mask: 'phone' })} />
        <Input label="Cidade" hint="Usada nas ofertas por região" {...field('cidade')} />
        <Select label="UF" placeholder="—" options={UFS.map((u) => ({ value: u, label: u }))} {...field('uf')} />
        <Select label="Status" options={ACADEMY_STATUS} {...field('status')} />
      </FormGrid>
      {canEdit && (
        <div style={{ marginTop: 20 }}>
          <FormActions>
            <Button type="submit" loading={mutation.isPending}>
              Salvar
            </Button>
          </FormActions>
        </div>
      )}
    </form>
  )
}

const subscriptionOf = (a) => ({
  plan: a.saas_plan_id ?? '',
  ciclo: a.ciclo ?? 'mensal',
  addons: (a.academy_addons ?? []).map((x) => x.addon_id),
  offer: a.offer_id ?? null,
})

/** Plano, ciclo (mensal/anual), adicionais e oferta da academia */
function SubscriptionCard({ academy }) {
  const { superCan } = useSuperRole()
  const canEdit = superCan('academias') || superCan('financeiro')
  const [value, setValue] = useState(() => subscriptionOf(academy))
  useEffect(() => setValue(subscriptionOf(academy)), [academy])

  const mutation = useMutationToast(() => setAcademySubscription(academy.id, value), {
    success: 'Assinatura atualizada. A fatura em aberto deste mês foi recalculada.',
    invalidate: [['academy', academy.id], ['academies'], ['saas-invoices'], ['saas-offers'], ['super-dashboard']],
  })
  const changed = JSON.stringify(value) !== JSON.stringify(subscriptionOf(academy))

  return (
    <Card
      title="Assinatura"
      subtitle={
        academy.ciclo_inicio
          ? `Ciclo ${academy.ciclo} desde ${formatDate(academy.ciclo_inicio).slice(3)}${academy.oferta_ate ? ` · oferta até ${formatDate(academy.oferta_ate)}` : ''}`
          : undefined
      }
    >
      <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <SubscriptionFields value={value} onChange={setValue} uf={academy.uf} cidade={academy.cidade} currentOfferId={academy.offer_id} ofertaAte={academy.oferta_ate} />
      </fieldset>
      {canEdit && (
        <div style={{ marginTop: 20 }}>
          <FormActions>
            {changed && (
              <Button variant="outline" onClick={() => setValue(subscriptionOf(academy))}>
                Desfazer
              </Button>
            )}
            <Button disabled={!changed || !value.plan} loading={mutation.isPending} onClick={() => mutation.mutate()}>
              Salvar assinatura
            </Button>
          </FormActions>
        </div>
      )}
    </Card>
  )
}

export default function AcademiaDetalhe() {
  const { superCan } = useSuperRole()
  const { id } = useParams()
  const navigate = useNavigate()
  const { setAcademy } = useTenant()
  const [confirm, confirmDialog] = useConfirm()
  const [receiptFor, setReceiptFor] = useState(null)

  const academy = useQuery({ queryKey: ['academy', id], queryFn: () => getAcademy(id) })
  const stats = useQuery({ queryKey: ['academy-stats', id], queryFn: () => academyStats(id) })
  const admins = useQuery({ queryKey: ['academy-admins', id], queryFn: () => listAcademyAdmins(id) })
  const invoices = useQuery({ queryKey: ['saas-invoices', id], queryFn: () => listSaasInvoices({ academyId: id }) })
  const price = useQuery({ queryKey: ['academy', id, 'price'], queryFn: () => academyPrice(id) })

  const removeMutation = useMutationToast(() => removeAcademy(id), {
    success: 'Academia excluída',
    invalidate: [['academies'], ['super-dashboard']],
    onSuccess: () => navigate('/super-admin/academias', { replace: true }),
  })

  if (academy.isPending) return <PageLoader />
  if (academy.isError) return <QueryError error={academy.error} onRetry={academy.refetch} />
  const a = academy.data

  const onRemove = async () => {
    const ok = await confirm({
      title: 'Excluir academia',
      message: `${a.nome} será removida (exclusão lógica) e seus usuários perderão o acesso.`,
      danger: true,
      confirmLabel: 'Excluir',
    })
    if (ok) removeMutation.mutate()
  }

  return (
    <>
      {confirmDialog}
      <PageHeader
        title={a.nome}
        subtitle={a.cnpj ? `CNPJ ${formatCNPJ(a.cnpj)}` : undefined}
        breadcrumb={[{ label: 'Academias', to: '/super-admin/academias' }, { label: a.nome }]}
        actions={
          <>
            {superCan('academias') && (
              <Button variant="outline" icon={Trash2} onClick={onRemove}>
                Excluir
              </Button>
            )}
            {superCan('acessar') && (
              <Button
                icon={LogIn}
                disabled={a.status !== 'ativa'}
                onClick={() => {
                  setAcademy(a.id)
                  navigate('/admin')
                }}
              >
                Acessar como admin
              </Button>
            )}
          </>
        }
      />

      <StatGrid>
        <StatCard label="Alunos ativos" value={stats.data?.ativos} icon={Users} loading={stats.isPending} hint={`${stats.data?.alunos ?? 0} cadastrados`} />
        <StatCard label="Unidades" value={stats.data?.unidades} icon={MapPin} loading={stats.isPending} />
        <StatCard label="Planos" value={stats.data?.planos} icon={Package} loading={stats.isPending} />
        <StatCard label="Plano SaaS" value={a.saas_plan?.nome ?? '—'} icon={Building2} tone="success" hint={price.data ? `${formatCurrency(price.data.total)}/${price.data.meses === 12 ? 'ano' : 'mês'}` : undefined} />
      </StatGrid>

      <Grid min={460}>
        <Card title="Dados da academia">
          <EditForm academy={a} />
        </Card>

        <Card title="Administradores" padding={false}>
          <DataTable
            searchable={false}
            loading={admins.isPending}
            data={admins.data ?? []}
            pageSize={5}
            emptyTitle="Nenhum administrador"
            columns={[
              { key: 'nome', header: 'Nome' },
              { key: 'cpf', header: 'CPF', render: (p) => formatCPF(p.cpf) },
              { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
              { key: 'acoes', header: '', sortable: false, align: 'right', render: (p) => <ResetPasswordButton profileId={p.id} nome={p.nome} size="sm" /> },
            ]}
          />
        </Card>
      </Grid>

      <SubscriptionCard academy={a} />

      <Card title="Faturas SaaS" padding={false}>
        <DataTable
          searchable={false}
          loading={invoices.isPending}
          data={invoices.data ?? []}
          pageSize={6}
          emptyTitle="Nenhuma fatura"
          columns={[
            { key: 'competencia', header: 'Competência', render: (i) => formatDate(i.competencia).slice(3) },
            { key: 'saas_plan.nome', header: 'Plano', render: (i) => `${i.saas_plan?.nome ?? '—'}${i.ciclo === 'anual' ? ' · anual' : ''}` },
            { key: 'valor', header: 'Valor', align: 'right', render: (i) => formatCurrency(i.valor) },
            { key: 'vencimento', header: 'Vencimento', render: (i) => formatDate(i.vencimento) },
            { key: 'status', header: 'Status', render: (i) => <StatusBadge status={paymentStatus(i)} /> },
            {
              key: 'recibo',
              header: '',
              sortable: false,
              align: 'right',
              render: (i) =>
                i.status === 'pago' && (
                  <Button variant="ghost" size="sm" icon={FileText} onClick={() => setReceiptFor(i.id)}>
                    Recibo
                  </Button>
                ),
            },
          ]}
        />
      </Card>
      <ReceiptModal source="saas" paymentId={receiptFor} onClose={() => setReceiptFor(null)} />
    </>
  )
}
