// ──────────────────────────────────────────────────────────
//  The profit & loss, worked out month by month from what the app already holds, so it can never stop at the last month
//  someone typed. Pure logic (no store, no screen), covered by scripts/check-ledger.ts.
//
//  Where each month's figures come from, in this order (the first that has the month wins, so nothing is counted twice):
//    1. typed    - a month someone entered by hand (kept as the books for that month),
//    2. records  - money in: every deposit, plus every paid invoice that no deposit says it paid;
//                  money out: every paid bill,
//    3. bank     - the connected bank account's settled transactions.
//  Each currency has its own P&L: pounds and euros are never added into dollars. A hand-typed month is in the artist's home currency.
// ──────────────────────────────────────────────────────────

import type { Client, Deposit, Expense, Invoice, PLMonth, RevenueStream } from '@/types'
import { financeSettings } from '@/lib/budget'
import { plMonthsFromTransactions } from '@/lib/bank-rollup'
import { invoiceTotal, r2 } from '@/lib/money'

export type PLSource = 'typed' | 'records' | 'bank' | 'none'
export interface LedgerMonth extends PLMonth { source: PLSource }
export interface PLLedger {
  currencies: string[]                          // the artist's home currency first, then the rest
  months: Record<string, LedgerMonth[]>         // per currency, oldest first, with no gaps up to this month
}

const REVENUE_KEYS: RevenueStream[] = ['touring', 'streaming', 'sync', 'brand', 'merch', 'other']
const emptyMonth = (month: string): PLMonth => ({
  month,
  revenue: { touring: 0, streaming: 0, sync: 0, brand: 0, merch: 0, other: 0 },
  expenses: { travel: 0, recording: 0, marketing: 0, legal: 0, management: 0, equipment: 0, meals: 0, other: 0 },
})

/**
 * What kind of income a deposit is, guessed from the name it was logged under ("BMI ROYALTY DIST" is streaming, "Sync Licensing Co."
 * is sync). It only decides which line of the P&L the money sits on; the amount is always counted. Anything unrecognised is "other".
 */
export function depositCategory(name: string): RevenueStream {
  if (/sync/i.test(name)) return 'sync'
  if (/royalt|\bbmi\b|ascap|sesac|\bprs\b|sound ?exchange|\bmlc\b|\bppl\b|spotify|apple music|distrokid|tunecore|distribution|streaming|\bdsp\b/i.test(name)) return 'streaming'
  if (/merch/i.test(name)) return 'merch'
  if (/brand|endorse|sponsor/i.test(name)) return 'brand'
  if (/tour|festival|promoter|guarantee|\bshow\b/i.test(name)) return 'touring'
  return 'other'
}

type Months = Map<string, PLMonth>         // month ("2026-07") → figures
const monthOf = (date: string) => date.slice(0, 7)

function monthIn(byCurrency: Map<string, Months>, currency: string, month: string): PLMonth {
  const months = byCurrency.get(currency) ?? new Map<string, PLMonth>()
  byCurrency.set(currency, months)
  const m = months.get(month) ?? emptyMonth(month)
  months.set(month, m)
  return m
}

/** Money in and out recorded as records: deposits, paid invoices nobody's deposit already accounts for, paid bills. */
function fromRecords(client: Client): Map<string, Months> {
  const out = new Map<string, Months>()
  const deposits: Deposit[] = client.business?.banking?.deposits ?? []
  const invoices: Invoice[] = client.finance?.invoices ?? []
  const expenses: Expense[] = client.finance?.expenses ?? []
  const covered = new Set(deposits.map(d => d.invoiceId).filter((id): id is string => !!id))
  const invoiceById = new Map(invoices.map(i => [i.id, i]))

  for (const d of deposits) {
    if (!d.date) continue
    const m = monthIn(out, d.currency, monthOf(d.date))
    // A deposit that pays an invoice sits on that invoice's line (touring, sync...); any other is placed by its name.
    const cat = (d.invoiceId && invoiceById.get(d.invoiceId)?.category) || depositCategory(d.name)
    m.revenue[cat] = r2(m.revenue[cat] + d.amount)
  }
  for (const inv of invoices) {
    if (inv.status !== 'paid' || covered.has(inv.id)) continue
    const when = inv.paidDate ?? inv.dueDate
    if (!when) continue
    const m = monthIn(out, inv.currency, monthOf(when))
    m.revenue[inv.category] = r2(m.revenue[inv.category] + invoiceTotal(inv))
  }
  for (const e of expenses) {
    if (!e.paid || !e.date) continue
    const m = monthIn(out, e.currency, monthOf(e.date))
    m.expenses[e.category] = r2(m.expenses[e.category] + e.amount)
  }
  return out
}

/** The connected bank's settled transactions, one P&L per currency. */
function fromBank(client: Client): Map<string, Months> {
  const out = new Map<string, Months>()
  const byCurrency = new Map<string, NonNullable<Client['business']['banking']['transactions']>>()
  for (const t of client.business?.banking?.transactions ?? []) {
    const cur = t.currency ?? 'USD'
    byCurrency.set(cur, [...(byCurrency.get(cur) ?? []), t])
  }
  for (const [cur, txns] of byCurrency) out.set(cur, new Map(plMonthsFromTransactions(txns).map(m => [m.month, m])))
  return out
}

const hasFigures = (m: PLMonth) => REVENUE_KEYS.some(k => m.revenue[k] !== 0) || Object.values(m.expenses).some(v => v !== 0)
const nextMonth = (month: string) => { const [y, m] = month.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}` }

export function buildPL(client: Client, today: string): PLLedger {
  const home = financeSettings(client).homeCurrency as string
  const typed = new Map<string, Months>([[home, new Map((client.finance?.plMonths ?? []).map(m => [m.month, m]))]])
  const records = fromRecords(client)
  const bank = fromBank(client)

  const currencies = [...new Set([...typed.keys(), ...records.keys(), ...bank.keys()])]
  const result: PLLedger = { currencies: [], months: {} }
  const thisMonth = monthOf(today)

  for (const cur of currencies) {
    const t = typed.get(cur) ?? new Map<string, PLMonth>()
    const r = records.get(cur) ?? new Map<string, PLMonth>()
    const b = bank.get(cur) ?? new Map<string, PLMonth>()
    const picked = new Map<string, LedgerMonth>()
    for (const month of new Set([...t.keys(), ...r.keys(), ...b.keys()])) {
      const typedMonth = t.get(month), recordMonth = r.get(month), bankMonth = b.get(month)
      if (typedMonth) picked.set(month, { ...typedMonth, source: 'typed' })
      else if (recordMonth && hasFigures(recordMonth)) picked.set(month, { ...recordMonth, source: 'records' })
      else if (bankMonth && hasFigures(bankMonth)) picked.set(month, { ...bankMonth, source: 'bank' })
    }
    if (picked.size === 0) continue

    // No gaps: every month from the first one up to this month, with the quiet ones shown as empty rather than missing.
    const first = [...picked.keys()].sort()[0]
    const last = [...picked.keys()].sort().reverse()[0]
    const end = last > thisMonth ? last : thisMonth
    for (let m = first; m <= end; m = nextMonth(m)) if (!picked.has(m)) picked.set(m, { ...emptyMonth(m), source: 'none' })
    result.months[cur] = [...picked.values()].sort((a, b) => a.month.localeCompare(b.month))
    result.currencies.push(cur)
  }

  const rank = (c: string) => (c === home ? -1 : ['USD', 'GBP', 'EUR'].indexOf(c) === -1 ? 9 : ['USD', 'GBP', 'EUR'].indexOf(c))
  result.currencies.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  return result
}

// ── Totals ──────────────────────────────────────────────────
export const totalRevenue = (m: PLMonth) => r2(Object.values(m.revenue).reduce((a, b) => a + b, 0))
export const totalExpenses = (m: PLMonth) => r2(Object.values(m.expenses).reduce((a, b) => a + b, 0))
export const netIncome = (m: PLMonth) => r2(totalRevenue(m) - totalExpenses(m))

/** The months that belong to the calendar year of `today` (a real year to date, not every month ever entered). */
export const monthsThisYear = (months: PLMonth[], today: string) => months.filter(m => m.month.startsWith(today.slice(0, 4)))

export const SOURCE_LABEL: Record<PLSource, string> = {
  typed: 'Entered by hand', records: 'From your records', bank: 'From your bank', none: 'Nothing recorded',
}
