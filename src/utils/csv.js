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
