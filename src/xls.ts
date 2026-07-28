// Excel export with no dependencies.
//
// Emits SpreadsheetML 2003 (.xls), a plain-XML workbook format that Excel,
// LibreOffice, and Google Sheets all open natively. Unlike a CSV renamed to
// .xls it carries real cell types, so numbers arrive as numbers and long
// reference strings are not mangled into scientific notation.

type Cell = string | number | null | undefined

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function cellXml(value: Cell): string {
  if (value === null || value === undefined || value === '') {
    return '<Cell><Data ss:Type="String"></Data></Cell>'
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`
  }
  return `<Cell><Data ss:Type="String">${escapeXml(String(value))}</Data></Cell>`
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * `rows[0]` is treated as the header row and rendered bold.
 * Sheet names are capped at Excel's 31-character limit.
 */
export function downloadXls(filename: string, rows: Cell[][], sheetName = 'Report'): void {
  const [header, ...body] = rows
  const headerXml = header
    ? `<Row ss:StyleID="head">${header.map(cellXml).join('')}</Row>`
    : ''
  const bodyXml = body.map((r) => `<Row>${r.map(cellXml).join('')}</Row>`).join('')

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
          xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="head">
      <Font ss:Bold="1"/>
      <Interior ss:Color="#E4EFEC" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="${escapeXml(sheetName).slice(0, 31)}">
    <Table>${headerXml}${bodyXml}</Table>
  </Worksheet>
</Workbook>`

  triggerDownload(
    new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' }),
    filename,
  )
}
