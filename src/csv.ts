// Tiny CSV builder + download trigger (no dependencies).

type Cell = string | number | null | undefined

function escapeCell(v: Cell): string {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function downloadCsv(filename: string, rows: Cell[][]): void {
  const csv = rows.map((r) => r.map(escapeCell).join(',')).join('\r\n')
  // BOM so Excel opens UTF-8 (currency symbols, names) correctly.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
