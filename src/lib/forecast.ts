// ──────────────────────────────────────────────────────────
//  Cash forecast (Finance Stage 5b) — what money is expected in and out, and when, worked out from the data already in
//  the app. Nothing here is stored: it is recomputed every time, so it can never go stale. Pure logic (no store, no
//  screen), so the Inbox, the Finance tab, Home and the daily email can all use the very same rules.
//
//  Money IN
//    • a settlement that has not been paid in full  → the balance still owed, less what a sent invoice for the same show
//      already lists (so the same money is never listed twice, and none of it goes missing)
//    • an invoice that was sent and not paid        → what is still owed on it (its total less the deposits that paid part of
//      it), on its due date
//    • a confirmed show with no invoice / settlement → its fee (less agency and management cuts when booked through an
//      agency), on the dates the offer's payment schedule gives, else 30 days after the show; minus whatever has been
//      recorded as received
//  Money OUT
//    • a bill with a due date that is not paid
//  The same money is never counted twice: a show covered by a settlement, or by a sent / paid invoice, makes no line of
//  its own. Different currencies are never added together.
// ──────────────────────────────────────────────────────────

import type { Client, Currency, MainSection } from '@/types'
import { balanceOf } from '@/lib/settlement-math'
import { fmtMoney, invoiceOutstanding, invoiceTotal, settlementBalancesNotOnInvoices, showNet } from '@/lib/money'
import { addDays, localDateOf } from '@/lib/utils'

export type ForecastKind = 'installment' | 'show' | 'invoice' | 'settlement' | 'bill'

export interface ForecastItem {
  id: string
  clientId: string
  clientName: string
  kind: ForecastKind
  direction: 'in' | 'out'
  date: string                  // the day the money is expected
  amount: number                // always positive; direction says which way it moves
  currency: Currency
  title: string
  detail?: string
  estimated: boolean            // the date is a guess (the 30-day rule, or a schedule that could not be read)
  tentative: boolean            // a held date that is not confirmed yet
  late: boolean                 // expected before today and still not recorded as received
  daysLate: number              // 0 unless late
  showId?: string
  invoiceId?: string
  settlementId?: string
  expenseId?: string
  go: { section: MainSection; sub?: string }
}

export interface ForecastOptions {
  /** Also forecast held (not yet confirmed) dates, marked tentative. Off by default: confirmed money only. */
  includeHolds?: boolean
}

/** The days after a show that money is assumed to arrive when the offer gives no payment schedule. */
export const DEFAULT_PAYMENT_DAYS = 30

const DAY = 86_400_000
const r2 = (n: number) => Math.round(n * 100) / 100
const days = (a: string, b: string) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / DAY)

export { showNet }

// ── Reading a payment term ("30 days out", "net 15", "day of show") ─────────────
const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, ten: 10, fourteen: 14, fifteen: 15, thirty: 30, sixty: 60, ninety: 90 }

/**
 * The day a payment term falls on, for a show on `showDate`, or null when the wording can't be read with confidence
 * (for example "on signing", where nothing says when that was).
 */
export function parsePaymentDate(when: string, showDate: string): string | null {
  const text = when.toLowerCase().replace(/[,.]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text) return null
  const exact = text.match(/\b(\d{4}-\d{2}-\d{2})\b/)
  if (exact) return exact[1]

  const word = '(\\d+|' + Object.keys(NUMBER_WORDS).join('|') + ')'
  const num = (s: string) => (/^\d+$/.test(s) ? Number(s) : NUMBER_WORDS[s])
  const amount = (re: RegExp, unit: number) => { const m = text.match(re); return m ? num(m[1]) * unit : null }

  // before the show: "30 days out", "2 weeks before", "14 days prior to show"
  const before = amount(new RegExp(`\\b${word} days? (?:out|before|prior|ahead|in advance|pre[- ]?show)`), 1) ?? amount(new RegExp(`\\b${word} weeks? (?:out|before|prior|ahead|in advance)`), 7)
  if (before !== null) return addDays(showDate, -before)
  // after the show: "net 30", "30 days after", "within 10 days of the show"
  const after = amount(new RegExp(`\\bnet ${word}\\b`), 1) ?? amount(new RegExp(`\\b${word} days? (?:after|post|following|from|of the show)`), 1) ?? amount(new RegExp(`\\bwithin ${word} days?`), 1) ?? amount(new RegExp(`\\b${word} weeks? (?:after|post|following)`), 7)
  if (after !== null) return addDays(showDate, after)
  // on the day
  if (/\b(day of|show day|night of|on the day|same day|at the show|at show|day-of|upon settlement|at settlement|after the show|after show|post show|post-show|on completion|upon completion)\b/.test(text)) return showDate
  return null
}

// ── The forecast for one artist ─────────────────────────────────────────────────
export function buildForecast(client: Client, today: string, opts: ForecastOptions = {}): ForecastItem[] {
  const items: ForecastItem[] = []
  const lateBy = (date: string) => Math.max(0, days(today, date))
  const base = { clientId: client.id, clientName: client.name }
  const add = (item: Omit<ForecastItem, 'clientId' | 'clientName' | 'late' | 'daysLate' | 'tentative'> & { tentative?: boolean }) => {
    const tentative = item.tentative ?? false
    const daysLate = tentative ? 0 : lateBy(item.date)
    items.push({ ...base, ...item, tentative, late: daysLate > 0, daysLate })
  }

  const settlements = client.finance.settlements ?? []
  const shows = client.tour.shows
  const showById = new Map(shows.map(s => [s.id, s]))
  const invoiceById = new Map(client.finance.invoices.map(i => [i.id, i]))
  const settledShowIds = new Set(settlements.flatMap(s => s.showIds))
  const deposits = client.business.banking.deposits

  // ── Money in: settlements still owing ──
  const wholes = settlements.map(s => ({ id: s.id, showIds: s.showIds, currency: s.currency, balance: r2(balanceOf(s)) }))
  const uncovered = settlementBalancesNotOnInvoices(wholes, shows, client.finance.invoices, deposits)      // the invoices below list the rest
  for (const s of settlements) {
    const whole = wholes.find(w => w.id === s.id)!.balance
    if (whole <= 0.005) continue
    const balance = uncovered[s.id] ?? whole
    if (balance <= 0.005) continue
    const showDates = s.showIds.map(id => showById.get(id)?.date).filter((d): d is string => !!d).sort()
    const from = showDates[showDates.length - 1] ?? s.preparedOn ?? localDateOf(s.confirmedAt)
    add({
      id: `settlement:${s.id}`, kind: 'settlement', direction: 'in', date: addDays(from, DEFAULT_PAYMENT_DAYS), amount: balance, currency: s.currency,
      title: `${s.promoter ?? 'The promoter'} owes you the balance on ${s.venue ?? s.eventName ?? 'a settlement'}`,
      detail: balance < whole - 0.005 ? 'Settlement received; an invoice on this list already lists part of this balance' : 'Settlement received, balance not paid yet', estimated: true, settlementId: s.id,
      go: { section: 'tour', sub: 'settlements' },
    })
  }

  // ── Money in: invoices that were sent and not paid ──
  for (const inv of client.finance.invoices) {
    if (inv.status !== 'sent' && inv.status !== 'overdue') continue
    const owed = invoiceOutstanding(inv, deposits)               // after the deposits that paid part of it
    if (owed <= 0.005) continue
    const partPaid = r2(invoiceTotal(inv) - owed)
    add({
      id: `invoice:${inv.id}`, kind: 'invoice', direction: 'in', date: inv.dueDate, amount: owed, currency: inv.currency,
      title: `Invoice ${inv.number} to ${inv.to}`, detail: partPaid > 0.005 ? `${fmtAmount(partPaid, inv.currency)} of it is already paid` : inv.status === 'overdue' ? 'Marked overdue' : undefined, estimated: false, invoiceId: inv.id,
      go: { section: 'finance', sub: 'invoices' },
    })
  }

  // ── Money in: shows nothing else covers ──
  for (const show of shows) {
    if (show.historyOnly || show.status === 'cancelled') continue
    if (show.status === 'hold' && !opts.includeHolds) continue
    const net = showNet(show)
    if (net <= 0) continue
    // a settlement, or an invoice that was sent or paid, already stands for this show's money
    if (settledShowIds.has(show.id)) continue
    const linked = show.invoiceId ? invoiceById.get(show.invoiceId) : undefined
    if (linked && (linked.status === 'sent' || linked.status === 'overdue' || linked.status === 'paid')) continue
    const tentative = show.status === 'hold'
    if (tentative && show.date < today) continue            // a hold whose date has passed is not money we are waiting for

    const currency = show.currency ?? 'USD'
    const what = `${show.venue}${show.city ? `, ${show.city}` : ''}`
    const offer = show.tourOfferId ? client.agentData?.offers.find(o => o.id === show.tourOfferId) : undefined
    const schedule = offer?.terms?.payments ?? []
    const pctTotal = schedule.reduce((s, p) => s + p.pct, 0)
    let received = r2(show.received ?? 0)

    if (schedule.length > 0 && Math.abs(pctTotal - 100) < 0.5) {
      // the offer's own payment schedule, earliest first; what has been received is used up from the front
      const parts = schedule.map((p, i) => {
        const date = parsePaymentDate(p.when, show.date)
        return { when: p.when, pct: p.pct, date: date ?? addDays(show.date, DEFAULT_PAYMENT_DAYS), readable: date !== null, order: i }
      }).sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order)
      let assigned = 0
      parts.forEach((p, i) => {
        const full = i === parts.length - 1 ? r2(net - assigned) : r2(net * p.pct / 100)   // the last part takes any rounding
        assigned = r2(assigned + full)
        const used = Math.min(received, full)
        received = r2(received - used)
        const amount = r2(full - used)
        if (amount <= 0.005) return
        add({
          id: `installment:${show.id}:${p.order}`, kind: 'installment', direction: 'in', date: p.date, amount, currency, tentative,
          title: `${p.pct}% payment for ${what}`,
          detail: p.readable ? `Terms say “${p.when}”` : `Terms say “${p.when}”, which could not be read: assumed ${DEFAULT_PAYMENT_DAYS} days after the show`,
          estimated: !p.readable, showId: show.id, go: { section: 'tour', sub: 'tour' },
        })
      })
      continue
    }

    const amount = r2(net - received)
    if (amount <= 0.005) continue
    add({
      id: `show:${show.id}`, kind: 'show', direction: 'in', date: addDays(show.date, DEFAULT_PAYMENT_DAYS), amount, currency, tentative,
      title: `Fee for ${what}`, detail: received > 0 ? `${received} already received` : `No payment schedule: assumed ${DEFAULT_PAYMENT_DAYS} days after the show`,
      estimated: true, showId: show.id, go: { section: 'tour', sub: 'tour' },
    })
  }

  // ── Money out: bills ──
  for (const e of client.finance.expenses) {
    if (e.paid || !e.dueDate || e.amount <= 0) continue
    add({
      id: `bill:${e.id}`, kind: 'bill', direction: 'out', date: e.dueDate, amount: r2(e.amount), currency: e.currency,
      title: `Bill from ${e.billNumber ? `${e.vendor} (${e.billNumber})` : e.vendor}`, detail: e.description || undefined, estimated: false, expenseId: e.id,
      go: { section: 'finance', sub: 'payments' },
    })
  }

  return items.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
}

/** An amount in its own currency: whole units when there are no cents ($10,000), cents when there are ($8,500.50). */
export function fmtAmount(amount: number, currency: Currency): string {
  return fmtMoney(amount, currency)
}

/** Unpaid bills that have no due date, so the forecast cannot place them (worth saying out loud). */
export function undatedBills(client: Client): { count: number; byCurrency: Partial<Record<Currency, number>> } {
  const byCurrency: Partial<Record<Currency, number>> = {}
  let count = 0
  for (const e of client.finance.expenses) {
    if (e.paid || e.dueDate || e.amount <= 0) continue
    count += 1
    byCurrency[e.currency] = r2((byCurrency[e.currency] ?? 0) + e.amount)
  }
  return { count, byCurrency }
}

// ── Totals and shape ────────────────────────────────────────────────────────────
export interface CurrencyTotals { currency: Currency; in: number; out: number }

/** In and out per currency (never converted or added across currencies). */
export function totalsByCurrency(items: ForecastItem[]): CurrencyTotals[] {
  const map = new Map<Currency, CurrencyTotals>()
  for (const i of items) {
    const t = map.get(i.currency) ?? { currency: i.currency, in: 0, out: 0 }
    if (i.direction === 'in') t.in = r2(t.in + i.amount); else t.out = r2(t.out + i.amount)
    map.set(i.currency, t)
  }
  return [...map.values()].sort((a, b) => a.currency.localeCompare(b.currency))
}

export interface ForecastWindow { days: number; totals: CurrencyTotals[] }

/** What is expected to come in and go out within the next N days (late items are not in these; they are shown apart). */
export function windowTotals(items: ForecastItem[], today: string, windows: number[] = [30, 60, 90]): ForecastWindow[] {
  return windows.map(n => {
    const end = addDays(today, n)
    return { days: n, totals: totalsByCurrency(items.filter(i => !i.late && i.date <= end)) }
  })
}

export interface ForecastWeek { start: string; end: string; items: ForecastItem[] }

/** The next `weeks` weeks (starting today), with everything dated after that listed as `later`, and late items apart. */
export function scheduleByWeek(items: ForecastItem[], today: string, weeks = 13): { late: ForecastItem[]; weeks: ForecastWeek[]; later: ForecastItem[] } {
  const late = items.filter(i => i.late)
  const open = items.filter(i => !i.late)
  const out: ForecastWeek[] = Array.from({ length: weeks }, (_, w) => ({ start: addDays(today, w * 7), end: addDays(today, w * 7 + 6), items: [] }))
  const horizon = addDays(today, weeks * 7 - 1)
  const later: ForecastItem[] = []
  for (const i of open) {
    if (i.date > horizon) { later.push(i); continue }
    const w = Math.min(weeks - 1, Math.max(0, Math.floor(days(i.date, today) / 7)))
    out[w].items.push(i)
  }
  return { late, weeks: out, later }
}
