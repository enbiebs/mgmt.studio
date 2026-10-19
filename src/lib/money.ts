// ──────────────────────────────────────────────────────────
//  The small money sums every screen shares, written once so two screens can never disagree about the same figure:
//    - an invoice's total,
//    - adding amounts up PER CURRENCY (never across currencies),
//    - how a deposit is divided up.
//  Pure arithmetic (no store, no screen), covered by scripts/check-money.ts.
// ──────────────────────────────────────────────────────────

import type { Invoice } from '@/types'

/** Round to the cent, so float noise (0.1 × 3) never shows up as a figure. */
export const r2 = (n: number) => Math.round(n * 100) / 100

/** An invoice's total: quantity × rate for each line, to the cent. */
export const invoiceTotal = (inv: Pick<Invoice, 'items'>): number =>
  r2(inv.items.reduce((sum, i) => sum + i.quantity * i.rate, 0))

/** Adds amounts up for each currency separately. Dollars, pounds and euros are never added together. */
export function sumByCurrency<T>(items: readonly T[], amount: (item: T) => number, currency: (item: T) => string): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const item of items) {
    const cur = currency(item)
    totals[cur] = (totals[cur] ?? 0) + amount(item)
  }
  for (const cur of Object.keys(totals)) totals[cur] = r2(totals[cur])
  return totals
}

export interface DepositSplit { mgmt: number; lawyer: number; taxes: number; stays: number }

/**
 * How a deposit divides up: each share is its fraction of the amount (a fraction is 0.10 for 10%), rounded to a whole unit, and what
 * is left stays in the operating account. The four always add back up to the amount.
 */
export function splitDeposit(amount: number, shares: { mgmt: number; lawyer: number; taxes: number }): DepositSplit {
  const mgmt = Math.round(amount * shares.mgmt)
  const lawyer = Math.round(amount * shares.lawyer)
  const taxes = Math.round(amount * shares.taxes)
  return { mgmt, lawyer, taxes, stays: amount - mgmt - lawyer - taxes }
}
