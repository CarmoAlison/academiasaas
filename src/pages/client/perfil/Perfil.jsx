import ProfileCard from '../../../components/profile/ProfileCard'
import { PageHeader } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { ContractsLink } from '../contrato/Contratos'

export default function Perfil() {
  const { membership, academy } = useTenant()
  return (
    <>
      <PageHeader title="Meu perfil" subtitle={academy?.nome} />
      {membership && <ProfileCard profile={membership.profile} />}
      <ContractsLink />
    </>
  )
}
