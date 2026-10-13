// ──────────────────────────────────────────────────────────
//  Calendar import — the parts that don't need a server: finding the right date for every
//  row of a hand-kept master calendar, and turning reviewed rows into Shows.
//
//  The master calendar is one row per day, and people keep it by hand: dates drift (a copied
//  year-tab keeps last year's dates), a second show on the same day is an extra row with the
//  date left blank, and "off day" / "flight" rows sit in between. So dates are repaired HERE,
//  with plain rules the person can verify, instead of being left to the AI.
// ──────────────────────────────────────────────────────────

import type { Currency, Show } from '@/types'
import { toDateStr } from '@/lib/utils'

export type RowKind = 'show' | 'travel' | 'off' | 'personal' | 'other'

export interface SheetTab {
  name: string
  supported: boolean
  reason?: string     // why a tab can't be read (shown to the person)
  year?: number       // the year in the tab's name, if any
  rows: number        // rows with something written on them
  upcoming: number    // of those, how many are today or later
}

// One row of the sheet, cleaned up and ready to be read by the AI.
export interface SourceRow {
  id: number          // position in the tab (1 = the header row), so a reviewer can find it
  tab: string
  date: string        // ISO, repaired where the sheet's own date was wrong
  dateNote?: string   // set when the date was repaired or inherited
  text: string        // "VENUE: Fabric | CITY: London | FEE: £5,000"
  cells: Record<string, string>
}

// One row as shown on the review screen (and edited there) before anything is saved.
export interface ImportRow {
  key: string
  tab: string
  sheetRow: number
  date: string
  kind: RowKind
  venue: string
  city: string
  status: 'confirmed' | 'hold'
  guarantee?: number
  currency?: Currency
  currencyAssumed?: boolean   // the sheet didn't say which currency; US dollars were assumed
  notes: string
  warnings: string[]
  source: string      // what the sheet actually said, for comparing against
}

// ── Reading the sheet's cells ────────────────────────────────
export type Cell = string | number | boolean | Date | null | undefined

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const pad = (n: number) => String(n).padStart(2, '0')
const isoUtc = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`

// Excel keeps dates as day-numbers; a library may hand them back as numbers or as Date objects.
function cellToIso(v: Cell): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return isoUtc(v)
  if (typeof v === 'number' && v > 20000 && v < 80000) return isoUtc(new Date(Date.UTC(1899, 11, 30) + v * 86400000))
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v.trim())) return v.trim().slice(0, 10)
  return null
}

function cellText(v: Cell): string {
  if (v == null) return ''
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : isoUtc(v)
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100)
  return String(v).replace(/\s+/g, ' ').trim()
}

const weekdayOf = (iso: string) => new Date(iso + 'T00:00:00Z').getUTCDay()
const withYear = (iso: string, year: number) => `${year}${iso.slice(4)}`
function addDaysIso(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return isoUtc(d)
}
const validIso = (iso: string) => !isNaN(new Date(iso + 'T00:00:00Z').getTime()) && isoUtc(new Date(iso + 'T00:00:00Z')) === iso

/**
 * The right calendar day for a row.
 *  1. The sheet's own date, if it is in the tab's year and agrees with the weekday written next to it.
 *  2. Otherwise the same month/day in the tab's year, if THAT agrees with the weekday (a tab copied
 *     from last year still carries last year's dates but the right weekday names).
 *  3. Otherwise the day after the previous row.
 * A row with no date at all is a second item on the previous row's day.
 */
export function resolveRowDate(
  tabYear: number | undefined,
  rawDate: string | null,
  dayLabel: string,
  previous: string | null,
): { date: string; note?: string } | null {
  const label = DAY_NAMES.indexOf(dayLabel.trim().slice(0, 3).toLowerCase())
  const fits = (iso: string) => validIso(iso) && (tabYear == null || Number(iso.slice(0, 4)) === tabYear) && (label < 0 || weekdayOf(iso) === label)

  if (!rawDate) return previous ? { date: previous, note: 'No date on this row, so it was placed on the same day as the row above' } : null
  if (fits(rawDate)) return { date: rawDate }
  if (tabYear != null) {
    const shifted = withYear(rawDate, tabYear)
    if (fits(shifted)) return { date: shifted, note: `The sheet said ${rawDate}; the weekday written next to it matches ${shifted}` }
  }
  if (previous) {
    const next = addDaysIso(previous, 1)
    if (tabYear == null || Number(next.slice(0, 4)) === tabYear) return { date: next, note: `The sheet's date (${rawDate}) didn't fit, so it was placed on the day after the row above` }
  }
  return null
}

const yearInName = (name: string) => {
  const m = name.match(/\b(20\d\d)\b/)
  return m ? Number(m[1]) : undefined
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Reads one tab (rows of cells, first row = headers) into cleaned rows. Returns null for tabs that aren't a day-per-row calendar. */
export function readTab(name: string, data: Cell[][]): { tab: SheetTab; rows: SourceRow[] } {
  const base: SheetTab = { name, supported: false, year: yearInName(name), rows: 0, upcoming: 0 }
  const header = data[0]?.map(cellText) ?? []
  const dateCol = header.findIndex(h => norm(h) === 'date')
  const venueCol = header.findIndex(h => norm(h) === 'venue')
  if (dateCol < 0 || venueCol < 0) {
    return { tab: { ...base, reason: "This tab isn't laid out as a day-by-day calendar (it needs DATE and VENUE columns)" }, rows: [] }
  }
  const dayCol = header.findIndex(h => norm(h) === 'day')

  const rows: SourceRow[] = []
  let previous: string | null = null
  for (let i = 1; i < data.length; i++) {
    const r = data[i] ?? []
    const resolved = resolveRowDate(base.year, cellToIso(r[dateCol]), dayCol >= 0 ? cellText(r[dayCol]) : '', previous)
    if (resolved) previous = resolved.date

    const cells: Record<string, string> = {}
    header.forEach((h, c) => {
      if (c === dateCol || c === dayCol || !h) return
      const t = cellText(r[c])
      if (t) cells[h] = t
    })
    if (Object.keys(cells).length === 0 || !resolved) continue   // a day with nothing written on it
    const text = Object.entries(cells).map(([h, v]) => `${h}: ${v}`).join(' | ')
    rows.push({ id: i + 1, tab: name, date: resolved.date, dateNote: resolved.note, text, cells })
  }
  const todayIso = toDateStr(new Date())
  return {
    tab: { ...base, supported: true, rows: rows.length, upcoming: rows.filter(r => r.date >= todayIso).length },
    rows,
  }
}

// ── Checks on what the AI returned (it never gets the last word on its own) ──
export const CURRENCY_WORDS: Record<string, Currency> = { USD: 'USD', GBP: 'GBP', EUR: 'EUR' }

const digitsOf = (s: string) => s.replace(/[^0-9]/g, '')

/** True when a number the AI reported really appears somewhere in the row's text. */
export function numberAppearsIn(n: number, rowText: string): boolean {
  if (!n) return true
  const want = String(Math.round(n))
  return rowText.split(/[^0-9.,]+/).some(tok => tok && digitsOf(tok.replace(/\.\d{1,2}$/, '')) === want)
}

/** True when the venue the AI reported is (nearly) written in the row. */
export function venueAppearsIn(venue: string, rowText: string): boolean {
  const v = norm(venue)
  if (!v) return true
  const text = norm(rowText)
  if (text.includes(v)) return true
  const words = v.split(' ').filter(w => w.length > 2)
  return words.length > 0 && words.every(w => text.includes(w))
}

// ── From reviewed rows to Shows ──────────────────────────────
export function findDuplicate(row: Pick<ImportRow, 'date' | 'venue'>, existing: Show[]): Show | undefined {
  const v = norm(row.venue)
  return existing.find(s => {
    if (s.date !== row.date || s.status === 'cancelled') return false
    const e = norm(s.venue)
    return !!e && !!v && (e === v || e.includes(v) || v.includes(e))
  })
}

export function showsOnSameDay(date: string, existing: Show[]): Show[] {
  return existing.filter(s => s.date === date && s.status !== 'cancelled')
}

export function rowToShow(row: ImportRow, id: string, sourceLabel: string): Show {
  const stamp = `Imported from ${sourceLabel}, ${row.tab} tab, row ${row.sheetRow}.`
  return {
    id,
    date: row.date,
    city: row.city.trim(),
    venue: row.venue.trim(),
    time: '20:00',
    status: row.status,
    guarantee: row.guarantee && row.guarantee > 0 ? row.guarantee : undefined,
    currency: row.guarantee && row.guarantee > 0 ? (row.currency ?? 'USD') : undefined,
    notes: [row.notes.trim(), stamp].filter(Boolean).join('\n'),
  }
}
