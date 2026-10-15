import { AlignCenter, Bold, Heading1, Heading2, Italic, List, Minus, Underline } from 'lucide-react'
import { fieldStyles } from '../ui/Field'
import Textarea from '../ui/Textarea'
import styles from './ContractEditor.module.css'

/**
 * Ações da barra: "wrap" envolve a seleção; "line" põe um prefixo/sufixo em cada linha; "insert" insere um bloco.
 * A sintaxe é a de contractFormat.js.
 */
const TOOLS = [
  { key: 'h1', icon: Heading1, label: 'Título', kind: 'line', before: '# ' },
  { key: 'h2', icon: Heading2, label: 'Subtítulo', kind: 'line', before: '## ' },
  { key: 'b', icon: Bold, label: 'Negrito', kind: 'wrap', mark: '**' },
  { key: 'i', icon: Italic, label: 'Itálico', kind: 'wrap', mark: '*' },
  { key: 'u', icon: Underline, label: 'Sublinhado', kind: 'wrap', mark: '__' },
  { key: 'list', icon: List, label: 'Lista', kind: 'line', before: '- ' },
  { key: 'center', icon: AlignCenter, label: 'Centralizar', kind: 'line', before: '-> ', after: ' <-' },
  { key: 'hr', icon: Minus, label: 'Linha divisória', kind: 'insert', text: '---' },
]

/** Tira os marcadores de linha que já existem (para trocar, ex.: título → subtítulo) */
const stripLine = (l) => l.replace(/^(#{1,2}\s+|[-•]\s+|->\s*)/, '').replace(/\s*<-$/, '')

/**
 * Caixa de texto do contrato com barra de formatação (negrito, itálico, títulos, listas...).
 * @param {{ id: string, value: string, onChange: (v: string) => void, label?: string, rows?: number, placeholder?: string, hint?: import('react').ReactNode, extraTools?: import('react').ReactNode }} props
 */
export default function ContractEditor({ id, value, onChange, label = 'Texto', rows = 16, placeholder, hint, extraTools }) {
  const apply = (tool) => {
    const el = document.getElementById(id)
    const text = value ?? ''
    const ini = el ? el.selectionStart : text.length
    const fim = el ? el.selectionEnd : text.length
    let next
    let selIni
    let selFim

    if (tool.kind === 'wrap') {
      const sel = text.slice(ini, fim) || tool.label.toLowerCase()
      next = text.slice(0, ini) + tool.mark + sel + tool.mark + text.slice(fim)
      selIni = ini + tool.mark.length
      selFim = selIni + sel.length
    } else if (tool.kind === 'line') {
      // linhas inteiras que a seleção toca
      const lIni = text.lastIndexOf('\n', ini - 1) + 1
      const nl = text.indexOf('\n', fim)
      const lFim = nl === -1 ? text.length : nl
      const lines = text.slice(lIni, lFim).split('\n')
      // clicar de novo no mesmo botão desfaz; em outro formato de linha, troca (ex.: título → subtítulo)
      const already = lines.every((l) => !l.trim() || (l.startsWith(tool.before) && (!tool.after || l.trimEnd().endsWith(tool.after.trim()))))
      const out = lines
        .map((l) => {
          if (!l.trim()) return l
          const base = stripLine(l)
          return already ? base : `${tool.before}${base || tool.label.toLowerCase()}${tool.after ?? ''}`
        })
        .join('\n')
      next = text.slice(0, lIni) + out + text.slice(lFim)
      selIni = lIni
      selFim = lIni + out.length
    } else {
      const before = text.slice(0, ini)
      const pre = !before || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
      const block = `${pre}${tool.text}\n\n`
      next = before + block + text.slice(fim)
      selIni = selFim = ini + block.length
    }

    onChange(next)
    requestAnimationFrame(() => {
      const t = document.getElementById(id)
      t?.focus()
      t?.setSelectionRange(selIni, selFim)
    })
  }

  return (
    <div className={styles.editor}>
      <label htmlFor={id} className={fieldStyles.label}>
        {label}
      </label>
      <div className={styles.toolbar} role="toolbar" aria-label="Formatação do texto">
        {TOOLS.map((t) => (
          <button key={t.key} type="button" className={styles.tool} title={t.label} aria-label={t.label} onMouseDown={(e) => e.preventDefault()} onClick={() => apply(t)}>
            <t.icon size={16} />
          </button>
        ))}
        {extraTools}
      </div>
      <Textarea
        id={id}
        rows={rows}
        placeholder={placeholder}
        hint={hint}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className={styles.textarea}
      />
      <details className={styles.help}>
        <summary>Como formatar</summary>
        <p>
          Selecione o trecho e use a barra acima, ou escreva direto: <code># Título</code> · <code>## Subtítulo</code> · <code>**negrito**</code> ·{' '}
          <code>*itálico*</code> · <code>__sublinhado__</code> · <code>- item de lista</code> · <code>-&gt; centralizado &lt;-</code> · <code>---</code>{' '}
          (linha). Deixe uma linha em branco entre os parágrafos.
        </p>
      </details>
    </div>
  )
}
