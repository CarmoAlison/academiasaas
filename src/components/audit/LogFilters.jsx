import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { listAcademies } from '../../services/saasService'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Select from '../ui/Select'
import styles from './Audit.module.css'

/**
 * Barra de filtros dos logs.
 * @param {object} props
 * @param {Record<string, string>} props.value
 * @param {(v: Record<string, string>) => void} props.onChange
 * @param {boolean} [props.showAcademy] filtro por academia (super admin)
 * @param {import('react').ReactNode} [props.children] filtros extras
 */
export default function LogFilters({ value, onChange, showAcademy = false, children }) {
  const academies = useQuery({ queryKey: ['academies'], queryFn: listAcademies, enabled: showAcademy })
  const set = (key) => (e) => onChange({ ...value, [key]: e.target.value })
  const hasFilters = Object.values(value).some(Boolean)

  return (
    <div className={styles.filters}>
      {showAcademy && (
        <Select
          label="Academia"
          placeholder="Todas"
          value={value.academy_id ?? ''}
          onChange={set('academy_id')}
          options={(academies.data ?? []).map((a) => ({ value: a.id, label: a.nome }))}
        />
      )}
      {children}
      <Input label="Usuário" placeholder="Nome" value={value.usuario ?? ''} onChange={set('usuario')} />
      <Input label="De" type="date" value={value.de ?? ''} onChange={set('de')} />
      <Input label="Até" type="date" value={value.ate ?? ''} onChange={set('ate')} />
      {hasFilters && (
        <Button variant="ghost" icon={X} onClick={() => onChange({})} className={styles.clear}>
          Limpar
        </Button>
      )}
    </div>
  )
}
