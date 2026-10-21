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
  offer_sheets: 'id!, client_id!, offer_id!, version!, status, detail, message, snapshot:j!, sent_at, responded_at, response_note',
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
  'invoices', 'invoice_line_items', 'tour_offers', 'shows', 'show_deals', 'budgets', 'offer_sheets', 'settlements', 'settlement_shows', 'expenses', 'expense_shows', 'deposits',
  'royalty_streams', 'catalog_works', 'pl_months', 'client_finance_settings', 'show_advances', 'advance_contacts', 'guest_list_entries',
  'travel_items', 'flight_legs', 'travel_item_shows', 'projects', 'artist_todos',
]
/** What the demo artist has now is removed table by table (the rest follows by the database's own cascades, see CASCADE_FROM). */
export const REMOVE_FIRST = [
  'deposits', 'expenses', 'settlements', 'budgets', 'invoices', 'show_deals', 'tour_offers', 'shows', 'travel_items', 'runs', 'contracts', 'projects',
  'artist_todos', 'posts', 'albums', 'royalty_streams', 'catalog_works', 'pl_months', 'people', 'vendors', 'client_finance_settings', 'tasks', 'agenda_points',
  'item_access',   // per-item "who sees what" rules name rows by id; a re-seed rebuilds the rows, so the demo starts with none of those exceptions
]
/** Tables with no delete of their own: they go when the table named here is cleared (the database cascades the delete). */
export const CASCADE_FROM: Record<string, string> = {
  crew_members: 'people', crew_rates: 'crew_members', tracks: 'albums', track_credits: 'tracks', checklist_items: 'albums', release_stakeholders: 'albums',
  invoice_line_items: 'invoices', offer_sheets: 'tour_offers', settlement_shows: 'settlements', expense_shows: 'expenses', show_advances: 'shows',
  advance_contacts: 'show_advances', guest_list_entries: 'shows', flight_legs: 'travel_items', travel_item_shows: 'travel_items',
}
/** Which tables a table points at, so each parent is written before its children. */
export const PARENTS: Record<string, string[]> = {
  tracks: ['albums'], track_credits: ['tracks'], checklist_items: ['albums'], release_stakeholders: ['albums', 'people'], posts: ['albums'],
  crew_members: ['people'], crew_rates: ['crew_members'], invoice_line_items: ['invoices'], shows: ['runs', 'tour_offers'],
  show_deals: ['shows', 'invoices'], budgets: ['tour_offers', 'shows', 'runs'], offer_sheets: ['tour_offers'], settlement_shows: ['settlements', 'shows'],
  expenses: ['vendors', 'runs'], expense_shows: ['expenses', 'shows'], deposits: ['invoices'], show_advances: ['shows'], advance_contacts: ['show_advances'],
  guest_list_entries: ['shows'], travel_items: ['runs'], flight_legs: ['travel_items'], travel_item_shows: ['travel_items', 'shows'],
}
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isRealDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d

export function demoSql(ctx: DemoContext, rows: DemoRows, opts: { dryRun?: boolean } = {}): string {
  if (!isRealDate(ctx.anchor)) throw new Error(`The date must be a real day like 2026-11-02, got "${ctx.anchor}"`)
  if (!UUID.test(ctx.ownerUserId)) throw new Error(`The owner must be a user id (a uuid), got "${ctx.ownerUserId}"`)
  if (!/^[a-z0-9-]+$/.test(ctx.clientId)) throw new Error(`The artist id may only use lower-case letters, digits and dashes, got "${ctx.clientId}"`)
  const problems = validateRows(rows)
  if (problems.length) throw new Error(`The demo rows are not valid:\n${problems.slice(0, 20).join('\n')}`)
  const cid = quote(ctx.clientId)
  const parts: string[] = []
  parts.push(`-- Replaces ${ctx.clientId} with the demo story dated from ${ctx.anchor}.`)
  // Stop before changing anything unless this really is the owner's demo artist, and no login or invitation is tied to a demo person
  // (deleting a person would quietly unlink it).
  parts.push(`if not exists (select 1 from public.clients where id = ${cid} and demo_owner = ${quote(ctx.ownerUserId)}::uuid) then
  raise exception 'Stopped: % is not a demo artist owned by %. Nothing was changed.', ${cid}, ${quote(ctx.ownerUserId)};
end if;
if exists (select 1 from public.workspace_members m join public.people p on p.id = m.person_id where p.client_id = ${cid})
   or exists (select 1 from public.pending_invites i join public.people p on p.id = i.person_id where p.client_id = ${cid} and i.used_at is null) then
  raise exception 'Stopped: a login or an open invitation is linked to one of the demo people, and re-seeding would unlink it. Nothing was changed.';
end if;`)
  for (const t of REMOVE_FIRST) parts.push(`delete from public.${t} where client_id = ${cid};`)
  // Alerts marked done on Home are remembered by key (rule:artist:item:urgency). The demo's items keep the same ids, so a re-seed would
  // leave them hidden; clear only the demo artist's.
  parts.push(`delete from public.inbox_state where item_key like ${quote(`%:${ctx.clientId}:%`)};`)
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
    financeSettingsQ: q('client_finance_settings'), expenseShowsQ: q('expense_shows'), offerSheetsQ: q('offer_sheets'), settlementsQ: q('settlements'), settlementShowsQ: q('settlement_shows'),
    profilesQ: EMPTY, accountsQ: EMPTY, tasksQ: EMPTY, agendaQ: EMPTY, showDealsQ: q('show_deals'),
  }
}
