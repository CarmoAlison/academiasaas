import { useQuery } from '@tanstack/react-query'
import { ArrowLeftCircle, Eye } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import AnnouncementBanner from '../../../components/announcements/AnnouncementBanner'
import AppShell from '../../../components/shell/AppShell'
import ThemeToggle from '../../../components/shell/ThemeToggle'
import UserMenu from '../../../components/shell/UserMenu'
import { Badge, Button } from '../../../components/ui'
import { useAuth, useTenant } from '../../../hooks/useAuth'
import { useBrand } from '../../../hooks/useBrand'
import { useModules } from '../../../hooks/useModules'
import { usePermissions } from '../../../hooks/usePermissions'
import { useSupportRealtime } from '../../../hooks/useSupportRealtime'
import { unreadTickets } from '../../../services/supportService'
import { setPreferredArea } from '../../../routes/accessOptions'
import styles from './AdminLayout.module.css'
import { visibleNav } from './adminNav'

/** Layout da academia: sidebar + topbar */
export default function AdminLayout() {
  const { context } = useAuth()
  const { academy, academyId, membership, impersonating, setAcademy } = useTenant()
  const { canAny, roles } = usePermissions()
  const modules = useModules()
  useSupportRealtime(Boolean(academyId) && !impersonating && modules.has('suporte'))
  // respostas do suporte ainda não lidas (contador no menu)
  const unreadSupport = useQuery({
    queryKey: ['tickets-unread', academyId],
    queryFn: () => unreadTickets({ academyId }),
    enabled: Boolean(academyId) && !impersonating && modules.has('suporte'),
    refetchInterval: 60000,
  })
  const navigate = useNavigate()
  const brand = useBrand()

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
      brand={{ title: academy?.nome ?? 'Academia', subtitle: 'Gestão', logo: brand.logo }}
      groups={visibleNav(canAny, { impersonating, badges: { suporte: unreadSupport.data || null }, hasModule: modules.has })}
      topbarLeft={
        <div className={styles.topLeft}>
          {brand.logo ? (
            <img className={styles.topLogo} src={brand.logo} alt={academy?.nome ?? ''} />
          ) : (
            <strong className={styles.academy}>{academy?.nome}</strong>
          )}
          {impersonating && <Badge tone="warning">Modo super admin</Badge>}
        </div>
      }
      topbarRight={
        <>
          {hasStudentArea && (
            <Button variant="ghost" size="sm" icon={Eye} to="/client/dashboard" onClick={() => setPreferredArea('client')}>
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
        <>
          {impersonating && (
            <div className={styles.banner}>
              <span>
                Você está acessando <strong>{academy?.nome}</strong> como Super Admin. Todas as ações são auditadas.
              </span>
              <Button size="sm" variant="outline" icon={ArrowLeftCircle} onClick={exitImpersonation}>
                Voltar ao painel
              </Button>
            </div>
          )}
          <AnnouncementBanner />
        </>
      }
    />
  )
}
