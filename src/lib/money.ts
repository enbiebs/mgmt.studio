// ──────────────────────────────────────────────────────────
//  The small money sums every screen shares, written once so two screens can never disagree about the same figure:
//    - an invoice's total and what is still owed on it,
//    - adding amounts up PER CURRENCY (never across currencies),
//    - how a deposit is divided up.
//  Pure arithmetic (no store, no screen), covered by scripts/check-money.ts.
// ──────────────────────────────────────────────────────────

import type { Deposit, Invoice, InvoiceStatus, RoyaltyStream, Settlement, Show } from '@/types'

/** Round to the cent, so float noise (0.1 × 3) never shows up as a figure. */
export const r2 = (n: number) => Math.round(n * 100) / 100

/** An invoice's total: quantity × rate for each line, to the cent. */
export const invoiceTotal = (inv: Pick<Invoice, 'items'>): number =>
  r2(inv.items.reduce((sum, i) => sum + i.quantity * i.rate, 0))

/**
 * What an invoice still has to collect: its total less the deposits recorded as paying it. Only deposits in the invoice's own
 * currency count (dollars are never taken off a pound invoice), and it never goes below zero.
 */
export function invoiceOutstanding(
  inv: Pick<Invoice, 'id' | 'items' | 'currency'>,
  deposits: readonly Pick<Deposit, 'invoiceId' | 'amount' | 'currency'>[],
): number {
  const paid = deposits.filter(d => d.invoiceId === inv.id && d.currency === inv.currency).reduce((sum, d) => sum + d.amount, 0)
  return Math.max(0, r2(invoiceTotal(inv) - paid))
}

/**
 * For each settlement, the part of its unpaid balance that is NOT already on a standing invoice. An unpaid invoice for the same show is
 * the same money as the settlement's balance, so it is listed once. But money must never go missing, and it must never be listed twice
 * either, so the sharing is done per GROUP: invoices and settlements that point at each other (through the shows) form a group, the
 * group is credited min(what its invoices still have to collect, what its settlements still owe), and that credit is handed to the
 * group's settlements in a fixed order (by id), each up to its balance. So the figure never depends on the order the settlements were
 * loaded in, and what is listed in all is exactly the larger of the two sides. What an invoice does not cover (a bonus or overage it never
 * billed, a second show, a different currency) stays as the settlement's own line.
 * `listed` limits which invoices count, for a screen that only lists some invoices (Home lists the overdue and soon-due ones): an
 * invoice that is not on screen cannot stand in for a balance that is.
 */
export function settlementBalancesNotOnInvoices(
  settlements: readonly (Pick<Settlement, 'id' | 'showIds' | 'currency'> & { balance: number })[],
  shows: readonly Pick<Show, 'id' | 'invoiceId'>[],
  invoices: readonly Pick<Invoice, 'id' | 'status' | 'items' | 'currency'>[],
  deposits: readonly Pick<Deposit, 'invoiceId' | 'amount' | 'currency'>[],
  listed?: ReadonlySet<string>,
): Record<string, number> {
  const owed = new Map<string, number>()               // standing invoice id -> what it still has to collect
  for (const inv of invoices) {
    if (inv.status !== 'sent' && inv.status !== 'overdue') continue
    if (listed && !listed.has(inv.id)) continue
    owed.set(inv.id, invoiceOutstanding(inv, deposits))
  }
  // groups, by union-find over "settlement:<id>" and "invoice:<id>" nodes
  const parent = new Map<string, string>()
  const find = (x: string): string => { let r = x; while ((parent.get(r) ?? r) !== r) r = parent.get(r) as string; parent.set(x, r); return r }
  const join = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb) }
  const links = new Map<string, string[]>()             // settlement id -> the standing invoices it points at (same currency)
  for (const s of settlements) {
    const mine: string[] = []
    for (const showId of s.showIds) {
      const invoiceId = shows.find(sh => sh.id === showId)?.invoiceId
      if (!invoiceId || !owed.has(invoiceId) || mine.includes(invoiceId)) continue
      if (invoices.find(i => i.id === invoiceId)?.currency !== s.currency) continue
      mine.push(invoiceId); join(`settlement:${s.id}`, `invoice:${invoiceId}`)
    }
    links.set(s.id, mine)
  }
  const supply = new Map<string, number>(), demand = new Map<string, number>()      // per group
  for (const [id, amount] of owed) { const g = find(`invoice:${id}`); supply.set(g, (supply.get(g) ?? 0) + amount) }
  for (const s of settlements) if ((links.get(s.id) ?? []).length > 0) { const g = find(`settlement:${s.id}`); demand.set(g, (demand.get(g) ?? 0) + Math.max(0, s.balance)) }
  const credit = new Map<string, number>()
  for (const [g, d] of demand) credit.set(g, Math.min(d, supply.get(g) ?? 0))
  const out: Record<string, number> = {}
  for (const s of [...settlements].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    if ((links.get(s.id) ?? []).length === 0) { out[s.id] = Math.max(0, r2(s.balance)); continue }
    const g = find(`settlement:${s.id}`)
    const take = Math.min(Math.max(0, s.balance), credit.get(g) ?? 0)
    credit.set(g, r2((credit.get(g) ?? 0) - take))
    out[s.id] = Math.max(0, r2(s.balance - take))
  }
  return out
}

/**
 * When an invoice that deposits have part-paid is marked paid, this is the part of it that no deposit covers yet: money the person says
 * has arrived but has not logged. The app does not log it for them (it would be guessing the amount and the date); it says so and offers
 * to open the deposit form with this filled in. Zero when no deposit points at the invoice yet (then the invoice itself stands for the
 * money) or when the deposits already cover it.
 */
export function unloggedWhenPaid(
  inv: Pick<Invoice, 'id' | 'items' | 'currency'>,
  deposits: readonly Pick<Deposit, 'invoiceId' | 'amount' | 'currency'>[],
): number {
  const received = deposits.filter(d => d.invoiceId === inv.id && d.currency === inv.currency).reduce((sum, d) => sum + d.amount, 0)
  return received > 0.005 ? invoiceOutstanding(inv, deposits) : 0
}

/** What is still owed on these invoices, per currency (each invoice less the deposits that paid part of it). */
export const owedByCurrency = (
  invoices: readonly Pick<Invoice, 'id' | 'items' | 'currency'>[],
  deposits: readonly Pick<Deposit, 'invoiceId' | 'amount' | 'currency'>[],
): Record<string, number> => sumByCurrency(invoices, i => invoiceOutstanding(i, deposits), i => i.currency)

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
 * How a deposit divides up: each share is its fraction of the amount (a fraction is 0.10 for 10%), rounded to the cent, and what
 * is left stays in the operating account. The four always add back up to the amount.
 */
export function splitDeposit(amount: number, shares: { mgmt: number; lawyer: number; taxes: number }): DepositSplit {
  const mgmt = r2(amount * shares.mgmt)
  const lawyer = r2(amount * shares.lawyer)
  const taxes = r2(amount * shares.taxes)
  return { mgmt, lawyer, taxes, stays: r2(amount - mgmt - lawyer - taxes) }
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

/**
 * The same, but an invoice whose deposits add up to its whole total is paid, whatever its stored status says: the money has
 * arrived. (Nothing is paid off by an empty list of deposits, so an invoice with none behaves exactly as before.)
 */
export function invoiceStateWithDeposits(
  inv: Pick<Invoice, 'id' | 'status' | 'dueDate' | 'items' | 'currency'>,
  today: string,
  deposits: readonly Pick<Deposit, 'invoiceId' | 'amount' | 'currency'>[],
): InvoiceStatus {
  const state = invoiceState(inv, today)
  if (state !== 'sent' && state !== 'overdue') return state
  const received = deposits.filter(d => d.invoiceId === inv.id && d.currency === inv.currency).reduce((sum, d) => sum + d.amount, 0)
  return received > 0.005 && invoiceOutstanding(inv, deposits) <= 0.005 ? 'paid' : state
}

/** What is owed across a list of royalty streams, per currency. */
export const royaltiesOwed = (streams: readonly Pick<RoyaltyStream, 'amount' | 'currency'>[]): Record<string, number> =>
  sumByCurrency(streams, s => s.amount, s => s.currency)

/** "$1,250" for a whole amount, "$1,250.50" when there are cents: money is never rounded on screen. */
export const fmtMoney = (amount: number, currency: string) => {
  const v = r2(amount) + 0   // to the cent (so 3.0000000000000004 is $3), and "+ 0" turns -0 into 0 (so it never prints "-$0")
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 }).format(v)
}
const CURRENCY_ORDER = ['USD', 'GBP', 'EUR']

/** Per-currency totals as one line: "$1,500 · £250 · €80". Zero amounts are left out; nothing at all gives "". */
export function formatTotals(totals: Record<string, number>, format: (amount: number, currency: string) => string = fmtMoney): string {
  const rank = (c: string) => (CURRENCY_ORDER.includes(c) ? CURRENCY_ORDER.indexOf(c) : CURRENCY_ORDER.length)
  return Object.keys(totals)
    .filter(c => Math.abs(totals[c]) > 0.005)
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map(c => format(totals[c], c))
    .join(' · ')
}
