// ──────────────────────────────────────────────────────────
//  Loading one company's data for a job that runs on our server (the daily email), where the database's own access rules are not in play
//  (the server's key sees every row of every company). Server only: never import this from a screen.
//
//  Two things the screen's loader (loadWorkspaceData) does not have to care about, because there the database limits what comes back:
//    1. Scope. Every table is read only for THIS company's rows (the artists, then each table's own parent ids, a hundred at a time), so a
//       second company can never end up in the answer and the job never downloads other companies' data.
//    2. Paging. The database returns at most 1,000 rows per request and says nothing when it cuts a list off, so every read goes a page at a
//       time until it runs out. A silently shortened list would quietly drop the "hide this from her" rows the email depends on.
//  The rows are handed to the same assembleWorkspace the screen uses, so both read them identically.
// ──────────────────────────────────────────────────────────

import type { createAdminClient } from '@/lib/supabase/admin'
import { assembleWorkspace, type WorkspaceRows } from '@/lib/db'
import type { AppData } from '@/types'

type Admin = ReturnType<typeof createAdminClient>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any

export const PAGE_SIZE = 1000
const CHUNK = 100                  // ids per request (a long list in the address of a request is refused)
/** A read that is still going after this many pages is a mistake (a loop), not a company: it fails instead of running forever. */
const MAX_PAGES = 200

interface Order { col: string; desc?: boolean }

/** Every row of `table` whose `col` is one of `ids` (all rows when `col` is null), a page at a time. Throws when a read fails. */
export async function fetchAllRows(admin: Admin, table: string, col: string | null, ids: string[] | null, order: Order[], columns = '*'): Promise<Row[]> {
  const chunks: (string[] | null)[] = col === null || ids === null ? [null] : []
  if (col !== null && ids !== null) for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK))
  const out: Row[] = []
  for (const chunk of chunks) {
    for (let page = 0; ; page++) {
      if (page >= MAX_PAGES) throw new Error(`${table}: too many pages`)
      let q = admin.from(table).select(columns)
      if (col !== null && chunk) q = q.in(col, chunk)
      for (const o of order) q = q.order(o.col, { ascending: !o.desc })
      const { data, error } = await q.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
      if (error) throw new Error(`${table}: read failed`)
      const rows = (data ?? []) as Row[]
      out.push(...rows)
      if (rows.length < PAGE_SIZE) break
    }
  }
  return out
}

const q = (rows: Row[]) => ({ data: rows })
const id = (r: Row) => r.id as string
const BY_ID: Order[] = [{ col: 'id' }]

/** One company's artists and everything about them, as the screen would see it with no rules in the way. */
export async function loadWorkspaceDataServer(workspaceId: string, admin: Admin): Promise<AppData> {
  const clientRows = await fetchAllRows(admin, 'clients', 'workspace_id', [workspaceId], BY_ID,
    'id, name, genre, color, calendar_token, demo_owner, setup_skipped, analytics, photo_path, logo_path')
  if (clientRows.length === 0) return { clients: [] }
  const clientIds = clientRows.map(id)
  const byClient = (table: string, order: Order[] = BY_ID) => fetchAllRows(admin, table, 'client_id', clientIds, order)
  const children = (table: string, col: string, parents: Row[], key: (r: Row) => string = id, order: Order[] = BY_ID) =>
    fetchAllRows(admin, table, col, parents.map(key), order)

  // Everything that belongs to an artist directly.
  const [albums, shows, posts, royaltyStreams, deposits, catalogWorks, projects, artistTodos, tourOffers, contracts, invoices, expenses, plMonths,
    crewMembers, travelItems, people, bankAccounts, bankTransactions, venues, vendors, runs, budgets, crewRates, financeSettings, offerSheets,
    settlements, profiles, accounts, tasks, agenda, showDeals] = await Promise.all([
    byClient('albums'), byClient('shows'), byClient('posts'), byClient('royalty_streams'), byClient('deposits'), byClient('catalog_works'),
    byClient('projects'), byClient('artist_todos'), byClient('tour_offers'), byClient('contracts'), byClient('invoices'), byClient('expenses'),
    byClient('pl_months'), byClient('crew_members'), byClient('travel_items'), byClient('people'), byClient('bank_accounts'),
    byClient('bank_transactions', [{ col: 'date', desc: true }, { col: 'id' }]), byClient('venues'), byClient('vendors'), byClient('runs'),
    byClient('budgets'), byClient('crew_rates', [{ col: 'crew_member_id' }]), byClient('client_finance_settings', [{ col: 'client_id' }]), byClient('offer_sheets'),
    byClient('settlements'), byClient('artist_profiles', [{ col: 'client_id' }]), byClient('artist_accounts', [{ col: 'platform' }, { col: 'id' }]),
    byClient('tasks'), byClient('agenda_points', [{ col: 'position' }, { col: 'created_at' }, { col: 'id' }]), byClient('show_deals', [{ col: 'show_id' }]),
  ])

  // What hangs off those (a release's tracks, an invoice's lines, a show's advance...).
  const [tracks, checklistItems, stakeholders, lineItems, showAdvances, guestListEntries, flightLegs, travelItemShows, expenseShows, settlementShows] = await Promise.all([
    children('tracks', 'album_id', albums), children('checklist_items', 'album_id', albums), children('release_stakeholders', 'album_id', albums),
    children('invoice_line_items', 'invoice_id', invoices), children('show_advances', 'show_id', shows), children('guest_list_entries', 'show_id', shows),
    children('flight_legs', 'travel_item_id', travelItems, id, [{ col: 'travel_item_id' }, { col: 'leg_order' }, { col: 'id' }]),
    children('travel_item_shows', 'travel_item_id', travelItems, id, [{ col: 'travel_item_id' }, { col: 'show_id' }]),
    children('expense_shows', 'expense_id', expenses, id, [{ col: 'expense_id' }, { col: 'show_id' }]),
    children('settlement_shows', 'settlement_id', settlements, id, [{ col: 'settlement_id' }, { col: 'show_id' }]),
  ])
  const [advanceContacts, trackRounds, trackCredits] = await Promise.all([
    children('advance_contacts', 'advance_id', showAdvances),
    children('track_rounds', 'track_id', tracks, id, [{ col: 'sort_order' }, { col: 'id' }]),
    children('track_credits', 'track_id', tracks, id, [{ col: 'sort_order' }, { col: 'id' }]),
  ])
  const trackNotes = await children('track_notes', 'round_id', trackRounds, id, [{ col: 'timestamp' }, { col: 'id' }])
  const trackNoteReplies = await children('track_note_replies', 'note_id', trackNotes, id, [{ col: 'created_at' }, { col: 'id' }])

  // Every table the screen's loader reads must be here: a missing one is a compile error, not a quietly empty list.
  const rows: WorkspaceRows = {
    clientRows, albums: q(albums), tracks: q(tracks), shows: q(shows), posts: q(posts), royaltyStreams: q(royaltyStreams), deposits: q(deposits),
    catalogWorks: q(catalogWorks), projects: q(projects), artistTodos: q(artistTodos), tourOffers: q(tourOffers), contracts: q(contracts),
    invoices: q(invoices), lineItems: q(lineItems), expenses: q(expenses), plMonths: q(plMonths), checklistItems: q(checklistItems),
    stakeholders: q(stakeholders), crewMembers: q(crewMembers), showAdvances: q(showAdvances), advanceContacts: q(advanceContacts),
    guestListEntries: q(guestListEntries), travelItems: q(travelItems), flightLegs: q(flightLegs), travelItemShows: q(travelItemShows),
    people: q(people), bankAccounts: q(bankAccounts), bankTransactions: q(bankTransactions), trackRounds: q(trackRounds), trackNotes: q(trackNotes),
    trackNoteReplies: q(trackNoteReplies), trackCredits: q(trackCredits), venues: q(venues), vendors: q(vendors), runsQ: q(runs), budgetsQ: q(budgets),
    crewRatesQ: q(crewRates), financeSettingsQ: q(financeSettings), expenseShowsQ: q(expenseShows), offerSheetsQ: q(offerSheets),
    settlementsQ: q(settlements), settlementShowsQ: q(settlementShows), profilesQ: q(profiles), accountsQ: q(accounts), tasksQ: q(tasks),
    agendaQ: q(agenda), showDealsQ: q(showDeals),
  }
  return assembleWorkspace(rows)
}
