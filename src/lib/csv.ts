// A spreadsheet file (CSV) from rows of values. Pure logic (no store, no screen), covered by scripts/check-csv.ts.
//
// Two things matter for a file that goes to an accountant: it must open correctly in Excel (a byte-order mark so accents survive, Windows
// line endings), and it must be safe to open: a cell that starts with = + - @ is run as a formula by a spreadsheet, so text that starts
// that way (a vendor called "=HYPERLINK(...)" typed by anyone) is written with a quote in front, which keeps it plain text. Real numbers
// are written as numbers, never touched.

export type Cell = string | number | boolean | null | undefined

/** One cell, ready for a file: numbers as they are, text quoted when it needs to be, formulas switched off. */
export function csvCell(v: Cell): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  let t = v.replace(/\r\n?|\n/g, ' ')                    // one line per row, always
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`                 // never a formula
  return /[",;\t]/.test(t) || t !== t.trim() ? `"${t.replace(/"/g, '""')}"` : t
}

/** The whole file as text: a header row, then the rows (each an object keyed by column title, in the order of `columns`). */
export function toCsv(columns: string[], rows: Record<string, Cell>[]): string {
  const line = (cells: Cell[]) => cells.map(csvCell).join(',')
  return '\uFEFF' + [line(columns), ...rows.map(r => line(columns.map(c => r[c])))].join('\r\n') + '\r\n'
}

/** A file name that every computer accepts: "Invoices - Noted Management - 2026-10-26.csv". */
export function csvFileName(parts: string[], isoDate: string): string {
  const clean = (s: string) => s.replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
  return `${[...parts.map(clean).filter(Boolean), isoDate.slice(0, 10)].join(' - ')}.csv`
}
