// Tiny CSV builder + download trigger (no dependencies).

type Cell = string | number | null | undefined

function escapeCell(v: Cell): string {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadCsv(filename: string, rows: Cell[][]): void {
  const csv = rows.map((r) => r.map(escapeCell).join(',')).join('\r\n')
  // BOM so Excel opens UTF-8 (currency symbols, names) correctly.
  triggerDownload(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), filename)
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  })
  triggerDownload(blob, filename)
}
