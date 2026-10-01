import { useQuery } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useEffect } from 'react'
import { PageLoader } from '../../../components/feedback/FullPageLoader'
import QueryError from '../../../components/feedback/QueryError'
import ProfileCard from '../../../components/profile/ProfileCard'
import { Button, Card, FormActions, FormGrid, FormSection, FullRow, Input, PageHeader, Select, Switch, useConfirm } from '../../../components/ui'
import { useAuth } from '../../../hooks/useAuth'
import { useForm } from '../../../hooks/useForm'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { getSettings, purgeOldLogs, saveSettings } from '../../../services/saasService'
import { UFS } from '../../../utils/constants'
import { rules } from '../../../utils/validators'

const DEFAULTS = {
  nome: '',
  cnpj: '',
  email_suporte: '',
  telefone: '',
  endereco: '',
  cidade: '',
  estado: '',
  cep: '',
  dias_vencimento: 10,
  smtp_host: '',
  smtp_porta: '',
  smtp_usuario: '',
  smtp_remetente: '',
  whatsapp_ativo: false,
  whatsapp_token: '',
  gateway_pagamento: '',
  gateway_chave_publica: '',
  // retenção de logs (dias) — gravado em dados.retencao
  retencao_erros: 90,
  retencao_acessos: 180,
  retencao_auditoria: 365,
}

/** dados (banco) → valores do formulário */
const toForm = (initial = {}) => ({
  ...DEFAULTS,
  ...initial,
  retencao_erros: initial.retencao?.erros ?? DEFAULTS.retencao_erros,
  retencao_acessos: initial.retencao?.acessos ?? DEFAULTS.retencao_acessos,
  retencao_auditoria: initial.retencao?.auditoria ?? DEFAULTS.retencao_auditoria,
})

/** valores do formulário → dados (banco) */
function toDados(v) {
  const { retencao_erros, retencao_acessos, retencao_auditoria, ...rest } = v
  delete rest.retencao
  return {
    ...rest,
    dias_vencimento: Number(v.dias_vencimento),
    retencao: { erros: Number(retencao_erros), acessos: Number(retencao_acessos), auditoria: Number(retencao_auditoria) },
  }
}

function SettingsForm({ initial }) {
  const [confirm, confirmDialog] = useConfirm()
  const { field, values, setValue, handleSubmit, reset } = useForm(toForm(initial), {
    nome: [rules.required()],
    cnpj: [rules.cnpj()],
    email_suporte: [rules.email()],
    dias_vencimento: [rules.min(1)],
    retencao_erros: [rules.required(), rules.min(7, 'Mínimo de 7 dias')],
    retencao_acessos: [rules.required(), rules.min(7, 'Mínimo de 7 dias')],
    retencao_auditoria: [rules.required(), rules.min(30, 'Mínimo de 30 dias')],
  })
  useEffect(() => reset(toForm(initial)), [initial, reset])

  const mutation = useMutationToast((v) => saveSettings(toDados(v)), {
    success: 'Configurações salvas',
    invalidate: [['saas-settings']],
  })
  const purge = useMutationToast(purgeOldLogs, {
    success: (r) => `Limpeza concluída: ${r.erros} erros, ${r.acessos} acessos e ${r.auditoria} eventos de auditoria apagados`,
    invalidate: [['errors'], ['access-logs'], ['audit-logs']],
  })

  return (
    <form onSubmit={handleSubmit((v) => mutation.mutate(v))} noValidate>
      {confirmDialog}
      <FormSection title="Dados do SaaS" description="Também aparecem como emissor no recibo das faturas enviadas às academias.">
        <FormGrid columns={2}>
          <Input label="Nome do produto / empresa" required {...field('nome')} />
          <Input label="CNPJ" inputMode="numeric" placeholder="00.000.000/0000-00" {...field('cnpj', { mask: 'cnpj' })} />
          <Input label="E-mail de suporte" type="email" {...field('email_suporte')} />
          <Input label="Telefone de suporte" {...field('telefone', { mask: 'phone' })} />
          <Input label="Dias para vencimento da fatura" type="number" min="1" {...field('dias_vencimento')} />
        </FormGrid>
      </FormSection>

      <FormSection title="Endereço da empresa">
        <FormGrid columns={4}>
          <Input label="CEP" inputMode="numeric" {...field('cep', { mask: 'cep' })} />
          <FullRow>
            <Input label="Endereço" placeholder="Rua, número, bairro" {...field('endereco')} />
          </FullRow>
          <Input label="Cidade" {...field('cidade')} />
          <Select label="UF" placeholder="—" options={UFS.map((u) => ({ value: u, label: u }))} {...field('estado')} />
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

      <FormSection
        title="Retenção de logs"
        description="Logs mais antigos que estes prazos são apagados automaticamente todo dia (03:00 UTC, se o pg_cron estiver ativo no Supabase)."
      >
        <FormGrid columns={3}>
          <Input label="Erros (dias)" type="number" min="7" {...field('retencao_erros')} />
          <Input label="Acessos (dias)" type="number" min="7" {...field('retencao_acessos')} />
          <Input label="Auditoria (dias)" type="number" min="30" {...field('retencao_auditoria')} />
        </FormGrid>
        <div style={{ marginTop: 12 }}>
          <Button
            variant="outline"
            size="sm"
            icon={Trash2}
            loading={purge.isPending}
            onClick={async () => {
              if (
                await confirm({
                  title: 'Limpar logs antigos agora?',
                  message: 'Usa os prazos já salvos. Salve antes se acabou de alterá-los. Os registros apagados não podem ser recuperados.',
                  danger: true,
                  confirmLabel: 'Limpar agora',
                })
              ) {
                purge.mutate()
              }
            }}
          >
            Limpar logs antigos agora
          </Button>
        </div>
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
