// ──────────────────────────────────────────────────────────
//  The dates that matter in a contract, worked out from what was entered: when the current term ends (an automatically renewing
//  contract rolls forward by itself, so it never "expires" while it renews) and the NOTICE date, the last day to tell the other side
//  that it should not renew or should end. Missing that date is how a 60-day-notice contract renews for another year, so it is the
//  date worth an alert. Pure logic (no store, no screen), covered by scripts/check-contract-dates.ts.
// ──────────────────────────────────────────────────────────

import type { Contract } from '@/types'
import { daysUntil } from '@/lib/date-state'
import { addDays } from '@/lib/utils'

/** How long an automatic renewal runs when the contract does not say. */
export const DEFAULT_RENEWAL_MONTHS = 12
/** A notice date this close needs attention. */
export const NOTICE_WARN_DAYS = 30
/** After the notice date has passed on a contract that renews by itself, it is worth saying so for this long (it will renew); after that it is just a fact. */
export const NOTICE_PASSED_DAYS = 14

type Dated = Pick<Contract, 'status' | 'expiryDate' | 'autoRenews' | 'renewalMonths'>
type Noticed = Dated & Pick<Contract, 'noticeDays'>

export const dateWord = (iso: string) => new Date(iso.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`

/** A date some months later: the same day of the month, or the last day of a shorter month (Jan 31 + 1 month = Feb 28). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number)
  const index = y * 12 + (m - 1) + months
  const year = Math.floor(index / 12)
  const month = (index % 12 + 12) % 12
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
}

const rolls = (c: Dated) => !!c.autoRenews && c.status === 'signed'
const stepMonths = (c: Dated) => (c.renewalMonths && c.renewalMonths > 0 ? c.renewalMonths : DEFAULT_RENEWAL_MONTHS)

/**
 * When the term in force ends. A signed contract that renews by itself rolls forward from its first end date, one renewal at a time,
 * until the end is today or later; any other contract just has the end date it was given.
 */
export function currentTermEnd(c: Dated, today: string): string | null {
  if (!c.expiryDate) return null
  const first = c.expiryDate.slice(0, 10)
  if (!rolls(c)) return first
  const step = stepMonths(c)
  let k = 0
  let end = first
  while (end < today && k < 1200) { k++; end = addMonths(first, k * step) }
  return end
}

/** How many times a contract that renews by itself has renewed since its first end date. */
export function renewalsSoFar(c: Dated, today: string): number {
  if (!c.expiryDate || !rolls(c)) return 0
  const first = c.expiryDate.slice(0, 10)
  const step = stepMonths(c)
  let k = 0
  while (addMonths(first, k * step) < today && k < 1200) k++
  return k
}

export interface NoticeInfo {
  deadline: string     // the last day to give notice
  daysLeft: number     // from today to the deadline (negative once it has passed)
  passed: boolean
  termEnd: string      // the term this notice is about
  autoRenews: boolean
}

/** The notice date for the term in force, or null when it has no notice period (or is not signed). */
export function noticeInfo(c: Noticed, today: string): NoticeInfo | null {
  if (c.status !== 'signed' || c.noticeDays === undefined || c.noticeDays === null || c.noticeDays < 0) return null
  const termEnd = currentTermEnd(c, today)
  if (!termEnd) return null
  const deadline = addDays(termEnd, -c.noticeDays)
  const daysLeft = daysUntil(deadline, today)
  return { deadline, daysLeft, passed: daysLeft < 0, termEnd, autoRenews: !!c.autoRenews }
}

/** The length of one term of a contract that renews by itself, in days (about). */
const termDays = (c: Dated) => stepMonths(c) * 30

/**
 * Is there something to do about the notice date? Yes when it is within a month. On a contract that renews by itself, also for two
 * weeks after it has passed (it is going to renew: worth knowing, then quiet), unless the notice period is about as long as the term
 * itself (month to month with 30 days' notice), where the date is always "just passed" and saying so would never stop. A fixed-term
 * contract whose notice date has passed has nothing left to act on, and one that has ended has no notice date at all.
 */
export function noticeNeedsAction(c: Noticed, today: string): boolean {
  const n = noticeInfo(c, today)
  if (!n || n.termEnd < today) return false
  if (n.daysLeft >= 0) return n.daysLeft <= NOTICE_WARN_DAYS
  return n.autoRenews && -n.daysLeft <= NOTICE_PASSED_DAYS && termDays(c) > (c.noticeDays ?? 0) + NOTICE_PASSED_DAYS
}

/**
 * A contract that renews by itself but has no notice period written down: we cannot say when the last day to stop it is, but we can
 * say that it is about to renew. Within a month of the renewal.
 */
export function renewalWatch(c: Noticed, today: string): { termEnd: string; daysLeft: number } | null {
  if (c.status !== 'signed' || !c.autoRenews || (c.noticeDays !== undefined && c.noticeDays !== null)) return null
  const termEnd = currentTermEnd(c, today)
  if (!termEnd) return null
  const daysLeft = daysUntil(termEnd, today)
  return daysLeft <= NOTICE_WARN_DAYS ? { termEnd, daysLeft } : null   // (a term that renews by itself never ends before today: currentTermEnd rolls it forward)
}

/** The date to act on, if there is one now: the notice date, or (with no notice period known) the renewal itself. */
export function dateToAct(c: Noticed, today: string): { date: string; daysLeft: number; passed: boolean; renewalOnly: boolean } | null {
  if (noticeNeedsAction(c, today)) {
    const n = noticeInfo(c, today)!
    return { date: n.deadline, daysLeft: n.daysLeft, passed: n.passed, renewalOnly: false }
  }
  const w = renewalWatch(c, today)
  return w ? { date: w.termEnd, daysLeft: w.daysLeft, passed: false, renewalOnly: true } : null
}

/** "Give notice by Nov 2, 2026 (in 12 days)" / "The notice date (Nov 2, 2026) has passed. It renews Jan 1, 2027." / "Renews Jan 1, 2027 (in 12 days). Add its notice period to be warned earlier." */
export function noticeLine(c: Noticed, today: string): string | null {
  const w = renewalWatch(c, today)
  if (w) return w.daysLeft === 0 ? `Renews today, ${dateWord(w.termEnd)}. Add its notice period to be warned earlier.` : `Renews ${dateWord(w.termEnd)} (in ${days(w.daysLeft)}). Add its notice period to be warned earlier.`
  const n = noticeInfo(c, today)
  if (!n) return null
  if (n.daysLeft > 0) return `Give notice by ${dateWord(n.deadline)} (in ${days(n.daysLeft)})`
  if (n.daysLeft === 0) return `Give notice today, ${dateWord(n.deadline)}`
  return n.autoRenews && n.termEnd >= today
    ? `The notice date (${dateWord(n.deadline)}) has passed. It renews ${dateWord(n.termEnd)}.`
    : `Notice was due ${dateWord(n.deadline)}`
}
