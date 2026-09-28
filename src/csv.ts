import { neutralizeFormula } from './spreadsheet-safety'
import { shareOrDownloadFile } from './pdf'

type Cell = string | number | null | undefined

function escapeCell(v: Cell): string {
  const s = v === null || v === undefined ? '' : neutralizeFormula(String(v))
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function downloadCsv(filename: string, rows: Cell[][]): void {
  const csv = rows.map((r) => r.map(escapeCell).join(',')).join('\r\n')
  // BOM so Excel opens UTF-8 (currency symbols, names) correctly.
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  shareOrDownloadFile(blob, filename)
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  })
  shareOrDownloadFile(blob, filename)
}
