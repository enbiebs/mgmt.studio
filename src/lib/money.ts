// ──────────────────────────────────────────────────────────
//  The small money sums every screen shares, written once so two screens can never disagree about the same figure:
//    - an invoice's total,
//    - adding amounts up PER CURRENCY (never across currencies),
//    - how a deposit is divided up.
//  Pure arithmetic (no store, no screen), covered by scripts/check-money.ts.
// ──────────────────────────────────────────────────────────

import type { Invoice, InvoiceStatus, RoyaltyStream, Show } from '@/types'

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

/** What a show is expected to pay out: the fee less the agency's and management's cuts when it was booked through an agency. */
export function showNet(show: Pick<Show, 'guarantee' | 'viaAgency' | 'agencyCommissionPct' | 'managementCommissionPct'>): number {
  if (!show.guarantee) return 0
  const cuts = show.viaAgency ? (show.agencyCommissionPct ?? 0) + (show.managementCommissionPct ?? 0) : 0
  return r2(show.guarantee * (1 - cuts / 100))
}

/**
 * Where an invoice stands today. The date decides, so every screen agrees: a sent invoice past its due date is overdue (whatever
 * the stored status says), and one marked overdue whose due date has not arrived is simply sent.
 */
export function invoiceState(inv: Pick<Invoice, 'status' | 'dueDate'>, today: string): InvoiceStatus {
  if (inv.status !== 'sent' && inv.status !== 'overdue') return inv.status
  return inv.dueDate < today ? 'overdue' : 'sent'
}

/** What is owed across a list of royalty streams, per currency. */
export const royaltiesOwed = (streams: readonly Pick<RoyaltyStream, 'amount' | 'currency'>[]): Record<string, number> =>
  sumByCurrency(streams, s => s.amount, s => s.currency)

const wholeUnits = (amount: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
const CURRENCY_ORDER = ['USD', 'GBP', 'EUR']

/** Per-currency totals as one line: "$1,500 · £250 · €80". Zero amounts are left out; nothing at all gives "". */
export function formatTotals(totals: Record<string, number>, format: (amount: number, currency: string) => string = wholeUnits): string {
  const rank = (c: string) => (CURRENCY_ORDER.includes(c) ? CURRENCY_ORDER.indexOf(c) : CURRENCY_ORDER.length)
  return Object.keys(totals)
    .filter(c => Math.abs(totals[c]) > 0.005)
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map(c => format(totals[c], c))
    .join(' · ')
}
