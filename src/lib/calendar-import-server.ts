// Server-only half of the calendar import: who may use it, opening the spreadsheet, and
// reading each messy row with Claude. Never import this from a 'use client' component - it
// holds the Anthropic key.
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import readXlsxFile from 'read-excel-file/node'
import { billReadingConfigured } from '@/lib/bills'
import {
  readTab, numberAppearsIn, venueAppearsIn, flagCarryOvers, CURRENCY_WORDS,
  type Cell, type ImportRow, type SheetTab, type SourceRow,
} from '@/lib/calendar-import'
import { toDateStr } from '@/lib/utils'

export const MAX_CALENDAR_BYTES = 4 * 1024 * 1024
export const calendarReadingConfigured = billReadingConfigured

// ── Opening the file ─────────────────────────────────────────
export async function openWorkbook(buf: Buffer): Promise<{ name: string; data: Cell[][] }[]> {
  const sheets = await readXlsxFile(buf)
  return sheets.map(s => ({ name: s.sheet, data: s.data as Cell[][] }))
}

export async function listTabs(buf: Buffer): Promise<SheetTab[]> {
  return (await openWorkbook(buf)).map(s => readTab(s.name, s.data).tab)
}

// ── Reading rows with Claude ─────────────────────────────────
// Deliberately plain (no nullable fields), like the settlement reader: "not written" is ""
// for text and 0 for numbers, and is turned back into "missing" below.
const rowSchema = z.object({
  id: z.number(),
  kind: z.enum(['show', 'travel', 'off', 'personal', 'other']),
  venue: z.string(),
  city: z.string(),
  status: z.enum(['confirmed', 'hold']),
  fee: z.number(),
  feeCurrency: z.enum(['USD', 'GBP', 'EUR', 'AUD', 'CAD', 'JPY', 'other', 'not stated']),
  notes: z.string(),
})
const extractedSchema = z.object({ rows: z.array(rowSchema) })
type ExtractedRow = z.infer<typeof rowSchema>

const SYSTEM = `You read rows from a touring artist's hand-kept master calendar. The calendar has one row per day; an extra row under a day is a second item on that same day. Each input line is one row, written as "[id] date | HEADER: value | HEADER: value". The headers differ between years, and people sometimes type a value under the wrong header (for example a fee under BUYER), so use both the header and the value.

For every input row return one result with the same id.

kind:
- "show": a performance (club show, festival, DJ set, live set), even if the details are still to be decided.
- "travel": a flight, transfer or travel day.
- "off": a day off, break, rest or studio day.
- "personal": something that isn't work (a wedding, a holiday, a football match).
- "other": anything else (a reminder or comment such as "offer details TBD").

For a show:
- venue and city exactly as written (keep the country if it is written, e.g. "Oslo, Norway"). Fix an obvious typo only if you are certain.
- fee: the artist's guarantee for that one show as a plain number with no symbols (20000, not "$20,000"). Use 0 when no fee is written, when it says TBC/TBD, or when one fee is quoted for several shows together (then explain in notes). Never use a "POTENTIAL" (walkout potential) figure or a capacity as the fee.
- feeCurrency: from the symbol or word next to the fee (£ = GBP, € or EUR = EUR, $ or USD = USD, AUD, CAD, JPY). If the fee is a bare number with no symbol or currency word, use "not stated". If there is no fee use "not stated".
- status: "confirmed" when the row reads like a real booking. Use "hold" when it says pencil, hold, TBC, TBD, potential, "lowest priority", or similar, or when there is nothing but a place name.
- notes: one short line (at most 160 characters) of the other useful details in plain words, only what is written: capacity, who the buyer or promoter is, the deal (e.g. "vs 85% deal"), the walkout potential, whether hotel and ground transport are provided (only when Y or specific), crew names (TM = tour manager, VJ = visuals, LD = lighting, MEDIA = media), and any remark. Do not repeat the venue, city or fee. Do not invent anything. Use "" if there is nothing to add.
For any other kind: leave venue and city "" unless a place is clearly named, set fee to 0, feeCurrency "not stated", status "hold", and put a short description of what the row says in notes.`

function anthropic() {
  // A personal ("sk-ant-usr-") key isn't tied to a workspace, so Anthropic needs the workspace named.
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID
  return new Anthropic({ defaultHeaders: workspaceId ? { 'anthropic-workspace-id': workspaceId } : undefined })
}

async function readChunk(client: Anthropic, rows: SourceRow[]): Promise<ExtractedRow[]> {
  const lines = rows.map(r => `[${r.id}] ${r.date} | ${r.text}`).join('\n')
  const response = await client.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: 'low', format: zodOutputFormat(extractedSchema) },
    messages: [{ role: 'user', content: `Read these ${rows.length} calendar rows.\n\n${lines}` }],
  })
  if (response.stop_reason === 'refusal') throw new Error('The AI declined to read this calendar')
  if (!response.parsed_output) throw new Error('The AI response could not be read')
  return response.parsed_output.rows
}

const CHUNK = 35

export async function readCalendarRows(sources: SourceRow[]): Promise<ImportRow[]> {
  const client = anthropic()
  const chunks: SourceRow[][] = []
  for (let i = 0; i < sources.length; i += CHUNK) chunks.push(sources.slice(i, i + CHUNK))
  const results = (await Promise.all(chunks.map(c => readChunk(client, c)))).flat()
  const byId = new Map(results.map(r => [r.id, r]))
  const todayIso = toDateStr(new Date())
  return sources.map(src => toImportRow(src, byId.get(src.id), src.date < todayIso))
}

// ── From the AI's reading to a row the person reviews ────────
function toImportRow(src: SourceRow, x: ExtractedRow | undefined, history: boolean): ImportRow {
  const warnings: string[] = []
  if (src.dateNote) warnings.push(src.dateNote)
  const base = { key: `${src.tab}:${src.id}`, tab: src.tab, sheetRow: src.id, date: src.date, source: src.text, ...(history ? { history: true } : {}) }

  // The AI skipped this row: keep it visible so nothing silently disappears.
  if (!x) return { ...base, kind: 'other', venue: '', city: '', status: 'hold', notes: src.text, warnings: [...warnings, "This row couldn't be read automatically"] }

  const row: ImportRow = {
    ...base, kind: x.kind, venue: x.venue.trim(), city: x.city.trim(), status: x.status, notes: x.notes.trim(), warnings,
  }
  if (x.kind !== 'show') return row
  if (history && x.status === 'hold') warnings.push('A past date that is still marked as a hold - it probably did not happen, so it is not ticked')

  if (!row.venue) warnings.push('No venue was found on this row')
  else if (!venueAppearsIn(row.venue, src.text)) warnings.push("The venue name isn't written on this row - check it")

  if (x.fee > 0) {
    if (!numberAppearsIn(x.fee, src.text)) warnings.push("The fee isn't written on this row - check it")
    const known = CURRENCY_WORDS[x.feeCurrency]
    if (known) { row.guarantee = x.fee; row.currency = known }
    else if (x.feeCurrency === 'not stated') {
      row.guarantee = x.fee; row.currency = 'USD'; row.currencyAssumed = true
    } else {
      // AUD / CAD / JPY / other: the app can't hold these yet, so keep the figure in the notes instead.
      const label = `Fee: ${x.feeCurrency === 'other' ? '' : x.feeCurrency + ' '}${x.fee.toLocaleString('en-US')}`
      row.notes = [label, row.notes].filter(Boolean).join(' · ')
      warnings.push(`${x.feeCurrency === 'other' ? 'This currency' : x.feeCurrency} isn't supported yet, so the fee is kept in the notes instead of the guarantee`)
    }
  }
  return row
}

// ── The whole job: tabs -> rows -> reviewed rows ─────────────
export async function readCalendar(buf: Buffer, tabNames: string[], includePast: boolean): Promise<{ rows: ImportRow[]; skippedPast: number }> {
  const todayIso = toDateStr(new Date())
  const sheets = (await openWorkbook(buf)).filter(s => tabNames.includes(s.name))
  const all: SourceRow[] = []
  let skippedPast = 0
  for (const s of sheets) {
    const { tab, rows } = readTab(s.name, s.data)
    if (!tab.supported) continue
    for (const r of rows) {
      if (!includePast && r.date < todayIso) { skippedPast++; continue }
      all.push(r)
    }
  }
  if (all.length > 450) throw new Error('That is a lot of rows at once - pick fewer tabs, or leave out dates that have already passed.')
  const rows = await readCalendarRows(all)
  flagCarryOvers(rows)
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.sheetRow - b.sheetRow)
  return { rows, skippedPast }
}
