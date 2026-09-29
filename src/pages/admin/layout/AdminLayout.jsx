import { ArrowLeftCircle, Eye } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../../../components/shell/AppShell'
import ThemeToggle from '../../../components/shell/ThemeToggle'
import UserMenu from '../../../components/shell/UserMenu'
import { Badge, Button } from '../../../components/ui'
import { useAuth, useTenant } from '../../../hooks/useAuth'
import { usePermissions } from '../../../hooks/usePermissions'
import styles from './AdminLayout.module.css'
import { visibleNav } from './adminNav'

/** Layout da academia: sidebar + topbar */
export default function AdminLayout() {
  const { context } = useAuth()
  const { academy, membership, impersonating, setAcademy } = useTenant()
  const { canAny, roles } = usePermissions()
  const navigate = useNavigate()

  // em "acessar como" o usuário age como Super Admin, não com o perfil que tenha na academia
  const profile = impersonating ? null : membership?.profile
  const name = profile?.nome ?? context?.super_admin?.nome ?? ''
  const roleLabel = impersonating ? 'Super Admin' : roles.filter((r) => r.slug !== 'aluno').map((r) => r.nome).join(', ')
  const hasStudentArea = Boolean(membership?.student_id) && !impersonating

  const exitImpersonation = () => {
    setAcademy(null)
    navigate('/super-admin/academias')
  }

  return (
    <AppShell
      brand={{ title: academy?.nome ?? 'Academia', subtitle: 'Gestão', logo: academy?.logo_url }}
      groups={visibleNav(canAny)}
      topbarLeft={
        <div className={styles.topLeft}>
          <strong className={styles.academy}>{academy?.nome}</strong>
          {impersonating && <Badge tone="warning">Modo super admin</Badge>}
        </div>
      }
      topbarRight={
        <>
          {hasStudentArea && (
            <Button variant="ghost" size="sm" icon={Eye} to="/client/dashboard">
              Área do aluno
            </Button>
          )}
          <ThemeToggle />
          <UserMenu
            name={name}
            subtitle={roleLabel}
            avatarUrl={profile?.avatar_url}
            profilePath={profile ? '/admin/perfil' : undefined}
          />
        </>
      }
      banner={
        impersonating && (
          <div className={styles.banner}>
            <span>
              Você está acessando <strong>{academy?.nome}</strong> como Super Admin. Todas as ações são auditadas.
            </span>
            <Button size="sm" variant="outline" icon={ArrowLeftCircle} onClick={exitImpersonation}>
              Voltar ao painel
            </Button>
          </div>
        )
      }
    />
  )
}
