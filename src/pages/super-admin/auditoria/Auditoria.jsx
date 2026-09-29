import { useState } from 'react'
import AccessLogTable from '../../../components/audit/AccessLogTable'
import AuditLogTable from '../../../components/audit/AuditLogTable'
import ErrorLogTable from '../../../components/audit/ErrorLogTable'
import { PageHeader, Tabs } from '../../../components/ui'

const TABS = [
  { key: 'detalhado', label: 'Log detalhado' },
  { key: 'completo', label: 'Log completo' },
  { key: 'erros', label: 'Erros' },
  { key: 'acessos', label: 'Acessos' },
]

/** Auditoria global (todas as academias) */
export default function Auditoria() {
  const [tab, setTab] = useState('detalhado')
  return (
    <>
      <PageHeader title="Auditoria" subtitle="Eventos, erros e acessos de todas as academias" />
      <Tabs items={TABS} value={tab} onChange={setTab} />
      {tab === 'detalhado' && <AuditLogTable academyId={null} variant="detalhado" />}
      {tab === 'completo' && <AuditLogTable academyId={null} variant="completo" />}
      {tab === 'erros' && <ErrorLogTable academyId={null} />}
      {tab === 'acessos' && <AccessLogTable academyId={null} />}
    </>
  )
}
