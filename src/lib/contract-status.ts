// ──────────────────────────────────────────────────────────
//  What state a contract is really in today. The stored status says what someone last set ("signed"); the
//  expiry date says what is true now. A signed contract past its expiry date is Expired, never plain Signed, and
//  one that ends within 90 days is Expiring. Worked out from the date every time, so nothing has to be updated by
//  hand and a note typed into the contract can never override the structured date. Pure logic (no store, no screen).
//
//  A contract that renews by itself (autoRenews) never "expires" while it renews: its end rolls forward (lib/contract-dates.ts)
//  and what needs watching is the notice date. "In renewal" (a newer contract replacing this one) is not here yet.
// ──────────────────────────────────────────────────────────

import type { Contract, ContractStatus } from '@/types'
import { daysUntil } from '@/lib/date-state'
import { currentTermEnd, dateToAct, dateWord } from '@/lib/contract-dates'

/** A signed contract ending within this many days is "expiring". */
export const EXPIRING_DAYS = 90

export type ContractDisplayStatus = ContractStatus | 'expiring'
type Dated = Pick<Contract, 'status' | 'expiryDate' | 'autoRenews' | 'renewalMonths'>

/** Days from today until the term in force ends. Negative once it has ended, null when no end date is recorded. A contract that renews by itself counts to its next renewal. */
export function daysToExpiry(c: Dated, today: string): number | null {
  const end = currentTermEnd(c, today)
  return end ? daysUntil(end, today) : null
}

/** The status to show and to alert on. Only a signed contract expires: a draft with an old end date is still a draft. */
export function effectiveStatus(c: Dated, today: string): ContractDisplayStatus {
  if (c.status !== 'signed') return c.status
  if (c.autoRenews) return 'signed'   // it renews by itself, so it is neither ending nor expired: the notice date is what needs watching
  const d = daysToExpiry(c, today)
  if (d === null) return 'signed'
  if (d < 0) return 'expired'
  return d <= EXPIRING_DAYS ? 'expiring' : 'signed'
}

const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`

/** "Expires Oct 1, 2026 (in 12 days)" / "Expired Oct 1, 2026 (18 days ago)". The structured date, in words, for every screen. */
export function expiryLine(c: Dated, today: string): string | null {
  const end = currentTermEnd(c, today)
  const d = daysToExpiry(c, today)
  if (d === null || !end) return null
  if (c.status === 'signed' && c.autoRenews) return d === 0 ? `Renews today, ${dateWord(end)}` : `Renews ${dateWord(end)} (in ${days(d)})`
  if (d === 0) return `Expires today, ${dateWord(end)}`
  return d > 0 ? `Expires ${dateWord(end)} (in ${days(d)})` : `Expired ${dateWord(end)} (${days(-d)} ago)`
}

export interface ContractAlerts<T> {
  flagged: T[]
  notice: T[]        // the notice date is near (or has passed on one that renews by itself); earliest first
  expiring: T[]      // soonest first
  expired: T[]       // longest overdue first
  count: number      // contracts needing attention, each counted once even if it is flagged AND expiring
}

export function contractAlerts<T extends Contract>(contracts: T[], today: string): ContractAlerts<T> {
  const byExpiry = (a: T, b: T) => (a.expiryDate ?? '').localeCompare(b.expiryDate ?? '')
  const flagged = contracts.filter(c => c.flagged)
  const expiring = contracts.filter(c => effectiveStatus(c, today) === 'expiring').sort(byExpiry)
  const expired = contracts.filter(c => effectiveStatus(c, today) === 'expired').sort(byExpiry)
  const byNotice = (a: T, b: T) => (dateToAct(a, today)?.date ?? '').localeCompare(dateToAct(b, today)?.date ?? '')
  const notice = contracts.filter(c => dateToAct(c, today) !== null).sort(byNotice)
  const count = new Set([...flagged, ...notice, ...expiring, ...expired].map(c => c.id)).size
  return { flagged, notice, expiring, expired, count }
}
