// ──────────────────────────────────────────────────────────
//  Activity log — turning the database's entries ("show, update, {venue: [A, B]}") into
//  sentences a person reads: "You changed the guarantee on Fabric · London from 8,000 to 9,500".
//  The entries themselves are written by the database (migration 035); this only words them.
// ──────────────────────────────────────────────────────────

export type ActivityEntityType = 'show' | 'show_deal' | 'offer' | 'offer_sheet' | 'budget' | 'settlement' | 'invoice' | 'expense' | 'contract'

export interface ActivityEntry {
  id: string
  created_at: string
  client_id: string
  actor_id: string | null
  actor_label: string
  section: string
  entity_type: ActivityEntityType
  entity_id: string
  action: 'create' | 'update' | 'delete'
  title: string | null
  changes: Record<string, unknown>
  count: number
  titles: string[]
}

const NOUN: Record<ActivityEntityType, [string, string]> = {
  show: ['show', 'shows'], show_deal: ['fees for', 'fees for'], offer: ['offer', 'offers'], offer_sheet: ['offer sheet', 'offer sheets'],
  budget: ['budget', 'budgets'], settlement: ['settlement', 'settlements'], invoice: ['invoice', 'invoices'],
  expense: ['bill', 'bills'], contract: ['contract', 'contracts'],
}

// The groups on the filter bar.
export const ACTIVITY_GROUPS: { key: string; label: string; types: ActivityEntityType[] }[] = [
  { key: 'tour', label: 'Shows', types: ['show'] },
  { key: 'deals', label: 'Offers & fees', types: ['offer', 'offer_sheet', 'show_deal'] },
  { key: 'money', label: 'Money', types: ['budget', 'settlement', 'invoice', 'expense'] },
  { key: 'legal', label: 'Contracts', types: ['contract'] },
]

// What each column is called out loud. Anything not listed is shown as its own name with spaces.
const FIELD: Record<string, string> = {
  venue: 'venue', city: 'city', country: 'country', date: 'date', time: 'set time', status: 'status', notes: 'notes',
  guarantee: 'guarantee', deposit: 'deposit', currency: 'currency', door: 'door split', buyout: 'buyout',
  promoter: 'promoter', via_agency: 'agency booking', agency_name: 'agency', agency_commission_pct: 'agency commission',
  management_commission_pct: 'management commission', history_only: 'history-only marker', invoice_id: 'invoice link',
  run_id: 'run', tour_offer_id: 'offer link', show_id: 'show link', settled_at: 'settled date', net_payout: 'net payout',
  terms: 'deal terms', name: 'name', lines: 'budget lines', commissions: 'commissions', original: 'locked original',
  locked_at: 'lock date', version: 'version', number: 'invoice number', to_name: 'billed to', to_email: 'billing email',
  category: 'category', issued_date: 'issue date', due_date: 'due date', paid_date: 'paid date', paid: 'paid',
  vendor: 'vendor', amount: 'amount', description: 'description', bill_number: 'bill number', bucket: 'budget line',
  title: 'title', type: 'type', counterparty: 'counterparty', value: 'value', signed_date: 'signed date',
  expiry_date: 'expiry date', flagged: 'flag', payments: 'payments', total_due: 'total due', balance_due: 'balance due',
  drive_url: 'folder link', event_name: 'event', prepared_on: 'statement date', payout: 'payout', summary: 'summary', deal: 'deal', fx: 'exchange rates',
  auto_renews: 'automatic renewal', renewal_months: 'renewal length (months)', notice_days: 'notice period (days)', files: 'attached files',
  response_note: 'artist\'s note', responded_at: 'answer date', message: 'message', detail: 'detail level',
}
// Behind-the-scenes links and copies: recorded, but meaningless to read ("set the show link to show-x5coe98").
const HIDDEN = new Set(['show_id', 'tour_offer_id', 'invoice_id', 'run_id', 'original', 'vendor_id', 'bill_file_path', 'file_path', 'vendor_flags', 'offer_id'])
const MONEY = new Set(['guarantee', 'deposit', 'buyout', 'net_payout', 'amount', 'value', 'total_due', 'balance_due'])
const PCT = new Set(['door', 'agency_commission_pct', 'management_commission_pct'])
const DATE = new Set(['date', 'settled_at', 'issued_date', 'due_date', 'paid_date', 'signed_date', 'expiry_date', 'prepared_on'])

const TERM_KEYS: Record<string, string> = {
  capacity: 'capacity', ageLimit: 'age limit', venueType: 'venue type', billing: 'billing', doors: 'doors', setStart: 'set start',
  setLengthMin: 'set length', bonuses: 'bonuses', groundTransport: 'ground transport', hotel: 'hotel', airfare: 'airfare',
  merchArtistPct: 'merch split', merchSoldBy: 'merch seller', production: 'production', hospitality: 'hospitality',
  payments: 'payment schedule', radiusMiles: 'radius clause', radiusDaysAfter: 'radius days', routingNotes: 'routing notes',
  alternativeDates: 'alternative dates', respondBy: 'reply-by date',
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const humanize = (k: string) => k.replace(/_/g, ' ')
const fieldName = (k: string) => FIELD[k] ?? humanize(k)

function dateText(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

export function valueText(field: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return 'empty'
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  if (typeof v === 'number') {
    const n = v.toLocaleString('en-US', { maximumFractionDigits: 2 })
    return PCT.has(field) ? `${n}%` : n
  }
  if (typeof v === 'string') {
    if (DATE.has(field) || /^\d{4}-\d{2}-\d{2}$/.test(v)) return dateText(v)
    if (field === 'status' || field === 'currency' || field === 'category' || field === 'type') return field === 'currency' ? v : cap(v.replace(/_/g, ' '))
    return v
  }
  return String(v)
}

// One changed field, in words.
function describeChange(field: string, change: unknown): string {
  const name = fieldName(field)
  if (Array.isArray(change)) {
    const [from, to] = change
    if (field === 'paid') return to ? 'marked it paid' : 'marked it unpaid'
    if (field === 'drive_url') return to ? 'linked a folder' : 'removed the folder link'
    if (field === 'history_only') return to ? 'kept it as history only' : 'took it out of history'
    if (field === 'via_agency') return to ? 'marked it as booked through an agency' : 'marked it as booked direct'
    if (field === 'locked_at') return to ? 'locked the budget\'s Original' : 'unlocked the budget'
    if (field === 'flagged') return to ? 'flagged it for review' : 'cleared the review flag'
    if (field === 'auto_renews') return to ? 'set it to renew automatically' : 'turned off automatic renewal'
    if (to === null || to === '' || to === undefined) return `cleared the ${name} (was ${valueText(field, from)})`
    if (from === null || from === '' || from === undefined) return `set the ${name} to ${valueText(field, to)}`
    if (MONEY.has(field) || field === 'status' || DATE.has(field) || typeof to === 'number') return `changed the ${name} from ${valueText(field, from)} to ${valueText(field, to)}`
    return `changed the ${name} to ${valueText(field, to)}`
  }
  if (change && typeof change === 'object') {
    const c = change as { keys?: string[]; array?: boolean; from?: number; to?: number }
    if (c.array) {
      if (field === 'lines') return c.from === c.to ? 'edited budget lines' : `changed budget lines (${c.from} to ${c.to} lines)`
      if (field === 'payments') return (c.to ?? 0) > (c.from ?? 0) ? 'recorded a payment' : 'changed the payments'
      return `changed the ${name} (${c.from} to ${c.to})`
    }
    if (c.keys) {
      const names = c.keys.map(k => (field === 'terms' ? TERM_KEYS[k] ?? humanize(k) : humanize(k)))
      return names.length > 0 ? `changed the ${name}: ${names.slice(0, 4).join(', ')}${names.length > 4 ? ` and ${names.length - 4} more` : ''}` : `changed the ${name}`
    }
  }
  return `changed the ${name}`
}

export interface ActivityText { headline: string; details: string[] }

/** How an entry reads, e.g. { headline: 'changed the offer Fabric · London', details: ['changed the guarantee from 8,000 to 9,500'] }. */
export function describeEntry(e: ActivityEntry): ActivityText {
  const [one, many] = NOUN[e.entity_type] ?? [e.entity_type, `${e.entity_type}s`]
  const subject = e.title ? ` ${e.title}` : ''
  if (e.action === 'create') {
    if (e.count > 1) return { headline: `added ${e.count} ${many}`, details: e.titles.length > 0 ? [e.titles.join('; ') + (e.count > e.titles.length ? `; and ${e.count - e.titles.length} more` : '')] : [] }
    if (e.entity_type === 'offer_sheet') return { headline: `sent offer sheet${subject.replace(/^ V/, ' V')}`, details: [] }
    return { headline: `added the ${one}${subject}`, details: [] }
  }
  if (e.action === 'delete') {
    if (e.count > 1) return { headline: `removed ${e.count} ${many}`, details: e.titles.length > 0 ? [e.titles.join('; ')] : [] }
    return { headline: `removed the ${one}${subject}`, details: [] }
  }
  const details = Object.entries(e.changes).filter(([k]) => !HIDDEN.has(k)).map(([k, v]) => describeChange(k, v))
  // an offer sheet's status is the artist answering
  if (e.entity_type === 'offer_sheet' && Array.isArray(e.changes.status)) {
    const to = String((e.changes.status as unknown[])[1])
    const verb = to === 'approved' ? 'approved' : to === 'passed' ? 'passed on' : to === 'withdrawn' ? 'withdrew' : to === 'superseded' ? 'replaced' : `marked ${to}`
    return { headline: `${verb} offer sheet${subject}`, details: [] }
  }
  return { headline: `changed the ${one}${subject}`, details }
}

/** "You", or a short name: "eli@notedmanagement.com" -> "eli". */
export function actorName(e: ActivityEntry, myId: string | null): string {
  if (myId && e.actor_id === myId) return 'You'
  const l = e.actor_label
  return l.includes('@') ? l.split('@')[0] : l
}
