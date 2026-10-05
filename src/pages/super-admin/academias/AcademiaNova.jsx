import { Info } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, FormActions, FormGrid, FormSection, Input, PageHeader, Select, useToast } from '../../../components/ui'
import { useForm } from '../../../hooks/useForm'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { createAcademyWithSubscription } from '../../../services/saasService'
import { UFS } from '../../../utils/constants'
import { rules } from '../../../utils/validators'
import SubscriptionFields from './SubscriptionFields'

export default function AcademiaNova() {
  const navigate = useNavigate()
  const toast = useToast()
  const [subscription, setSubscription] = useState({ plan: '', ciclo: 'mensal', addons: [], offer: null })

  const { field, handleSubmit, values } = useForm(
    { nome: '', cnpj: '', cidade: '', uf: '', unidade_nome: 'Unidade Principal', admin_nome: '', admin_cpf: '', admin_telefone: '' },
    {
      nome: [rules.required()],
      cnpj: [rules.cnpj()],
      admin_nome: [rules.required()],
      admin_cpf: [rules.required(), rules.cpf()],
    },
  )

  const mutation = useMutationToast((v) => createAcademyWithSubscription(v, subscription), {
    success: 'Academia criada com admin, unidade, perfis padrão e a primeira fatura',
    invalidate: [['academies'], ['super-dashboard'], ['saas-offers']],
    onSuccess: (id) => navigate(`/super-admin/academias/${id}`, { replace: true }),
  })

  const onSubmit = handleSubmit((v) => {
    if (!subscription.plan) {
      toast.error('Escolha um plano para a academia')
      return
    }
    mutation.mutate(v)
  })
  const senhaPadrao = values.admin_cpf.replace(/\D/g, '').slice(0, 6)

  return (
    <>
      <PageHeader title="Nova academia" breadcrumb={[{ label: 'Academias', to: '/super-admin/academias' }, { label: 'Nova' }]} />
      <Card>
        <form onSubmit={onSubmit} noValidate>
          <FormSection title="Dados da academia">
            <FormGrid columns={2}>
              <Input label="Nome da academia" required {...field('nome')} />
              <Input label="CNPJ" inputMode="numeric" placeholder="00.000.000/0000-00" {...field('cnpj', { mask: 'cnpj' })} />
              <Input label="Cidade" hint="Usada nas ofertas por região" {...field('cidade')} />
              <Select label="UF" placeholder="—" options={UFS.map((u) => ({ value: u, label: u }))} {...field('uf')} />
              <Input label="Nome da unidade padrão" {...field('unidade_nome')} />
            </FormGrid>
          </FormSection>

          <FormSection title="Plano e cobrança" description="Escolha o plano, o ciclo, os adicionais e, se houver, a oferta de lançamento.">
            <SubscriptionFields value={subscription} onChange={setSubscription} uf={values.uf} cidade={values.cidade} />
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
            Serão criados: academia, unidade padrão, perfis Admin/Instrutor/Recepção/Aluno, usuário admin e a primeira fatura
            (no anual, a fatura já vem com o valor do ano).
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
