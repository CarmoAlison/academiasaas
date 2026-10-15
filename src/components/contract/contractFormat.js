/**
 * Formatação do texto do contrato (Markdown simplificado), usada na tela, no PDF e no editor:
 *
 *   # Título              ## Subtítulo
 *   **negrito**           *itálico*            __sublinhado__
 *   - item de lista       -> texto centralizado <-
 *   ---  (linha divisória)
 *
 * Parágrafos são separados por linha em branco; a quebra de linha simples é mantida.
 * Marcador sem par (ex.: um "*" solto) fica como texto.
 */

const MARKS = { '**': 'b', '*': 'i', __: 'u' }

/** Texto de uma linha → trechos com { text, b, i, u } */
export function parseInline(text) {
  const tokens = String(text ?? '').split(/(\*\*|__|\*)/).filter((t) => t !== '')
  const state = { b: false, i: false, u: false }
  const runs = []
  tokens.forEach((tok, idx) => {
    const flag = MARKS[tok]
    // marcador só vale se abre e tem par adiante, ou se fecha um que está aberto
    if (flag && (state[flag] || tokens.indexOf(tok, idx + 1) !== -1)) {
      state[flag] = !state[flag]
      return
    }
    const last = runs[runs.length - 1]
    if (last && last.b === state.b && last.i === state.i && last.u === state.u) last.text += tok
    else runs.push({ text: tok, ...state })
  })
  return runs
}

const HEADING = /^(#{1,2})\s+(.*)$/
const LIST = /^[-•]\s+(.*)$/
const CENTER = /^->\s*(.*?)\s*<-$/
const RULE = /^-{3,}$/

/**
 * Texto do contrato → blocos
 * @returns {Array<{ type: 'h1'|'h2'|'p'|'center'|'list'|'hr', lines?: ReturnType<typeof parseInline>[], items?: ReturnType<typeof parseInline>[], runs?: ReturnType<typeof parseInline> }>}
 */
export function parseContract(text) {
  const blocks = []
  let para = null
  let list = null
  let paraRaw = []
  const flush = () => {
    if (para) blocks.push({ type: 'p', lines: para, raw: paraRaw.join('\n') })
    if (list) blocks.push({ type: 'list', items: list })
    para = null
    list = null
    paraRaw = []
  }

  for (const rawLine of String(text ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim()
    if (!line) {
      flush()
      continue
    }
    let m
    if ((m = line.match(HEADING))) {
      flush()
      blocks.push({ type: m[1].length === 1 ? 'h1' : 'h2', runs: parseInline(m[2]) })
    } else if (RULE.test(line)) {
      flush()
      blocks.push({ type: 'hr' })
    } else if ((m = line.match(CENTER))) {
      flush()
      blocks.push({ type: 'center', runs: parseInline(m[1]) })
    } else if ((m = line.match(LIST))) {
      if (para) {
        blocks.push({ type: 'p', lines: para, raw: paraRaw.join('\n') })
        para = null
        paraRaw = []
      }
      list = list ?? []
      list.push(parseInline(m[1]))
    } else {
      if (list) {
        blocks.push({ type: 'list', items: list })
        list = null
      }
      para = para ?? []
      para.push(parseInline(line))
      paraRaw.push(line)
    }
  }
  flush()

  // contratos antigos: 1º parágrafo de uma linha só em MAIÚSCULAS = título do documento
  const first = blocks[0]
  if (first?.type === 'p' && first.lines.length === 1 && /^[A-ZÀ-Ú0-9 .,:()-]{8,}$/.test(first.raw)) {
    blocks[0] = { type: 'h1', runs: first.lines[0] }
  }
  return blocks
}

/** Texto sem marcadores (busca, título do PDF etc.) */
export const plainText = (runs) => runs.map((r) => r.text).join('')
