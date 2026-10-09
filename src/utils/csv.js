/**
 * Exporta linhas para CSV (separador ";" para abrir direto no Excel pt-BR).
 * @param {string} filename
 * @param {{ header: string, value: (row: any) => any }[]} columns
 * @param {any[]} rows
 */
export function exportCSV(filename, columns, rows) {
  const escape = (v) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [
    columns.map((c) => escape(c.header)).join(';'),
    ...rows.map((row) => columns.map((c) => escape(c.value(row))).join(';')),
  ]
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Lê um CSV (separador ";", "," ou tab detectado pelo cabeçalho; aspas e quebras de linha entre aspas).
 * @param {string} text
 * @returns {string[][]} linhas (sem linhas vazias)
 */
export function parseCSV(text) {
  const src = String(text ?? '').replace(/^﻿/, '')
  const firstLine = src.split(/\r?\n/, 1)[0] ?? ''
  const count = (ch) => firstLine.split(ch).length - 1
  const sep = [';', ',', '\t'].reduce((best, ch) => (count(ch) > count(best) ? ch : best), ';')

  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === sep) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''))
}
