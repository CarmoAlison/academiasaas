import { useQuery } from '@tanstack/react-query'
import { Dumbbell, Plus, Trash2 } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ResetPasswordButton from '../../../components/auth/ResetPasswordButton'
import { PageLoader } from '../../../components/feedback/FullPageLoader'
import QueryError from '../../../components/feedback/QueryError'
import {
  Button,
  Card,
  FormActions,
  FormGrid,
  FormSection,
  FullRow,
  Input,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
  useConfirm,
} from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { useForm } from '../../../hooks/useForm'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { usePermissions } from '../../../hooks/usePermissions'
import { planService, unitService } from '../../../services/catalogServices'
import { listStudentPaymentsAdmin } from '../../../services/paymentService'
import { createStudent, getStudent, removeStudent, updateStudent } from '../../../services/studentService'
import { listWorkoutsByStudent } from '../../../services/workoutService'
import { STUDENT_STATUS, UFS } from '../../../utils/constants'
import { formatCEP, formatCPF, formatCurrency, formatDate, formatPhone, toISODate } from '../../../utils/formatters'
import { rules } from '../../../utils/validators'
import styles from './AlunoForm.module.css'

const EMPTY = {
  nome: '', cpf: '', data_nascimento: '', responsavel: '', telefone: '', email_contato: '',
  cep: '', endereco: '', cidade: '', estado: '',
  plan_id: '', unit_id: '', data_matricula: toISODate(), status: 'ativo', observacoes: '',
}

const toForm = (s) => ({
  nome: s.profile?.nome ?? '',
  cpf: formatCPF(s.profile?.cpf ?? ''),
  data_nascimento: s.data_nascimento ?? '',
  responsavel: s.responsavel ?? '',
  telefone: formatPhone(s.profile?.telefone ?? ''),
  email_contato: s.profile?.email_contato ?? '',
  cep: formatCEP(s.cep ?? ''),
  endereco: s.endereco ?? '',
  cidade: s.cidade ?? '',
  estado: s.estado ?? '',
  plan_id: s.plan_id ?? '',
  unit_id: s.unit_id ?? '',
  data_matricula: s.data_matricula ?? '',
  status: s.status,
  observacoes: s.observacoes ?? '',
})

/** Painel lateral do aluno: senha, treinos e pagamentos */
function StudentSide({ student, academyId }) {
  const { can } = usePermissions()
  // só os registros deste aluno (não a academia inteira)
  const workouts = useQuery({
    queryKey: ['workouts', academyId, 'student', student.id],
    queryFn: () => listWorkoutsByStudent(academyId, student.id),
    enabled: can('treinos.ver'),
  })
  const payments = useQuery({
    queryKey: ['payments', academyId, 'student', student.id],
    queryFn: () => listStudentPaymentsAdmin(academyId, student.id, 5),
    enabled: can('financeiro.ver'),
  })
  const myWorkouts = (workouts.data ?? []).filter((w) => w.vigente)
  const myPayments = payments.data ?? []

  return (
    <div className={styles.side}>
      <Card title="Plano">
        {student.plan ? (
          <p>
            <strong>{student.plan.nome}</strong>
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
        ) : (
          <p className="text-muted">Sem plano.</p>
        )}
      </Card>

      <Card title="Acesso">
        <p className="text-muted" style={{ marginBottom: 12 }}>
          Login com CPF <strong>{formatCPF(student.profile.cpf)}</strong>.
          {student.profile.must_change_password && ' Ainda usando a senha padrão.'}
        </p>
        {can('alunos.editar') && <ResetPasswordButton profileId={student.profile.id} nome={student.profile.nome} />}
      </Card>

      {can('treinos.ver') && (
        <Card
          title="Treinos ativos"
          actions={can('treinos.criar') && <Button size="sm" variant="ghost" icon={Plus} to={`/admin/treinos/novo?aluno=${student.id}`}>Novo</Button>}
        >
          {myWorkouts.length ? (
            <ul className={styles.list}>
              {myWorkouts.map((w) => (
                <li key={w.id}>
                  <Dumbbell size={16} />
                  <Link to={`/admin/treinos/${w.id}`}>{w.nome}</Link>
                  <span className="text-muted">{w.data_fim ? `até ${formatDate(w.data_fim)}` : ''}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">Nenhum treino ativo.</p>
          )}
        </Card>
      )}

      {can('financeiro.ver') && (
        <Card title="Últimos pagamentos">
          {myPayments.length ? (
            <ul className={styles.list}>
              {myPayments.map((p) => (
                <li key={p.id}>
                  <span>{formatDate(p.vencimento)}</span>
                  <strong>{formatCurrency(p.valor)}</strong>
                  <StatusBadge status={p.situacao} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">Nenhum pagamento.</p>
          )}
        </Card>
      )}
    </div>
  )
}

export default function AlunoForm() {
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const { academyId } = useTenant()
  const { can } = usePermissions()
  const [confirm, confirmDialog] = useConfirm()
  const readOnly = !isNew && !can('alunos.editar')

  const student = useQuery({ queryKey: ['student', id], queryFn: () => getStudent(id), enabled: !isNew })
  const plans = useQuery({ queryKey: ['plans', academyId], queryFn: () => planService.list(academyId) })
  const units = useQuery({ queryKey: ['units', academyId], queryFn: () => unitService.list(academyId) })

  const { field, handleSubmit, reset, values, setValue } = useForm(EMPTY, {
    nome: [rules.required()],
    cpf: isNew ? [rules.required(), rules.cpf()] : [],
    email_contato: [rules.email()],
    data_matricula: [rules.required()],
  })

  useEffect(() => {
    if (student.data) reset(toForm(student.data))
  }, [student.data, reset])

  // Nova matrícula: seleciona a única unidade automaticamente
  useEffect(() => {
    if (isNew && !values.unit_id && units.data?.length === 1) setValue('unit_id', units.data[0].id)
  }, [isNew, units.data, values.unit_id, setValue])

  const saveMutation = useMutationToast((v) => (isNew ? createStudent(academyId, v) : updateStudent(student.data, v)), {
    success: (_, v) =>
      isNew ? `Aluno cadastrado! Senha inicial: ${v.cpf.replace(/\D/g, '').slice(0, 6)}` : 'Dados do aluno atualizados',
    invalidate: [['students', academyId], ['student', id], ['admin-dashboard', academyId]],
    onSuccess: (newId) => isNew && navigate(`/admin/alunos/${newId}`, { replace: true }),
  })

  const removeMutation = useMutationToast(() => removeStudent(student.data), {
    success: 'Aluno excluído',
    invalidate: [['students', academyId], ['admin-dashboard', academyId]],
    onSuccess: () => navigate('/admin/alunos', { replace: true }),
  })

  if (!isNew && student.isPending) return <PageLoader />
  if (!isNew && student.isError) return <QueryError error={student.error} onRetry={student.refetch} />

  const title = isNew ? 'Novo aluno' : student.data.profile?.nome

  const onRemove = async () => {
    if (await confirm({ title: 'Excluir aluno', message: `${title} perderá o acesso ao sistema. O histórico será mantido para auditoria.`, danger: true, confirmLabel: 'Excluir' })) {
      removeMutation.mutate()
    }
  }

  const form = (
    <Card>
      <form onSubmit={handleSubmit((v) => saveMutation.mutate(v))} noValidate>
        <fieldset disabled={readOnly} style={{ border: 'none', padding: 0, margin: 0, minWidth: 0 }}>
          <FormSection title="Dados pessoais">
            <FormGrid columns={2}>
              <Input label="Nome completo" required {...field('nome')} />
              <Input
                label="CPF"
                required={isNew}
                disabled={!isNew}
                inputMode="numeric"
                placeholder="000.000.000-00"
                hint={isNew ? 'Usado no login. Senha inicial: 6 primeiros dígitos.' : 'O CPF é a chave de login e não pode ser alterado'}
                {...field('cpf', { mask: 'cpf' })}
              />
              <Input label="Data de nascimento" type="date" {...field('data_nascimento')} />
              <Input label="Responsável" hint="Para alunos menores de idade" {...field('responsavel')} />
            </FormGrid>
          </FormSection>

          <FormSection title="Contato">
            <FormGrid columns={2}>
              <Input label="Telefone / WhatsApp" inputMode="tel" {...field('telefone', { mask: 'phone' })} />
              <Input label="E-mail" type="email" {...field('email_contato')} />
            </FormGrid>
          </FormSection>

          <FormSection title="Endereço">
            <FormGrid columns={4}>
              <Input label="CEP" inputMode="numeric" {...field('cep', { mask: 'cep' })} />
              <FullRow>
                <Input label="Endereço" placeholder="Rua, número, complemento" {...field('endereco')} />
              </FullRow>
              <Input label="Cidade" {...field('cidade')} />
              <Select label="UF" placeholder="—" options={UFS.map((u) => ({ value: u, label: u }))} {...field('estado')} />
            </FormGrid>
          </FormSection>

          <FormSection title="Matrícula">
            <FormGrid columns={2}>
              <Select
                label="Plano"
                placeholder="Sem plano"
                options={(plans.data ?? []).filter((p) => p.ativo || p.id === values.plan_id).map((p) => ({ value: p.id, label: `${p.nome} — ${formatCurrency(p.valor)}` }))}
                {...field('plan_id')}
              />
              <Select
                label="Unidade"
                placeholder="Selecione"
                options={(units.data ?? []).map((u) => ({ value: u.id, label: u.nome }))}
                {...field('unit_id')}
              />
              <Input label="Data de matrícula" type="date" required {...field('data_matricula')} />
              <Select label="Status" options={STUDENT_STATUS} {...field('status')} />
              <FullRow>
                <Textarea label="Observações" {...field('observacoes')} />
              </FullRow>
            </FormGrid>
          </FormSection>
        </fieldset>

        {!readOnly && (
          <FormActions>
            <Button variant="outline" to="/admin/alunos">
              Cancelar
            </Button>
            <Button type="submit" loading={saveMutation.isPending}>
              {isNew ? 'Cadastrar aluno' : 'Salvar alterações'}
            </Button>
          </FormActions>
        )}
      </form>
    </Card>
  )

  return (
    <>
      {confirmDialog}
      <PageHeader
        title={title}
        subtitle={!isNew ? `Matriculado em ${formatDate(student.data.data_matricula)}` : undefined}
        breadcrumb={[{ label: 'Alunos', to: '/admin/alunos' }, { label: isNew ? 'Novo' : title }]}
        actions={
          !isNew && can('alunos.excluir') && (
            <Button variant="outline" icon={Trash2} onClick={onRemove} loading={removeMutation.isPending}>
              Excluir
            </Button>
          )
        }
      />
      {isNew ? (
        form
      ) : (
        <div className={styles.layout}>
          {form}
          <StudentSide student={student.data} academyId={academyId} />
        </div>
      )}
    </>
  )
}
