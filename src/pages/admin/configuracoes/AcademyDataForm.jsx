import { useQuery } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { useEffect } from 'react'
import { PageLoader } from '../../../components/feedback/FullPageLoader'
import QueryError from '../../../components/feedback/QueryError'
import { Button, FormActions, FormGrid, FormSection, FullRow, Input, Select } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { useForm } from '../../../hooks/useForm'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { getMyAcademyData, updateMyAcademy } from '../../../services/academySettingsService'
import { UFS } from '../../../utils/constants'
import { formatCEP, formatCNPJ, formatPhone } from '../../../utils/formatters'
import { rules } from '../../../utils/validators'

const EMPTY = { email: '', telefone: '', cep: '', endereco: '', bairro: '', cidade: '', uf: '', instagram: '', site: '' }

/** Contato e endereço da academia. Nome e CNPJ são alterados pelo suporte do sistema. */
export default function AcademyDataForm() {
  const { academyId } = useTenant()
  const query = useQuery({ queryKey: ['academy-data', academyId], queryFn: () => getMyAcademyData(academyId) })
  const { field, handleSubmit, reset } = useForm(EMPTY, { email: [rules.email()] })

  useEffect(() => {
    const a = query.data
    if (!a) return
    reset({
      email: a.email ?? '',
      telefone: formatPhone(a.telefone ?? ''),
      cep: formatCEP(a.cep ?? ''),
      endereco: a.endereco ?? '',
      bairro: a.bairro ?? '',
      cidade: a.cidade ?? '',
      uf: a.uf ?? '',
      instagram: a.instagram ?? '',
      site: a.site ?? '',
    })
  }, [query.data, reset])

  const mutation = useMutationToast((v) => updateMyAcademy(academyId, v), {
    success: 'Dados da academia salvos',
    invalidate: [['academy-data', academyId], ['academy', academyId]],
  })

  if (query.isPending) return <PageLoader />
  if (query.isError) return <QueryError error={query.error} onRetry={query.refetch} />

  return (
    <form onSubmit={handleSubmit((v) => mutation.mutate(v))} noValidate>
      <FormSection title="Academia" description="Nome e CNPJ são os do contrato com o sistema. Para alterar, abra um chamado no Suporte.">
        <FormGrid columns={2}>
          <Input label="Nome" value={query.data.nome} disabled readOnly />
          <Input label="CNPJ" value={query.data.cnpj ? formatCNPJ(query.data.cnpj) : '—'} disabled readOnly />
        </FormGrid>
      </FormSection>
      <FormSection title="Contato" description="Usado no recibo, no contrato e na área do aluno.">
        <FormGrid columns={2}>
          <Input label="Telefone / WhatsApp" inputMode="tel" {...field('telefone', { mask: 'phone' })} />
          <Input label="E-mail" type="email" {...field('email')} />
          <Input label="Instagram" placeholder="@suaacademia" {...field('instagram')} />
          <Input label="Site" placeholder="www.suaacademia.com.br" {...field('site')} />
        </FormGrid>
      </FormSection>
      <FormSection title="Endereço">
        <FormGrid columns={4}>
          <Input label="CEP" inputMode="numeric" {...field('cep', { mask: 'cep' })} />
          <FullRow>
            <Input label="Endereço" placeholder="Rua, número, complemento" {...field('endereco')} />
          </FullRow>
          <Input label="Bairro" {...field('bairro')} />
          <Input label="Cidade" {...field('cidade')} />
          <Select label="UF" placeholder="—" options={UFS.map((u) => ({ value: u, label: u }))} {...field('uf')} />
        </FormGrid>
      </FormSection>
      <FormActions>
        <Button type="submit" icon={Save} loading={mutation.isPending}>
          Salvar dados
        </Button>
      </FormActions>
    </form>
  )
}
