// ──────────────────────────────────────────────────────────
//  The trash. When someone deletes a show, offer, invoice, bill, deposit or person, a complete copy is kept for 30 days: the item's
//  own row, every row the database removes along with it, the list of things that were merely unlinked from it, and the "who sees
//  what" rules it had. Restoring puts those rows back exactly as they were.
//
//  The deleting and the restoring are done INSIDE the database (supabase/tests/066_trash.sql): trash_delete keeps the copy and deletes
//  in one all-or-nothing step, with the item locked meanwhile, and checks the person's access itself, so it sees everything the delete
//  removes (not just what that person can read) and a copy can never be incomplete or exist for something that was not deleted.
//  THIS file is the single description of what each kind saves; the database function is given the same description (printed by
//  scripts/print-trash-spec.ts), and scripts/check-trash.ts fails if the two ever differ, while the test in supabase/tests/066_trash_test.sql
//  fails if the real foreign keys stop matching it.
//
//  Rules the database follows when putting things back:
//    - It never overwrites a row that already exists (it could undo later edits); it only fills in what is missing.
//    - A row that needs another row which is gone (a bill's link to a show that was since deleted) is left out, and said so.
//    - A link that is optional (a show's offer, a deal's invoice) is cleared when the other side is gone, and said so.
//    - Things that were only unlinked (deposits that pointed at an invoice) are linked back only if they still exist and are still unlinked.
//  Pure description (no network), covered by scripts/check-trash.ts.
// ──────────────────────────────────────────────────────────

export type TrashKind = 'show' | 'offer' | 'invoice' | 'bill' | 'deposit' | 'person'
/** The part of the app that decides who may see and restore an item. */
export type TrashSection = 'tour' | 'deals' | 'finance' | 'team' | 'music'

export const TRASH_DAYS = 30

/** Who can put a deleted item back, as far as the person reading the message is concerned. */
export type RestoreBy = 'you' | 'manager' | 'nobody'
/** What a delete box says about the trash: honest about who can undo it (a teammate without every part of the app a copy touches cannot see it). */
export const restoreNote = (by: RestoreBy, it: 'it' | 'them' = 'it'): string =>
  by === 'you' ? `You can restore ${it} from the Trash for ${TRASH_DAYS} days.`
  : by === 'manager' ? `A manager can restore ${it} from the Trash for ${TRASH_DAYS} days.`
  : 'This cannot be undone.'

export interface Need {
  /** The column that points at another row... */
  column: string
  /** ...in this table (always by its id). */
  table: string
  /** Gone: leave the whole row out, or keep the row and clear this link. */
  onMissing: 'skip' | 'clear'
  /** A column of that other row that says it now belongs to something else (a show's offer that has since been linked to another show):
   *  if it is filled in, the link is cleared too, so the two sides never disagree. */
  takenBy?: string
}

export interface ByRef { column: string; from: 'root' | string }
export interface ChildSpec {
  table: string
  /** The rows to save: those whose `column` equals the item's id ('root'), or equals an id from an earlier child table's rows.
   *  Several are allowed: a row found any of the ways is saved once. */
  by: ByRef | ByRef[]
  /** Only rows where this column is empty (isNull true) or filled (false). */
  filter?: { column: string; isNull: boolean }
  needs?: Need[]
}

export interface RelinkSpec {
  table: string
  /** The column that pointed at the item and was cleared by the delete. */
  column: string
  /** The rows to remember: those whose `by` column equals the item's id. */
  by: string
  /** The column that identifies one of those rows (usually id). */
  key: string
  filter?: { column: string; isNull: boolean }
}

export interface KindSpec {
  noun: string
  /** Edit access to this part of the app is needed to delete (and put back) the item. */
  section: TrashSection
  /** Every part of the app the saved copy touches. Only someone with ALL of them can see or restore it (the copy includes things like
   *  fee terms and crew rates that sit behind other parts of the app). */
  sections: TrashSection[]
  /** The kind of item the "who sees what" rules can hide, if any. */
  itemType?: 'show' | 'invoice' | 'expense'
  rootTable: string
  /** The item's own links to other rows. */
  rootNeeds: Need[]
  children: ChildSpec[]
  relinks: RelinkSpec[]
  /** Column of the item's row that names a stored file, kept until the item expires. */
  fileColumn?: string
}

// The order of `children` is the order rows are put back in: every table comes after the tables it points at.
export const SPECS: Record<TrashKind, KindSpec> = {
  show: {
    noun: 'Show', section: 'tour',
    sections: ['tour', 'deals', 'finance'], itemType: 'show', rootTable: 'shows',
    rootNeeds: [{ column: 'tour_offer_id', table: 'tour_offers', onMissing: 'clear', takenBy: 'show_id' }, { column: 'run_id', table: 'runs', onMissing: 'clear' }],
    children: [
      { table: 'show_advances', by: { column: 'show_id', from: 'root' } },
      { table: 'advance_contacts', by: { column: 'advance_id', from: 'show_advances' } },
      { table: 'guest_list_entries', by: { column: 'show_id', from: 'root' } },
      { table: 'show_deals', by: { column: 'show_id', from: 'root' }, needs: [{ column: 'invoice_id', table: 'invoices', onMissing: 'clear' }] },
      { table: 'travel_items', by: { column: 'show_id', from: 'root' }, needs: [{ column: 'run_id', table: 'runs', onMissing: 'clear' }] },
      { table: 'flight_legs', by: { column: 'travel_item_id', from: 'travel_items' } },
      { table: 'travel_item_shows', by: [{ column: 'show_id', from: 'root' }, { column: 'travel_item_id', from: 'travel_items' }], needs: [{ column: 'travel_item_id', table: 'travel_items', onMissing: 'skip' }] },
      { table: 'settlement_shows', by: { column: 'show_id', from: 'root' }, needs: [{ column: 'settlement_id', table: 'settlements', onMissing: 'skip' }] },
      { table: 'expense_shows', by: { column: 'show_id', from: 'root' }, needs: [{ column: 'expense_id', table: 'expenses', onMissing: 'skip' }] },
    ],
    relinks: [
      { table: 'budgets', column: 'show_id', by: 'show_id', key: 'id' },
      { table: 'tour_offers', column: 'show_id', by: 'show_id', key: 'id' },
    ],
  },
  offer: {
    noun: 'Offer', section: 'deals',
    sections: ['deals', 'finance', 'tour'], rootTable: 'tour_offers',
    rootNeeds: [{ column: 'show_id', table: 'shows', onMissing: 'clear', takenBy: 'tour_offer_id' }],
    children: [
      // A budget that has become a show's budget outlives the offer (the app unlinks it first), so only the offer's own budgets are saved.
      { table: 'budgets', by: { column: 'offer_id', from: 'root' }, filter: { column: 'show_id', isNull: true }, needs: [{ column: 'run_id', table: 'runs', onMissing: 'clear' }] },
      { table: 'offer_sheets', by: { column: 'offer_id', from: 'root' } },
    ],
    relinks: [
      { table: 'shows', column: 'tour_offer_id', by: 'tour_offer_id', key: 'id' },
      { table: 'budgets', column: 'offer_id', by: 'offer_id', key: 'id', filter: { column: 'show_id', isNull: false } },
    ],
  },
  invoice: {
    noun: 'Invoice', section: 'finance',
    sections: ['finance', 'deals'], itemType: 'invoice', rootTable: 'invoices', rootNeeds: [],
    children: [{ table: 'invoice_line_items', by: { column: 'invoice_id', from: 'root' } }],
    relinks: [
      { table: 'deposits', column: 'invoice_id', by: 'invoice_id', key: 'id' },
      { table: 'show_deals', column: 'invoice_id', by: 'invoice_id', key: 'show_id' },
      { table: 'bank_transactions', column: 'invoice_id', by: 'invoice_id', key: 'id' },
    ],
  },
  bill: {
    noun: 'Bill', section: 'finance',
    sections: ['finance', 'tour'], itemType: 'expense', rootTable: 'expenses',
    rootNeeds: [{ column: 'vendor_id', table: 'vendors', onMissing: 'clear' }, { column: 'run_id', table: 'runs', onMissing: 'clear' }],
    children: [{ table: 'expense_shows', by: { column: 'expense_id', from: 'root' }, needs: [{ column: 'show_id', table: 'shows', onMissing: 'skip' }] }],
    relinks: [], fileColumn: 'bill_file_path',
  },
  deposit: {
    noun: 'Deposit', section: 'finance',
    sections: ['finance'], rootTable: 'deposits',
    rootNeeds: [{ column: 'invoice_id', table: 'invoices', onMissing: 'clear' }], children: [], relinks: [],
  },
  person: {
    noun: 'Person', section: 'team',
    sections: ['team', 'tour', 'finance', 'music'], rootTable: 'people', rootNeeds: [],
    children: [
      { table: 'crew_members', by: { column: 'person_id', from: 'root' } },
      { table: 'crew_rates', by: { column: 'crew_member_id', from: 'crew_members' } },
      { table: 'release_stakeholders', by: { column: 'person_id', from: 'root' }, needs: [{ column: 'album_id', table: 'albums', onMissing: 'skip' }] },
    ],
    relinks: [
      { table: 'workspace_members', column: 'person_id', by: 'person_id', key: 'id' },
      { table: 'pending_invites', column: 'person_id', by: 'person_id', key: 'id' },
    ],
  },
}

/** What a table's rows are called in a sentence. */
export const TABLE_NOUN: Record<string, string> = {
  shows: 'show', tour_offers: 'offer', runs: 'run', invoices: 'invoice', expenses: 'bill', settlements: 'settlement', travel_items: 'booking',
  albums: 'release', vendors: 'vendor', budgets: 'budget', deposits: 'deposit', bank_transactions: 'bank transaction', workspace_members: 'login',
  pending_invites: 'invitation', show_deals: 'deal', show_advances: 'advance', advance_contacts: 'advance contact', guest_list_entries: 'guest',
  flight_legs: 'flight leg', travel_item_shows: 'booking link', expense_shows: 'bill link', settlement_shows: 'settlement link',
  crew_members: 'crew role', crew_rates: 'crew rate', release_stakeholders: 'release contact', invoice_line_items: 'invoice line', offer_sheets: 'offer sheet',
  people: 'person',
}

/** The column that identifies a row in a table, where it is not `id`. */
export const KEY_COLUMN: Record<string, string> = { show_deals: 'show_id', crew_rates: 'crew_member_id' }
export const keyOf = (table: string) => KEY_COLUMN[table] ?? 'id'

// ── Expiry ──
export const expiresAt = (deletedAt: string): string => new Date(new Date(deletedAt).getTime() + TRASH_DAYS * 86400000).toISOString()
export const isExpired = (expires: string, now: Date = new Date()): boolean => new Date(expires).getTime() <= now.getTime()
/** Whole days left, rounding up: an item with one hour left has "1 day left", never "0". */
export function daysLeft(expires: string, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((new Date(expires).getTime() - now.getTime()) / 86400000))
}
export const daysLeftText = (days: number): string => (days <= 0 ? 'Expires today' : days === 1 ? '1 day left' : `${days} days left`)

/** What the database function is told about every kind (printed into supabase/tests/066_trash.sql by scripts/print-trash-spec.ts). */
export function trashSpecJson() {
  return { kinds: SPECS, nouns: TABLE_NOUN, keys: KEY_COLUMN }
}

// ── Words ──
export const kindNoun = (kind: TrashKind): string => SPECS[kind].noun
/** The trash names the parts of the app by their database name; the screens call the songs part 'songs'. */
export const screenSectionOf = (s: TrashSection): 'songs' | Exclude<TrashSection, 'music'> => (s === 'music' ? 'songs' : s)
/**
 * Who could put a deleted item of this kind back, for one person: the database shows a copy only to someone who holds every part of the
 * app it touches, and lets them put it back with edit access to the item's own part. `holds` must mean a real grant (a single shared
 * item does not count). Nobody can without a database (no trash).
 */
export function restoreByFor(kind: TrashKind, hasDatabase: boolean, can: { holds: (section: TrashSection) => boolean; edits: (section: TrashSection) => boolean }): RestoreBy {
  if (!hasDatabase) return 'nobody'
  return SPECS[kind].sections.every(can.holds) && can.edits(SPECS[kind].section) ? 'you' : 'manager'
}
export const sectionOf = (kind: TrashKind): TrashSection => SPECS[kind].section
/** Every part of the app someone needs to open to see (and put back) a deleted item of this kind. */
export const sectionsOf = (kind: TrashKind): TrashSection[] => SPECS[kind].sections
