import { useQuery } from '@tanstack/react-query'
import { Info } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, FormActions, FormGrid, FormSection, Input, PageHeader, Select } from '../../../components/ui'
import { useForm } from '../../../hooks/useForm'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { createAcademy, listSaasPlans } from '../../../services/saasService'
import { formatCurrency } from '../../../utils/formatters'
import { rules } from '../../../utils/validators'

export default function AcademiaNova() {
  const navigate = useNavigate()
  const plans = useQuery({ queryKey: ['saas-plans'], queryFn: listSaasPlans })

  const { field, handleSubmit, values } = useForm(
    { nome: '', cnpj: '', saas_plan_id: '', unidade_nome: 'Unidade Principal', admin_nome: '', admin_cpf: '', admin_telefone: '' },
    {
      nome: [rules.required()],
      cnpj: [rules.cnpj()],
      saas_plan_id: [rules.required('Selecione um plano')],
      admin_nome: [rules.required()],
      admin_cpf: [rules.required(), rules.cpf()],
    },
  )

  const mutation = useMutationToast(createAcademy, {
    success: 'Academia criada com admin, unidade e perfis padrão',
    invalidate: [['academies'], ['super-dashboard']],
    onSuccess: (id) => navigate(`/super-admin/academias/${id}`, { replace: true }),
  })

  const onSubmit = handleSubmit((v) => mutation.mutate(v))
  const senhaPadrao = values.admin_cpf.replace(/\D/g, '').slice(0, 6)

  return (
    <>
      <PageHeader
        title="Nova academia"
        breadcrumb={[{ label: 'Academias', to: '/super-admin/academias' }, { label: 'Nova' }]}
      />
      <Card>
        <form onSubmit={onSubmit} noValidate>
          <FormSection title="Dados da academia">
            <FormGrid columns={2}>
              <Input label="Nome da academia" required {...field('nome')} />
              <Input label="CNPJ" inputMode="numeric" placeholder="00.000.000/0000-00" {...field('cnpj', { mask: 'cnpj' })} />
              <Select
                label="Plano SaaS"
                required
                placeholder="Selecione"
                options={(plans.data ?? []).filter((p) => p.ativo).map((p) => ({ value: p.id, label: `${p.nome} — ${formatCurrency(p.valor)}/mês` }))}
                {...field('saas_plan_id')}
              />
              <Input label="Nome da unidade padrão" {...field('unidade_nome')} />
            </FormGrid>
          </FormSection>

          <FormSection title="Administrador responsável" description="Será criado automaticamente com o perfil Admin.">
            <FormGrid columns={3}>
              <Input label="Nome completo" required {...field('admin_nome')} />
              <Input
                label="CPF (login)"
                required
                inputMode="numeric"
                placeholder="000.000.000-00"
                hint={senhaPadrao.length === 6 ? `Senha inicial: ${senhaPadrao}` : 'Senha inicial: 6 primeiros dígitos'}
                {...field('admin_cpf', { mask: 'cpf' })}
              />
              <Input label="Telefone" inputMode="tel" {...field('admin_telefone', { mask: 'phone' })} />
            </FormGrid>
          </FormSection>

          <p className="text-muted" style={{ display: 'flex', gap: 8, marginBottom: 16, fontSize: 13 }}>
            <Info size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            Serão criados: academia, unidade padrão, perfis Admin/Instrutor/Recepção/Aluno, usuário admin e a primeira
            fatura do plano SaaS.
          </p>

          <FormActions>
            <Button variant="outline" to="/super-admin/academias">
              Cancelar
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              Criar academia
            </Button>
          </FormActions>
        </form>
      </Card>
    </>
  )
}
