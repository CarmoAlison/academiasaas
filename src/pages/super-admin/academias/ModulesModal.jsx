import { useQuery } from '@tanstack/react-query'
import { Lock, RotateCcw, Save } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Modal, SkeletonCard, Switch } from '../../../components/ui'
import { useMutationToast } from '../../../hooks/useMutationToast'
import { listModules, saveAcademyModules } from '../../../services/moduleService'
import { listSaasPlans } from '../../../services/saasService'
import styles from './ModulesModal.module.css'

const GRUPOS = { gestao: 'Gestão', aluno: 'Área do aluno', ambos: 'Gestão e área do aluno' }

/** O plano inclui o módulo? (plano sem lista = todos) */
export const planIncludes = (plan, slug) => !plan?.modulos || plan.modulos.includes(slug)

/** Estado do editor de módulos de uma academia (usado no modal e na aba da página) */
function useModulesEditor(academy, onSaved) {
  const modules = useQuery({ queryKey: ['saas-modules'], queryFn: listModules, enabled: Boolean(academy) })
  const plans = useQuery({ queryKey: ['saas-plans'], queryFn: listSaasPlans, enabled: Boolean(academy) })
  const [override, setOverride] = useState({})
  useEffect(() => setOverride(academy?.modulos_override ?? {}), [academy])

  const plan = plans.data?.find((p) => p.id === academy?.saas_plan_id)
  const list = useMemo(() => (modules.data ?? []).filter((m) => m.ativo), [modules.data])

  const toggle = (m, on) =>
    setOverride((prev) => {
      const next = { ...prev }
      // igual ao plano → remove o ajuste (volta a seguir o plano)
      if (on === planIncludes(plan, m.slug)) delete next[m.slug]
      else next[m.slug] = on
      return next
    })

  const mutation = useMutationToast(() => saveAcademyModules(academy.id, override), {
    success: 'Módulos atualizados. A academia vê as mudanças ao recarregar a página.',
    invalidate: [['academies'], ['academy', academy?.id], ['academy-modules', academy?.id]],
    onSuccess: onSaved,
  })

  return {
    loading: modules.isPending || plans.isPending,
    plan,
    list,
    override,
    setOverride,
    toggle,
    mutation,
    changed: JSON.stringify(override) !== JSON.stringify(academy?.modulos_override ?? {}),
  }
}

/** Lista de chaves dos módulos */
function ModulesBody({ editor }) {
  const { loading, plan, list, override, toggle } = editor
  if (loading) return <SkeletonCard lines={6} />
  const isOn = (m) => m.essencial || (m.slug in override ? override[m.slug] : planIncludes(plan, m.slug))
  const ajustes = Object.keys(override).length
  const optional = list.filter((m) => !m.essencial)

  return (
    <>
      <div className={styles.head}>
        <span>
          Plano <strong>{plan?.nome ?? 'sem plano'}</strong>
          {ajustes > 0 ? ` · ${ajustes} ajuste(s) só desta academia` : ' · seguindo o padrão do plano'}
        </span>
        <span className={styles.quick}>
          <Button size="sm" variant="ghost" onClick={() => optional.forEach((m) => toggle(m, true))}>
            Ligar tudo
          </Button>
          <Button size="sm" variant="ghost" onClick={() => optional.forEach((m) => toggle(m, false))}>
            Desligar tudo
          </Button>
        </span>
      </div>
      <ul className={styles.list}>
        {list.map((m) => {
          const on = isOn(m)
          const adjusted = m.slug in override
          return (
            <li key={m.slug} className={on ? '' : styles.off}>
              <div className={styles.info}>
                <strong>
                  {m.nome}{' '}
                  {m.essencial ? (
                    <Badge>
                      <Lock size={11} /> Essencial
                    </Badge>
                  ) : adjusted ? (
                    <Badge tone="warning">Ajustado</Badge>
                  ) : (
                    <Badge tone="info">Do plano</Badge>
                  )}
                </strong>
                <span>
                  {m.descricao ?? ''}
                  {m.descricao ? ' · ' : ''}
                  {GRUPOS[m.grupo] ?? ''}
                </span>
              </div>
              <Switch label={<span className="sr-only">{m.nome}</span>} checked={on} disabled={m.essencial} onChange={(v) => toggle(m, v)} />
            </li>
          )
        })}
      </ul>
      <p className={styles.note}>
        Módulo desligado some do menu e das telas da academia (gestão e alunos) e é bloqueado no banco de dados. Os dados não são apagados:
        ao religar, tudo volta como estava.
      </p>
    </>
  )
}

/** Editor dentro da página da academia (aba "Módulos") */
export function ModulesPanel({ academy, readOnly = false }) {
  const editor = useModulesEditor(academy)
  return (
    <>
      <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <ModulesBody editor={editor} />
      </fieldset>
      {!readOnly && (
        <div className={styles.actions}>
          <Button variant="ghost" icon={RotateCcw} disabled={!Object.keys(editor.override).length} onClick={() => editor.setOverride({})}>
            Usar o padrão do plano
          </Button>
          <Button icon={Save} disabled={!editor.changed} loading={editor.mutation.isPending} onClick={() => editor.mutation.mutate()}>
            Salvar módulos
          </Button>
        </div>
      )}
    </>
  )
}

/**
 * Liga/desliga os módulos de uma academia. Sem ajuste, vale o que o plano inclui;
 * ao mudar uma chave, vira um ajuste só desta academia.
 * @param {{ academy: object|null, onClose: () => void }} props
 */
export default function ModulesModal({ academy, onClose }) {
  const editor = useModulesEditor(academy, onClose)
  return (
    <Modal
      open={Boolean(academy)}
      onClose={onClose}
      size="lg"
      title={academy ? `Módulos — ${academy.nome}` : 'Módulos'}
      footer={
        <>
          <Button variant="ghost" icon={RotateCcw} disabled={!Object.keys(editor.override).length} onClick={() => editor.setOverride({})}>
            Usar o padrão do plano
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={editor.mutation.isPending} onClick={() => editor.mutation.mutate()}>
            Salvar
          </Button>
        </>
      }
    >
      <ModulesBody editor={editor} />
    </Modal>
  )
}
