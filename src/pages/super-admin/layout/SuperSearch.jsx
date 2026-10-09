import { useQuery } from '@tanstack/react-query'
import { Building2, LifeBuoy, Search, User, UserCog } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDebounce } from '../../../hooks/useDebounce'
import { superSearch } from '../../../services/saasService'
import styles from './SuperSearch.module.css'

const ICONS = { academia: Building2, aluno: User, equipe: UserCog, chamado: LifeBuoy }
const LABELS = { academia: 'Academia', aluno: 'Aluno', equipe: 'Equipe', chamado: 'Chamado' }

/** Para onde cada resultado leva */
const target = (r) =>
  r.tipo === 'chamado' ? `/super-admin/chamados/${r.ref}` : `/super-admin/academias/${r.academy_id}${r.tipo === 'academia' ? '' : '?tab=resumo'}`

/** Busca global: academia, aluno/equipe (nome ou CPF), CNPJ e nº do chamado. Atalho: Ctrl+K */
export default function SuperSearch() {
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const term = useDebounce(q.trim(), 250)
  const query = useQuery({ queryKey: ['super-search', term], queryFn: () => superSearch(term), enabled: term.length >= 2 })
  const results = query.data ?? []

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const go = (r) => {
    navigate(target(r))
    setOpen(false)
    setQ('')
    inputRef.current?.blur()
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.box}>
        <Search size={16} aria-hidden />
        <input
          ref={inputRef}
          value={q}
          placeholder="Buscar academia, aluno, CPF, CNPJ ou nº do chamado…"
          aria-label="Busca global"
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
            setActive(0)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((i) => Math.min(i + 1, results.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((i) => Math.max(i - 1, 0))
            } else if (e.key === 'Enter' && results[active]) {
              go(results[active])
            } else if (e.key === 'Escape') {
              setOpen(false)
              inputRef.current?.blur()
            }
          }}
        />
        <kbd className={styles.kbd}>Ctrl K</kbd>
      </div>
      {open && term.length >= 2 && (
        <ul className={styles.results} role="listbox">
          {query.isPending ? (
            <li className={styles.empty}>Buscando…</li>
          ) : !results.length ? (
            <li className={styles.empty}>Nada encontrado para “{term}”</li>
          ) : (
            results.map((r, i) => {
              const Icon = ICONS[r.tipo] ?? Search
              return (
                <li key={`${r.tipo}-${r.ref}`} role="option" aria-selected={i === active}>
                  <button type="button" className={i === active ? styles.active : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => go(r)}>
                    <Icon size={16} />
                    <span className={styles.text}>
                      <strong>{r.titulo}</strong>
                      <small>{r.subtitulo}</small>
                    </span>
                    <span className={styles.tag}>{LABELS[r.tipo] ?? r.tipo}</span>
                  </button>
                </li>
              )
            })
          )}
        </ul>
      )}
    </div>
  )
}
