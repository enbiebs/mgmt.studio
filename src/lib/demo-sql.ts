// ──────────────────────────────────────────────────────────
//  Turns the demo rows (lib/demo-seed.ts) into ONE block of SQL that replaces the demo artist's records: it removes what the demo
//  artist has now and writes the new rows, all in a single step (so a mistake anywhere undoes the whole thing). With `dryRun` the block
//  ends in a deliberate error, so nothing is kept: a safe way to check it against the real database first.
//  Also describes each table's columns, so a typo in a column name or a missing required value is caught before anything runs.
//  Pure logic (no network). Used by scripts/seed-demo.ts and scripts/check-demo-seed.ts.
// ──────────────────────────────────────────────────────────

import type { WorkspaceRows } from '@/lib/db'
import type { DemoContext, DemoRows, Row } from '@/lib/demo-seed'

// "name!" = required (no default), "name:j" = JSON, "name:a" = a list of text
const SPEC: Record<string, string> = {
  vendors: 'id!, client_id!, name!, address, email, phone, tax_id, bank_last4, bank_fingerprint, created_at, updated_at',
  runs: 'id!, client_id!, name!, created_at',
  people: 'id!, client_id!, name!, email, phone, org, notes, activity:j, title',
  crew_members: 'id!, client_id!, role, passport, emergency_name, emergency_phone, notes, person_id!',
  crew_rates: 'crew_member_id!, client_id!, tours_with_artist, rate_unit, rate_show, rate_travel, per_diem, currency, rate_advance',
  albums: 'id!, client_id!, title!, release_date, upc, label, primary_artist, genre, copyright_p, copyright_c, type',
  tracks: 'id!, album_id!, num!, title!, stage, version, touched, notes, isrc, writers, producers, publisher, pro, explicit, duration, language, priority, owner, due_date, release_date, lyrics, mixer_brief',
  track_credits: 'id!, track_id!, name!, role!, split, sort_order',
  checklist_items: 'id, album_id!, key!, label!, phase!, done, note',
  release_stakeholders: 'id!, album_id!, role!, notes, person_id!',
  posts: 'id!, client_id!, date!, title!, time!, type!, release_id, auto, updated_at',
  contracts: 'id!, client_id!, title!, type!, status, counterparty!, value, currency, signed_date, expiry_date, notes, created_at!, flagged',
  invoices: 'id!, client_id!, number!, to_name!, to_email, category!, status, issued_date!, due_date!, paid_date, currency, notes',
  invoice_line_items: 'id, invoice_id!, description!, quantity, rate, sort_order',
  tour_offers: 'id!, client_id!, venue!, city!, country!, date!, promoter!, guarantee, door, buyout, status, notes, settled_at, net_payout, show_id, via_agency, agency_name, agency_commission_pct, management_commission_pct, terms:j',
  shows: 'id!, client_id!, date!, city!, venue!, time!, status, notes, tour_offer_id, updated_at, run_id, history_only, drive_url',
  show_deals: 'show_id!, id, client_id!, guarantee, deposit, currency, via_agency, agency_name, agency_commission_pct, management_commission_pct, invoice_id, updated_at, received',
  budgets: 'id!, client_id!, offer_id, show_id, run_id, name!, currency, status, version, lines:j, commissions:j, notes, original:j, locked_at, created_at, updated_at, assumptions:j',
  settlements: 'id!, client_id!, file_path, file_name, event_name, venue, promoter, prepared_on, prepared_by, currency, fx:j!, attendance:j, summary:j, deal:j, box_office:j, expenses:j, payout:j!, total_due!, payments:j, balance_due, notes, confirmed_at',
  settlement_shows: 'settlement_id!, show_id!',
  expenses: 'id!, client_id!, description!, vendor!, amount!, currency, category!, date!, paid, vendor_id, due_date, bill_number, bill_file_path, vendor_flags:a, run_id, bucket',
  expense_shows: 'id!, expense_id!, show_id!',
  deposits: 'id!, client_id!, name!, date!, amount!, currency, mgmt, lawyer, taxes, done, invoice_id',
  royalty_streams: 'id!, client_id!, name!, type!, amount, currency, period!',
  catalog_works: 'id!, client_id!, title!, ipi, writers!, amount, currency, bmi, mlc, sx, ppl',
  pl_months: 'id, client_id!, month!, rev_touring, rev_streaming, rev_sync, rev_brand, rev_merch, rev_other, exp_travel, exp_recording, exp_marketing, exp_legal, exp_management, exp_equipment, exp_meals, exp_other',
  client_finance_settings: 'client_id!, home_currency, default_commissions:j',
  show_advances: 'id!, show_id!, status, sent_at, completed_at, schedule:j, production:j, hospitality:j, logistics:j, wifi, wifi_password, weather_notes, guest_list_cap, guest_list_notes, general_notes',
  advance_contacts: 'id!, advance_id!, role!, name!, phone, email, notes',
  guest_list_entries: 'id!, show_id!, name!, qty, category, checked_in, credential, notes',
  travel_items: 'id!, show_id, kind!, status, confirmation_code, cost, currency, notes, traveler, airline, flight_number, from_loc, from_city, to_loc, to_city, departure, arrival, duration, cabin, seats, hotel_name, address, phone, check_in, check_out, room_count, room_type, ground_type, provider, pickup_time, vehicle_type, person_ids:a, client_id!, run_id',
  flight_legs: 'id!, travel_item_id!, leg_order, airline, flight_number, from_loc, from_city, to_loc, to_city, departure, arrival, duration, cabin',
  travel_item_shows: 'id!, travel_item_id!, show_id!',
  projects: 'id!, client_id!, title!, type!, status, assignee, due_date, notes, created_at!, from_artist, updated_at, assignee_user',
  artist_todos: 'id!, client_id!, title!, done, due_date, created_at!',
}

export interface TableInfo { columns: string[]; required: string[]; json: string[]; arrays: string[] }
export const TABLES: Record<string, TableInfo> = Object.fromEntries(Object.entries(SPEC).map(([table, spec]) => {
  const cols = spec.split(',').map(s => s.trim())
  const name = (c: string) => c.replace(/[!]$/, '').replace(/:[ja]!?$/, '')
  return [table, {
    columns: cols.map(name),
    required: cols.filter(c => c.endsWith('!')).map(name),
    json: cols.filter(c => /:j!?$/.test(c)).map(name),
    arrays: cols.filter(c => /:a!?$/.test(c)).map(name),
  }]
}))

/** The order rows are written in, so each row's links point at something that already exists. */
export const INSERT_ORDER = [
  'vendors', 'runs', 'people', 'crew_members', 'crew_rates', 'albums', 'tracks', 'track_credits', 'checklist_items', 'release_stakeholders', 'posts', 'contracts',
  'invoices', 'invoice_line_items', 'tour_offers', 'shows', 'show_deals', 'budgets', 'settlements', 'settlement_shows', 'expenses', 'expense_shows', 'deposits',
  'royalty_streams', 'catalog_works', 'pl_months', 'client_finance_settings', 'show_advances', 'advance_contacts', 'guest_list_entries',
  'travel_items', 'flight_legs', 'travel_item_shows', 'projects', 'artist_todos',
]
/** What the demo artist has now is removed table by table (the rest follows by the database's own cascades). */
const REMOVE_FIRST = [
  'deposits', 'expenses', 'settlements', 'budgets', 'invoices', 'show_deals', 'tour_offers', 'shows', 'travel_items', 'runs', 'contracts', 'projects',
  'artist_todos', 'posts', 'albums', 'royalty_streams', 'catalog_works', 'pl_months', 'people', 'vendors', 'client_finance_settings', 'tasks', 'agenda_points',
  'item_access',   // "who sees what" rules name rows by id, and every demo id is new, so the old rules would point at nothing
]
/** The offer and the show point at each other: the offer is written first without its show, and pointed at it afterwards. */
const AFTER_SHOWS: Record<string, string> = { tour_offers: 'show_id' }

// ── Checking rows before anything is written ──
export function validateRows(rows: DemoRows): string[] {
  const problems: string[] = []
  for (const [table, list] of Object.entries(rows)) {
    const info = TABLES[table]
    if (!info) { problems.push(`${table}: not a table the seed knows`); continue }
    list.forEach((row, i) => {
      for (const key of Object.keys(row)) if (!info.columns.includes(key)) problems.push(`${table}[${i}]: unknown column "${key}"`)
      for (const need of info.required) if (row[need] === undefined || row[need] === null) problems.push(`${table}[${i}]: "${need}" is required`)
    })
  }
  for (const table of Object.keys(rows)) if (!INSERT_ORDER.includes(table)) problems.push(`${table}: has rows but is not in the write order`)
  return problems
}

// ── SQL ──
const quote = (s: string) => `'${s.replace(/'/g, "''")}'`

function literal(value: unknown, table: string, column: string): string {
  const info = TABLES[table]
  if (value === undefined) return 'default'
  if (value === null) return 'null'
  if (info.json.includes(column)) return `${quote(JSON.stringify(value))}::jsonb`
  if (info.arrays.includes(column)) return `array[${(value as string[]).map(quote).join(', ')}]::text[]`
  if (typeof value === 'string') return quote(value)
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error(`${table}.${column} is not a number`); return String(value) }
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  throw new Error(`${table}.${column}: cannot write a ${typeof value}`)
}

function insertSql(table: string, list: Row[], skip?: string): string {
  if (list.length === 0) return ''
  const info = TABLES[table]
  const used = info.columns.filter(c => c !== skip && list.some(r => r[c] !== undefined))
  const values = list.map(r => `(${used.map(c => literal(r[c], table, c)).join(', ')})`).join(',\n  ')
  return `insert into public.${table} (${used.join(', ')}) values\n  ${values};`
}

export function demoSql(ctx: DemoContext, rows: DemoRows, opts: { dryRun?: boolean } = {}): string {
  const problems = validateRows(rows)
  if (problems.length) throw new Error(`The demo rows are not valid:\n${problems.slice(0, 20).join('\n')}`)
  const cid = quote(ctx.clientId)
  const parts: string[] = []
  parts.push(`-- Replaces ${ctx.clientId} with the demo story dated from ${ctx.anchor}.`)
  for (const t of REMOVE_FIRST) parts.push(`delete from public.${t} where client_id = ${cid};`)
  for (const t of INSERT_ORDER) {
    const list = rows[t] ?? []
    parts.push(insertSql(t, list, AFTER_SHOWS[t]))
    if (t === 'shows') {
      for (const offerTable of Object.keys(AFTER_SHOWS)) for (const r of rows[offerTable] ?? []) {
        if (r[AFTER_SHOWS[offerTable]]) parts.push(`update public.${offerTable} set ${AFTER_SHOWS[offerTable]} = ${quote(String(r[AFTER_SHOWS[offerTable]]))} where id = ${quote(String(r.id))};`)
      }
    }
  }
  // Seeding writes "who changed what" entries for every row; the demo's history is not worth keeping, so the noise is cleared again.
  parts.push(`delete from public.activity_log where client_id = ${cid};`)
  if (opts.dryRun) parts.push(`raise exception 'DEMO SEED DRY RUN OK (rolled back)';`)
  return `do $demo$\nbegin\n${parts.filter(Boolean).join('\n')}\nend\n$demo$;`
}

// ── The same rows, as the app's row reader takes them ──
const EMPTY = { data: [] as Row[] }
/** The rows in the shape lib/db.ts reads, so a check can run them through the very code the app uses. */
export function toWorkspaceRows(ctx: DemoContext, rows: DemoRows): WorkspaceRows {
  const q = (t: string) => ({ data: rows[t] ?? [] })
  return {
    clientRows: [{ id: ctx.clientId, name: 'Nova Lane (Demo)', genre: 'Electronic / House', color: '#8b5cf6', calendar_token: null, demo_owner: ctx.ownerUserId, setup_skipped: [], analytics: {}, photo_path: null, logo_path: null }],
    albums: q('albums'), tracks: q('tracks'), shows: q('shows'), posts: q('posts'), royaltyStreams: q('royalty_streams'), deposits: q('deposits'), catalogWorks: q('catalog_works'),
    projects: q('projects'), artistTodos: q('artist_todos'), tourOffers: q('tour_offers'), contracts: q('contracts'), invoices: q('invoices'), lineItems: q('invoice_line_items'),
    expenses: q('expenses'), plMonths: q('pl_months'), checklistItems: q('checklist_items'), stakeholders: q('release_stakeholders'), crewMembers: q('crew_members'),
    showAdvances: q('show_advances'), advanceContacts: q('advance_contacts'), guestListEntries: q('guest_list_entries'), travelItems: q('travel_items'), flightLegs: q('flight_legs'),
    travelItemShows: q('travel_item_shows'), people: q('people'), bankAccounts: EMPTY, bankTransactions: EMPTY, trackRounds: EMPTY, trackNotes: EMPTY, trackNoteReplies: EMPTY,
    trackCredits: q('track_credits'), venues: EMPTY, vendors: q('vendors'), runsQ: q('runs'), budgetsQ: q('budgets'), crewRatesQ: q('crew_rates'),
    financeSettingsQ: q('client_finance_settings'), expenseShowsQ: q('expense_shows'), offerSheetsQ: EMPTY, settlementsQ: q('settlements'), settlementShowsQ: q('settlement_shows'),
    profilesQ: EMPTY, accountsQ: EMPTY, tasksQ: EMPTY, agendaQ: EMPTY, showDealsQ: q('show_deals'),
  }
}
