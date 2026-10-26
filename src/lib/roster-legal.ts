// ──────────────────────────────────────────────────────────
//  "All artists" → Legal: every contract across the artists a person can open, with the date it ends, in one list.
//  What state a contract is in comes from lib/contract-status.ts (the same rules the artist's own Legal page uses, so a
//  contract can never be "expiring" here and "signed" there). What this adds is who may see it: a person sent a single
//  contract sees that contract and nothing worked out from it (a count would look like the artist's whole picture), and an
//  artist's own login never gets this management view. A practice (demo) artist is listed but never counted.
//  Pure logic (no store, no screen), covered by scripts/check-roster-legal.ts.
// ──────────────────────────────────────────────────────────

import type { Client, ContractStatus, ContractType, Currency, LegalSub, MainSection, UserRole } from '@/types'
import { contractAlerts, daysToExpiry, effectiveStatus, expiryLine, type ContractDisplayStatus } from '@/lib/contract-status'

/** What this person may do with ONE artist's contracts. */
export interface LegalAccess {
  open: boolean   // may open the Legal page at all (a single shared contract is enough)
  full: boolean   // may open the WHOLE Legal page: only then is anything counted from this artist's contracts
}

export function legalAccessFor(
  has: (section: MainSection, clientId: string) => boolean,
  shareOnly: (section: MainSection, clientId: string) => boolean,
  clientId: string,
  role: UserRole,
): LegalAccess {
  if (role === 'artist') return { open: false, full: false }
  const open = has('legal', clientId)
  return { open, full: open && !shareOnly('legal', clientId) }
}

export interface ContractRow {
  clientId: string; clientName: string; clientColor: string
  demo: boolean                                  // a practice artist: listed, but never counted
  full: boolean                                  // the artist's whole Legal page is open to this person
  contractId: string; title: string; counterparty: string
  type: ContractType
  state: ContractDisplayStatus                   // today's state: a signed contract past its end date is Expired
  flagged: boolean                               // the attorney asked for a look
  attention: boolean                             // flagged, expiring or expired
  live: boolean                                  // signed (and maybe ending or ended): the end date is a real end. A draft's or a terminated contract's date is not shown or sorted as one
  days: number | null                            // days until it ends (negative once it has), null with no end date or when not live
  endLine: string | null                         // "Expires Dec 1, 2026 (in 41 days)"; null with no end date or when not live
  value?: { amount: number; currency: Currency }
  sub: LegalSub                                  // the tab on the artist's Legal page where it is worked on
}

export interface RosterLegalInput { client: Client; access: LegalAccess }

const PENDING: readonly ContractStatus[] = ['draft', 'review', 'negotiation']

/** Where opening a contract goes: someone with only shared contracts has the pipeline and nothing else; otherwise the page that deals with its state. */
function subFor(full: boolean, attention: boolean, state: ContractDisplayStatus): LegalSub {
  if (!full) return 'pipeline'
  if (attention) return 'alerts'
  return PENDING.includes(state as ContractStatus) ? 'pipeline' : 'register'
}

/** Needs attention first (expired, then ending soonest, then flagged ones with no date), then the rest by end date; ended-for-good last. */
function order(a: ContractRow, b: ContractRow): number {
  const rank = (r: ContractRow) => (r.attention ? 0 : r.state === 'terminated' ? 2 : 1)
  const day = (r: ContractRow) => r.days ?? Number.POSITIVE_INFINITY
  return rank(a) - rank(b) || (day(a) === day(b) ? 0 : day(a) < day(b) ? -1 : 1) || a.clientName.localeCompare(b.clientName) || a.title.localeCompare(b.title) || a.contractId.localeCompare(b.contractId)
}

export function buildRosterLegal(inputs: readonly RosterLegalInput[], today: string): ContractRow[] {
  const rows: ContractRow[] = []
  for (const { client, access } of inputs) {
    if (!access.open) continue
    for (const c of client.legal?.contracts ?? []) {
      const state = effectiveStatus(c, today)
      const attention = contractAlerts([c], today).count > 0
      const live = state === 'signed' || state === 'expiring' || state === 'expired'
      rows.push({
        clientId: client.id, clientName: client.name, clientColor: client.color, demo: !!client.isDemo, full: access.full,
        contractId: c.id, title: c.title, counterparty: c.counterparty, type: c.type,
        state, flagged: !!c.flagged, attention, live,
        days: live ? daysToExpiry(c, today) : null, endLine: live ? expiryLine(c, today) : null,
        ...(c.value ? { value: { amount: c.value, currency: c.currency ?? 'USD' } } : {}),
        sub: subFor(access.full, attention, state),
      })
    }
  }
  return rows.sort(order)
}

export type LegalFilter = 'attention' | 'progress' | 'signed' | 'all'

/** One kind of contract, for one artist or all. "Signed" includes the ones about to expire; an expired or terminated one shows under Needs attention (if expired) or Everything. */
export function filterContracts(rows: readonly ContractRow[], opts: { filter: LegalFilter; clientId?: string }): ContractRow[] {
  return rows.filter(r => (!opts.clientId || r.clientId === opts.clientId) && (
    opts.filter === 'all' ? true
      : opts.filter === 'attention' ? r.attention
        : opts.filter === 'progress' ? PENDING.includes(r.state as ContractStatus)
          : r.state === 'signed' || r.state === 'expiring'))
}

export interface LegalStats {
  attention: number     // contracts needing a look: flagged, expiring or expired, each counted once
  expiring: number      // ending within 90 days
  expired: number       // already ended
  inProgress: number    // draft, in review or being negotiated
}

/** The numbers at the top. Counted only from artists whose whole Legal page is open to this person, and never from a practice artist. */
export function legalStats(rows: readonly ContractRow[]): LegalStats {
  const counted = rows.filter(r => r.full && !r.demo)
  return {
    attention: counted.filter(r => r.attention).length,
    expiring: counted.filter(r => r.state === 'expiring').length,
    expired: counted.filter(r => r.state === 'expired').length,
    inProgress: counted.filter(r => PENDING.includes(r.state as ContractStatus)).length,
  }
}

/** Where the page opens: on what needs a look when there is something to count, otherwise on everything. */
export function defaultFilter(counts: boolean, stats: LegalStats): LegalFilter {
  return counts && stats.attention > 0 ? 'attention' : 'all'
}

/** What the page can offer this person across all their artists: the list, and the numbers on top. */
export function legalCapabilities(access: readonly LegalAccess[]): { list: boolean; counts: boolean } {
  return { list: access.some(a => a.open), counts: access.some(a => a.full) }
}
