import { useQuery } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { useEffect } from 'react'
import { PageLoader } from '../../../components/feedback/FullPageLoader'
import QueryError from '../../../components/feedback/QueryError'
import { Button, Card, FormActions, FormGrid, FormSection, Input, PageHeader, Switch } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { useForm } from '../../../hooks/useForm'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { getAcademySettings, saveAcademySettings } from '../../../services/academySettingsService'
import { rules } from '../../../utils/validators'

function SettingsForm({ initial }) {
  const { academyId } = useTenant()
  const { field, values, setValue, handleSubmit, reset } = useForm(initial, {
    dias_tolerancia: [rules.required(), rules.min(0, 'Mínimo de 0 dias'), (v) => (Number(v) > 90 ? 'Máximo de 90 dias' : undefined)],
  })
  useEffect(() => reset(initial), [initial, reset])

  const mutation = useMutationToast(
    (v) => saveAcademySettings(academyId, { ...v, dias_tolerancia: Number(v.dias_tolerancia) }),
    {
      success: 'Configurações salvas',
      invalidate: [['academy-settings', academyId], ['students', academyId], ['admin-dashboard', academyId]],
    },
  )

  return (
    <form onSubmit={handleSubmit((v) => mutation.mutate(v))} noValidate>
      <FormSection
        title="Mensalidades em atraso"
        description="O aluno passa a ser considerado inadimplente quando tem mensalidade vencida há mais dias que a tolerância."
      >
        <FormGrid columns={2}>
          <Input
            label="Tolerância (dias após o vencimento)"
            type="number"
            min="0"
            max="90"
            hint="Ex.: 5 → vencida no dia 10, vira inadimplente no dia 16"
            {...field('dias_tolerancia')}
          />
        </FormGrid>
        <div style={{ marginTop: 16 }}>
          <Switch
            label="Bloquear reservas de aulas de alunos inadimplentes"
            checked={Boolean(values.bloquear_reservas_inadimplente)}
            onChange={(v) => setValue('bloquear_reservas_inadimplente', v)}
          />
        </div>
      </FormSection>

      <FormActions>
        <Button type="submit" icon={Save} loading={mutation.isPending}>
          Salvar configurações
        </Button>
      </FormActions>
    </form>
  )
}

/** Configurações da academia (somente perfil Admin) */
export default function ConfiguracoesAcademia() {
  const { academyId } = useTenant()
  const query = useQuery({ queryKey: ['academy-settings', academyId], queryFn: () => getAcademySettings(academyId) })

  return (
    <>
      <PageHeader title="Configurações da academia" subtitle="Regras de cobrança, aulas e outras preferências" />
      <Card>
        {query.isPending ? <PageLoader /> : query.isError ? <QueryError error={query.error} onRetry={query.refetch} /> : <SettingsForm initial={query.data} />}
      </Card>
    </>
  )
}
