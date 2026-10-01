import { useSearchParams } from 'react-router-dom'
import { PageHeader, Tabs } from '../../../components/ui'
import { usePermissions } from '../../../hooks/usePermissions'
import CheckinsHoje from './CheckinsHoje'
import QrPanel from './QrPanel'
import Sumidos from './Sumidos'

/** Check-in: QR Code da recepção, entradas do dia (com registro manual) e alunos sumidos */
export default function Checkin() {
  const { can } = usePermissions()
  const [params, setParams] = useSearchParams()
  const tabs = [
    can('alunos.editar') && { key: 'qr', label: 'QR Code' },
    { key: 'hoje', label: 'Entradas de hoje' },
    { key: 'sumidos', label: 'Alunos sumidos' },
  ].filter(Boolean)
  const tab = tabs.some((t) => t.key === params.get('tab')) ? params.get('tab') : tabs[0].key

  return (
    <>
      <PageHeader title="Check-in" subtitle="Controle de entrada e frequência dos alunos" />
      <Tabs items={tabs} value={tab} onChange={(key) => setParams({ tab: key }, { replace: true })} />
      <div style={{ marginTop: 20 }}>
        {tab === 'qr' && <QrPanel />}
        {tab === 'hoje' && <CheckinsHoje />}
        {tab === 'sumidos' && <Sumidos />}
      </div>
    </>
  )
}
