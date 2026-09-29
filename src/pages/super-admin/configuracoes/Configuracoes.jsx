import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { PageLoader } from '../../../components/feedback/FullPageLoader'
import QueryError from '../../../components/feedback/QueryError'
import ProfileCard from '../../../components/profile/ProfileCard'
import { Button, Card, FormActions, FormGrid, FormSection, Input, PageHeader, Switch } from '../../../components/ui'
import { useAuth } from '../../../hooks/useAuth'
import { useForm } from '../../../hooks/useForm'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { getSettings, saveSettings } from '../../../services/saasService'
import { rules } from '../../../utils/validators'

const DEFAULTS = {
  nome: '',
  email_suporte: '',
  telefone: '',
  dias_vencimento: 10,
  smtp_host: '',
  smtp_porta: '',
  smtp_usuario: '',
  smtp_remetente: '',
  whatsapp_ativo: false,
  whatsapp_token: '',
  gateway_pagamento: '',
  gateway_chave_publica: '',
}

function SettingsForm({ initial }) {
  const { field, values, setValue, handleSubmit, reset } = useForm(
    { ...DEFAULTS, ...initial },
    { nome: [rules.required()], email_suporte: [rules.email()], dias_vencimento: [rules.min(1)] },
  )
  useEffect(() => reset({ ...DEFAULTS, ...initial }), [initial, reset])

  const mutation = useMutationToast((v) => saveSettings({ ...v, dias_vencimento: Number(v.dias_vencimento) }), {
    success: 'Configurações salvas',
    invalidate: [['saas-settings']],
  })

  return (
    <form onSubmit={handleSubmit((v) => mutation.mutate(v))} noValidate>
      <FormSection title="Dados do SaaS">
        <FormGrid columns={2}>
          <Input label="Nome do produto" required {...field('nome')} />
          <Input label="E-mail de suporte" type="email" {...field('email_suporte')} />
          <Input label="Telefone de suporte" {...field('telefone', { mask: 'phone' })} />
          <Input label="Dias para vencimento da fatura" type="number" min="1" {...field('dias_vencimento')} />
        </FormGrid>
      </FormSection>

      <FormSection title="E-mail (SMTP)" description="Usado para notificações às academias.">
        <FormGrid columns={2}>
          <Input label="Servidor" placeholder="smtp.exemplo.com" {...field('smtp_host')} />
          <Input label="Porta" type="number" placeholder="587" {...field('smtp_porta')} />
          <Input label="Usuário" {...field('smtp_usuario')} />
          <Input label="Remetente" placeholder="Academia SaaS <no-reply@...>" {...field('smtp_remetente')} />
        </FormGrid>
      </FormSection>

      <FormSection title="Integrações" description="Preparação para a fase 2 (pagamentos online e WhatsApp).">
        <FormGrid columns={2}>
          <Input label="Gateway de pagamento" placeholder="Ex.: Asaas, Mercado Pago, Stripe" {...field('gateway_pagamento')} />
          <Input label="Chave pública do gateway" {...field('gateway_chave_publica')} />
          <Switch label="Integração WhatsApp ativa" checked={Boolean(values.whatsapp_ativo)} onChange={(v) => setValue('whatsapp_ativo', v)} />
          <Input label="Token WhatsApp" type="password" disabled={!values.whatsapp_ativo} {...field('whatsapp_token')} />
        </FormGrid>
        <p className="text-muted" style={{ fontSize: 12, marginTop: 12 }}>
          Segredos sensíveis (chaves privadas) devem ficar em variáveis de ambiente/Edge Functions, não nesta tabela.
        </p>
      </FormSection>

      <FormActions>
        <Button type="submit" loading={mutation.isPending}>
          Salvar configurações
        </Button>
      </FormActions>
    </form>
  )
}

export default function Configuracoes() {
  const { context } = useAuth()
  const query = useQuery({ queryKey: ['saas-settings'], queryFn: getSettings })

  return (
    <>
      <PageHeader title="Configurações" subtitle="Dados do SaaS, integrações e sua conta" />
      <Card>
        {query.isPending ? (
          <PageLoader />
        ) : query.isError ? (
          <QueryError error={query.error} onRetry={query.refetch} />
        ) : (
          <SettingsForm initial={query.data} />
        )}
      </Card>
      <h2 style={{ margin: '32px 0 16px' }}>Minha conta</h2>
      {context?.super_admin && <ProfileCard superAdmin={context.super_admin} />}
    </>
  )
}
