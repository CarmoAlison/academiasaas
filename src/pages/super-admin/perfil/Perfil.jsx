import { BellRing } from 'lucide-react'
import { useState } from 'react'
import ProfileCard from '../../../components/profile/ProfileCard'
import { Button, PageHeader, Switch, useToast } from '../../../components/ui'
import { useAuth } from '../../../hooks/useAuth'
import { useSuperRole } from '../../../hooks/useSuperRole'
import { updateSuperAdminProfile } from '../../../services/profileService'
import { errorMessage } from '../../../utils/errors'

const ALERTAS = [
  { key: 'chamado_novo', label: 'Chamado novo de academia', area: 'suporte' },
  { key: 'fatura_vencida', label: 'Fatura do SaaS vencida', area: 'financeiro' },
  { key: 'academia_nova', label: 'Nova academia cadastrada' },
]

/** Preferências de alerta por e-mail */
function AlertsBox({ superAdmin }) {
  const { refresh } = useAuth()
  const { superCan } = useSuperRole()
  const toast = useToast()
  const [alertas, setAlertas] = useState(superAdmin.alertas ?? {})
  const [saving, setSaving] = useState(false)
  const items = ALERTAS.filter((a) => !a.area || superCan(a.area))

  const save = async () => {
    setSaving(true)
    try {
      await updateSuperAdminProfile(superAdmin, { alertas })
      await refresh()
      toast.success('Preferências de alerta salvas')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 10, marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
      <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
        <BellRing size={16} /> Alertas por e-mail
      </strong>
      {items.map((a) => (
        <Switch key={a.key} label={a.label} checked={Boolean(alertas[a.key])} onChange={(v) => setAlertas((prev) => ({ ...prev, [a.key]: v }))} />
      ))}
      <small className="text-muted">Enviados para o e-mail de contato (requer o envio de e-mail configurado no SaaS).</small>
      <Button size="sm" variant="outline" loading={saving} onClick={save}>
        Salvar alertas
      </Button>
    </div>
  )
}

/** Perfil do usuário da equipe do SaaS (qualquer papel) */
export default function Perfil() {
  const { context } = useAuth()
  const { label } = useSuperRole()
  const sa = context?.super_admin
  return (
    <>
      <PageHeader title="Meu perfil" subtitle={`Equipe do SaaS · ${label}`} />
      {sa && <ProfileCard superAdmin={sa} extra={<AlertsBox superAdmin={sa} />} />}
    </>
  )
}
