// Shared defence against spreadsheet "formula injection": a cell whose text
// begins with '=', '+', '-', '@', a tab, or a carriage return is executed as
// a formula by Excel/Sheets/LibreOffice when the file is opened, not shown
// as data. Every value exported from this app — a task title, a voucher
// description, a note, someone's name — can be free text somebody typed, so
// this has to be applied at the export boundary rather than trusted from
// wherever the value came from.
const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r']

/**
 * Prefixes a single quote onto values that would otherwise be read as a
 * formula — the mitigation OWASP's CSV Injection guidance recommends.
 * Spreadsheet apps treat a leading quote as "this is text": on a CSV/TSV
 * import the quote itself is not shown, so this is invisible for the
 * overwhelming majority of real values, which don't start with these
 * characters at all.
 */
export function neutralizeFormula(value: string): string {
  return FORMULA_PREFIXES.some((p) => value.startsWith(p)) ? `'${value}` : value
}
