// ──────────────────────────────────────────────────────────
//  What state a contract is really in today. The stored status says what someone last set ("signed"); the
//  expiry date says what is true now. A signed contract past its expiry date is Expired, never plain Signed, and
//  one that ends within 90 days is Expiring. Worked out from the date every time, so nothing has to be updated by
//  hand and a note typed into the contract can never override the structured date. Pure logic (no store, no screen).
//
//  Not here yet: "In renewal". That needs a way to say which newer contract replaces this one, which arrives with
//  the structured contract fields.
// ──────────────────────────────────────────────────────────

import type { Contract, ContractStatus } from '@/types'
import { daysUntil } from '@/lib/date-state'

/** A signed contract ending within this many days is "expiring". */
export const EXPIRING_DAYS = 90

export type ContractDisplayStatus = ContractStatus | 'expiring'
type Dated = Pick<Contract, 'status' | 'expiryDate'>

/** Days from today until the contract ends. Negative once it has ended, null when no end date is recorded. */
export function daysToExpiry(c: Pick<Contract, 'expiryDate'>, today: string): number | null {
  return c.expiryDate ? daysUntil(c.expiryDate, today) : null
}

/** The status to show and to alert on. Only a signed contract expires: a draft with an old end date is still a draft. */
export function effectiveStatus(c: Dated, today: string): ContractDisplayStatus {
  if (c.status !== 'signed') return c.status
  const d = daysToExpiry(c, today)
  if (d === null) return 'signed'
  if (d < 0) return 'expired'
  return d <= EXPIRING_DAYS ? 'expiring' : 'signed'
}

const dateWord = (iso: string) => new Date(iso.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`

/** "Expires Oct 1, 2026 (in 12 days)" / "Expired Oct 1, 2026 (18 days ago)". The structured date, in words, for every screen. */
export function expiryLine(c: Pick<Contract, 'expiryDate'>, today: string): string | null {
  const d = daysToExpiry(c, today)
  if (d === null || !c.expiryDate) return null
  if (d === 0) return `Expires today, ${dateWord(c.expiryDate)}`
  return d > 0 ? `Expires ${dateWord(c.expiryDate)} (in ${days(d)})` : `Expired ${dateWord(c.expiryDate)} (${days(-d)} ago)`
}

export interface ContractAlerts<T> {
  flagged: T[]
  expiring: T[]      // soonest first
  expired: T[]       // longest overdue first
  count: number      // contracts needing attention, each counted once even if it is flagged AND expiring
}

export function contractAlerts<T extends Contract>(contracts: T[], today: string): ContractAlerts<T> {
  const byExpiry = (a: T, b: T) => (a.expiryDate ?? '').localeCompare(b.expiryDate ?? '')
  const flagged = contracts.filter(c => c.flagged)
  const expiring = contracts.filter(c => effectiveStatus(c, today) === 'expiring').sort(byExpiry)
  const expired = contracts.filter(c => effectiveStatus(c, today) === 'expired').sort(byExpiry)
  const count = new Set([...flagged, ...expiring, ...expired].map(c => c.id)).size
  return { flagged, expiring, expired, count }
}
