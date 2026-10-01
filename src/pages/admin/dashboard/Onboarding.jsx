import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, ChevronRight, Circle, Rocket, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button, Card } from '../../../components/ui'
import { useTenant } from '../../../hooks/useAuth'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { usePermissions } from '../../../hooks/usePermissions'
import { onboardingStatus, updateAcademySettings } from '../../../services/academySettingsService'
import { ADMIN_ONLY } from '../layout/adminNav'
import styles from './Onboarding.module.css'

const STEPS = [
  { key: 'identidade', label: 'Coloque o logo e a cor da academia', to: '/admin/configuracoes' },
  { key: 'unidades', label: 'Cadastre a unidade (endereço e contato)', to: '/admin/unidades/nova' },
  { key: 'planos', label: 'Crie os planos (mensal, trimestral…)', to: '/admin/planos/novo' },
  { key: 'equipe', label: 'Adicione a equipe (instrutores, recepção)', to: '/admin/perfil-acesso' },
  { key: 'recibo', label: 'Personalize o recibo', to: '/admin/financeiro/recibo' },
  { key: 'contrato', label: 'Revise o modelo de contrato', to: '/admin/configuracoes' },
  { key: 'alunos', label: 'Cadastre o primeiro aluno', to: '/admin/alunos/novo' },
  { key: 'exercicios', label: 'Monte a biblioteca de exercícios', to: '/admin/treinos' },
  { key: 'treinos', label: 'Crie o primeiro treino', to: '/admin/treinos/novo' },
  { key: 'aulas', label: 'Cadastre as aulas coletivas', to: '/admin/aulas/nova' },
  { key: 'checkin', label: 'Deixe o QR Code de check-in na recepção', to: '/admin/checkin' },
]

/** Checklist de primeiro acesso (só o perfil Admin vê) */
export default function Onboarding() {
  const { academyId } = useTenant()
  const { can } = usePermissions()
  const isAdmin = can(ADMIN_ONLY)
  const query = useQuery({ queryKey: ['onboarding', academyId], queryFn: () => onboardingStatus(academyId), enabled: isAdmin })
  const hide = useMutationToast(() => updateAcademySettings(academyId, { onboarding_oculto: true }), {
    success: 'Checklist ocultado. Você encontra tudo pelo menu.',
    invalidate: [['onboarding', academyId], ['academy-settings', academyId]],
  })

  const s = query.data
  if (!isAdmin || !s || s.oculto) return null
  const done = STEPS.filter((st) => s[st.key]).length
  if (done === STEPS.length) return null
  const pct = Math.round((done / STEPS.length) * 100)

  return (
    <Card
      className={styles.card}
      title={
        <span className={styles.title}>
          <Rocket size={18} /> Primeiros passos
        </span>
      }
      subtitle={`${done} de ${STEPS.length} concluídos — deixe a academia pronta para usar`}
      actions={
        <Button variant="ghost" size="sm" icon={X} loading={hide.isPending} onClick={() => hide.mutate()}>
          Ocultar
        </Button>
      }
    >
      <div className={styles.progress} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div style={{ width: `${pct}%` }} />
      </div>
      <ul className={styles.list}>
        {STEPS.map((st) => (
          <li key={st.key} className={s[st.key] ? styles.done : ''}>
            {s[st.key] ? <CheckCircle2 size={18} /> : <Circle size={18} />}
            {s[st.key] ? (
              <span>{st.label}</span>
            ) : (
              <Link to={st.to}>
                {st.label} <ChevronRight size={14} />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}
