import { ShieldCheck } from 'lucide-react'
import ResetPasswordButton from '../../../components/auth/ResetPasswordButton'
import ProfileCard from '../../../components/profile/ProfileCard'
import { Badge, EmptyState, PageHeader } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { usePermissions } from '../../../hooks/usePermissions'

export default function Perfil() {
  const { membership, academy, impersonating } = useTenant()
  const { roles, isAdmin } = usePermissions()

  if (!membership || impersonating) {
    return (
      <>
        <PageHeader title="Meu perfil" />
        <EmptyState icon={ShieldCheck} title="Acesso como Super Admin" description="Seu perfil é gerenciado em Configurações no painel do Super Admin." />
      </>
    )
  }

  return (
    <>
      <PageHeader title="Meu perfil" subtitle={academy?.nome} />
      <ProfileCard
        profile={membership.profile}
        extra={
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
              {roles.map((r) => (
                <Badge key={r.id} tone={r.slug === 'admin' ? 'warning' : 'info'}>
                  {r.nome}
                </Badge>
              ))}
            </div>
            {isAdmin && (
              <>
                <p className="text-muted" style={{ fontSize: 12, textAlign: 'center' }}>
                  Voltar a senha para o padrão (6 primeiros dígitos do CPF):
                </p>
                <ResetPasswordButton profileId={membership.profile.id} nome={membership.profile.nome} />
              </>
            )}
          </>
        }
      />
    </>
  )
}
