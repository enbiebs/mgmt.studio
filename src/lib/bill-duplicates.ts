// ──────────────────────────────────────────────────────────
//  "Do we already have this bill?" Paying the same bill twice is the commonest money mistake in an office, so when a bill is about to be
//  saved it is compared with the ones already on file. Pure logic (no store, no screen), covered by scripts/check-bill-duplicates.ts.
//  It only ever warns; the person decides. A match is the same vendor AND either the same bill number, or the same amount a few days apart.
// ──────────────────────────────────────────────────────────

import type { Expense } from '@/types'
import { normalizeVendorName } from '@/lib/vendors'
import { r2 } from '@/lib/money'
import { daysUntil } from '@/lib/date-state'

/** Bills this many days apart (or fewer) with the same amount are probably the same bill. */
export const SAME_BILL_DAYS = 7

export interface BillCandidate { vendor: string; vendorId?: string; billNumber?: string; amount: number; currency: string; date?: string }
export type DuplicateWhy = 'same-number' | 'same-amount'
export interface DuplicateBill { bill: Expense; why: DuplicateWhy }

const FIRMS = /\b(inc|llc|ltd|limited|co|corp|corporation|gmbh|plc|bv|sas)\b/g
const sameVendor = (a: { vendor: string; vendorId?: string }, b: { vendor: string; vendorId?: string }) => {
  if (a.vendorId && b.vendorId) return a.vendorId === b.vendorId
  const name = (v: string) => normalizeVendorName(v).replace(FIRMS, ' ').replace(/\s+/g, ' ').trim()
  return name(a.vendor) !== '' && name(a.vendor) === name(b.vendor)
}
/** "No. 0042", "#42" and "42" are the same number; "" is no number at all. */
const numberOf = (s?: string) => (s ?? '').toLowerCase().replace(/\b(invoice|inv|bill|no|number)\b/g, ' ').replace(/[^a-z0-9]/g, '').replace(/(?<![0-9])0+(?=[0-9])/g, '')
const dayGap = (a: string, b: string) => Math.abs(daysUntil(a, b))

/** Bills already on file that look like this one, the surest first. `selfId` leaves out the bill being edited. */
export function findDuplicateBills(existing: readonly Expense[], c: BillCandidate, selfId?: string): DuplicateBill[] {
  const out: DuplicateBill[] = []
  const number = numberOf(c.billNumber)
  for (const bill of existing) {
    if (bill.id === selfId || !sameVendor(bill, c)) continue
    if (number && numberOf(bill.billNumber) === number) { out.push({ bill, why: 'same-number' }); continue }
    if (number && numberOf(bill.billNumber) && numberOf(bill.billNumber) !== number) continue   // two different bill numbers: a flat weekly bill is not a duplicate
    if (r2(bill.amount) === r2(c.amount) && bill.currency === c.currency && c.amount > 0 && (!c.date || !bill.date || dayGap(c.date, bill.date) <= SAME_BILL_DAYS)) out.push({ bill, why: 'same-amount' })
  }
  return out.sort((a, b) => (a.why === b.why ? 0 : a.why === 'same-number' ? -1 : 1))
}
