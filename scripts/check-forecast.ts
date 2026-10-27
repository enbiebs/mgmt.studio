// Checks the cash forecast rules (what money is expected in and out, and when).  Run with:  npx tsx scripts/check-forecast.ts
import assert from 'node:assert/strict'
import { buildInbox } from '../src/lib/inbox'
import { DEFAULT_PAYMENT_DAYS, buildForecast, parsePaymentDate, scheduleByWeek, showNet, totalsByCurrency, undatedBills, windowTotals } from '../src/lib/forecast'
import type { Client, Expense, Invoice, Settlement, Show, TourOffer } from '../src/types'

const TODAY = '2026-10-16'

function client(over: { shows?: Show[]; invoices?: Invoice[]; expenses?: Expense[]; settlements?: Settlement[]; offers?: TourOffer[]; deposits?: unknown[] } = {}): Client {
  return {
    id: 'c1', name: 'Artist',
    tour: { shows: over.shows ?? [] },
    finance: { invoices: over.invoices ?? [], expenses: over.expenses ?? [], settlements: over.settlements ?? [] },
    agentData: { offers: over.offers ?? [] },
    business: { banking: { deposits: over.deposits ?? [] } },
  } as unknown as Client
}
const show = (o: Partial<Show> = {}): Show => ({ id: 's1', date: '2026-11-20', city: 'Lisbon', venue: 'LX', time: '20:00', status: 'confirmed', guarantee: 10000, currency: 'USD', ...o })
const invoice = (o: Partial<Invoice> = {}): Invoice => ({ id: 'i1', number: 'INV-1', to: 'Promoter', category: 'touring', status: 'sent', issuedDate: '2026-10-01', dueDate: '2026-11-01', items: [{ description: 'x', quantity: 1, rate: 3000 }], currency: 'USD', ...o })
const bill = (o: Partial<Expense> = {}): Expense => ({ id: 'e1', description: 'Van', vendor: 'Vans Inc', amount: 800, currency: 'USD', category: 'travel', date: '2026-10-01', paid: false, dueDate: '2026-10-30', ...o } as Expense)
const settlement = (o: Partial<Settlement> = {}): Settlement => ({
  id: 'st1', showIds: ['s1'], currency: 'USD', totalDue: 12000, payments: [{ label: 'Deposit', amount: 5000 }], confirmedAt: '2026-10-10T12:00:00Z', venue: 'LX', promoter: 'Live Co',
  boxOffice: [], expenses: [], payout: [], fx: { USD: 1, EUR: 1, GBP: 1, at: '' }, ...o,
} as Settlement)
const offer = (payments: { when: string; pct: number }[]): TourOffer => ({ id: 'o1', venue: 'LX', city: 'Lisbon', country: 'PT', date: '2026-11-20', promoter: 'P', guarantee: 10000, status: 'confirmed', terms: { payments } } as TourOffer)
const ids = (items: { id: string }[]) => items.map(i => i.id)

// ── reading a payment term ──
const d = '2026-11-20'
assert.equal(parsePaymentDate('30 days out', d), '2026-10-21')
assert.equal(parsePaymentDate('30 days before show', d), '2026-10-21')
assert.equal(parsePaymentDate('2 weeks prior', d), '2026-11-06')
assert.equal(parsePaymentDate('Net 30', d), '2026-12-20')
assert.equal(parsePaymentDate('10 days after the show', d), '2026-11-30')
assert.equal(parsePaymentDate('within ten days', d), '2026-11-30')
assert.equal(parsePaymentDate('Day of show', d), d)
assert.equal(parsePaymentDate('Upon settlement', d), d)
assert.equal(parsePaymentDate('paid 2026-11-01', d), '2026-11-01')
assert.equal(parsePaymentDate('on signing', d), null)         // nothing says when signing was
assert.equal(parsePaymentDate('', d), null)
assert.equal(parsePaymentDate('soon-ish', d), null)

// ── what a show pays out ──
assert.equal(showNet(show()), 10000)
assert.equal(showNet(show({ viaAgency: true, agencyCommissionPct: 10, managementCommissionPct: 5 })), 8500)
assert.equal(showNet(show({ viaAgency: false, agencyCommissionPct: 10 })), 10000)         // the cuts only count when booked through an agency
assert.equal(showNet(show({ guarantee: undefined })), 0)

// ── a show with no schedule: the 30-day rule ──
let f = buildForecast(client({ shows: [show()] }), TODAY)
assert.equal(f.length, 1)
assert.deepEqual([f[0].kind, f[0].direction, f[0].date, f[0].amount, f[0].estimated, f[0].late], ['show', 'in', '2026-12-20', 10000, true, false])
assert.equal(DEFAULT_PAYMENT_DAYS, 30)
// …less what has been received
f = buildForecast(client({ shows: [show({ received: 4000 })] }), TODAY)
assert.equal(f[0].amount, 6000)
assert.equal(buildForecast(client({ shows: [show({ received: 10000 })] }), TODAY).length, 0)
assert.equal(buildForecast(client({ shows: [show({ received: 12000 })] }), TODAY).length, 0)       // over-received: nothing more is expected
// no money recorded at all: nothing to forecast
assert.equal(buildForecast(client({ shows: [show({ guarantee: undefined })] }), TODAY).length, 0)
// through an agency, the expected amount is net
assert.equal(buildForecast(client({ shows: [show({ viaAgency: true, agencyCommissionPct: 10, managementCommissionPct: 5 })] }), TODAY)[0].amount, 8500)

// ── a show with the offer's own payment schedule ──
const sched = [{ when: '30 days out', pct: 50 }, { when: 'Day of show', pct: 50 }]
f = buildForecast(client({ shows: [show({ tourOfferId: 'o1' })], offers: [offer(sched)] }), TODAY)
assert.deepEqual(f.map(i => [i.kind, i.date, i.amount, i.estimated]), [['installment', '2026-10-21', 5000, false], ['installment', '2026-11-20', 5000, false]])
// received money is used up from the earliest payment
f = buildForecast(client({ shows: [show({ tourOfferId: 'o1', received: 7500 })], offers: [offer(sched)] }), TODAY)
assert.deepEqual(f.map(i => [i.date, i.amount]), [['2026-11-20', 2500]])
f = buildForecast(client({ shows: [show({ tourOfferId: 'o1', received: 2500 })], offers: [offer(sched)] }), TODAY)
assert.deepEqual(f.map(i => [i.date, i.amount]), [['2026-10-21', 2500], ['2026-11-20', 5000]])
// the schedule is sorted by date, whatever order it was typed in
f = buildForecast(client({ shows: [show({ tourOfferId: 'o1' })], offers: [offer([{ when: 'Day of show', pct: 50 }, { when: '30 days out', pct: 50 }])] }), TODAY)
assert.deepEqual(f.map(i => i.date), ['2026-10-21', '2026-11-20'])
// a term that cannot be read: assumed 30 days after, and said so
f = buildForecast(client({ shows: [show({ tourOfferId: 'o1' })], offers: [offer([{ when: 'on signing', pct: 25 }, { when: 'Day of show', pct: 75 }])] }), TODAY)
assert.deepEqual(f.map(i => [i.date, i.amount, i.estimated]), [['2026-11-20', 7500, false], ['2026-12-20', 2500, true]])
assert.match(f[1].detail ?? '', /could not be read/)
// parts that don't add up to 100%: the schedule is not trusted, the 30-day rule is used instead
f = buildForecast(client({ shows: [show({ tourOfferId: 'o1' })], offers: [offer([{ when: '30 days out', pct: 30 }, { when: 'Day of show', pct: 30 }])] }), TODAY)
assert.deepEqual(f.map(i => [i.kind, i.date, i.amount]), [['show', '2026-12-20', 10000]])
// odd amounts: the parts add up exactly to the net
f = buildForecast(client({ shows: [show({ guarantee: 1000, tourOfferId: 'o1' })], offers: [offer([{ when: '30 days out', pct: 33.33 }, { when: 'Net 10', pct: 33.33 }, { when: 'Day of show', pct: 33.34 }])] }), TODAY)
assert.equal(Math.round(f.reduce((s, i) => s + i.amount, 0) * 100) / 100, 1000)

// ── late ──
f = buildForecast(client({ shows: [show({ date: '2026-08-01' })] }), TODAY)           // expected 2026-08-31, long gone
assert.equal(f[0].late, true); assert.equal(f[0].daysLate, 46)
f = buildForecast(client({ shows: [show({ date: '2026-09-16' })] }), TODAY)           // expected exactly today: not late
assert.equal(f[0].date, TODAY); assert.equal(f[0].late, false); assert.equal(f[0].daysLate, 0)

// ── the same money is never counted twice ──
const settled = client({ shows: [show()], settlements: [settlement()] })
f = buildForecast(settled, TODAY)
assert.deepEqual(ids(f), ['settlement:st1'])
assert.equal(f[0].amount, 7000)                                                          // total due less what was already paid
assert.equal(f[0].date, '2026-12-20')                                                    // 30 days after the show it covers
assert.equal(buildForecast(client({ shows: [show()], settlements: [settlement({ payments: [{ label: 'All', amount: 12000 }] })] }), TODAY).length, 0)   // paid in full: nothing owed
assert.equal(buildForecast(client({ shows: [show()], settlements: [settlement({ balanceDue: 3000 })] }), TODAY)[0].amount, 3000)               // a printed balance wins
for (const status of ['sent', 'overdue', 'paid'] as const) {
  f = buildForecast(client({ shows: [show({ invoiceId: 'i1' })], invoices: [invoice({ status })] }), TODAY)
  assert.ok(!f.some(i => i.kind === 'show'), `${status}: the invoice covers the show`)
}
for (const status of ['draft', 'void'] as const) {
  f = buildForecast(client({ shows: [show({ invoiceId: 'i1' })], invoices: [invoice({ status })] }), TODAY)
  assert.ok(f.some(i => i.kind === 'show'), `${status}: an invoice that was never sent does not cover the show`)
}

// ── invoices ──
f = buildForecast(client({ invoices: [invoice(), invoice({ id: 'i2', status: 'overdue', dueDate: '2026-10-01' }), invoice({ id: 'i3', status: 'paid' }), invoice({ id: 'i4', status: 'draft' }), invoice({ id: 'i5', status: 'void' })] }), TODAY)
assert.deepEqual(ids(f), ['invoice:i2', 'invoice:i1'])                                   // sorted by date; paid, draft and void are not money to wait for
assert.equal(f[0].late, true); assert.equal(f[0].daysLate, 15); assert.equal(f[0].amount, 3000); assert.equal(f[0].estimated, false)

// ── bills ──
const e = client({ expenses: [bill(), bill({ id: 'e2', paid: true }), bill({ id: 'e3', dueDate: undefined, amount: 200 }), bill({ id: 'e4', dueDate: undefined, amount: 50, currency: 'EUR' })] })
f = buildForecast(e, TODAY)
assert.deepEqual(ids(f), ['bill:e1']); assert.equal(f[0].direction, 'out'); assert.equal(f[0].amount, 800)
assert.deepEqual(undatedBills(e), { count: 2, byCurrency: { USD: 200, EUR: 50 } })      // said out loud instead of silently dropped

// ── holds, history and cancelled shows ──
const holdClient = client({ shows: [show({ status: 'hold' }), show({ id: 's2', status: 'hold', date: '2026-09-01' }), show({ id: 's3', historyOnly: true }), show({ id: 's4', status: 'cancelled' })] })
assert.equal(buildForecast(holdClient, TODAY).length, 0)                                  // confirmed money only by default
f = buildForecast(holdClient, TODAY, { includeHolds: true })
assert.deepEqual(ids(f), ['show:s1']); assert.equal(f[0].tentative, true)                // a hold whose date has passed is dropped; history and cancelled never count
assert.equal(buildForecast(client({ shows: [show({ status: 'hold', date: '2026-10-17' })] }), TODAY, { includeHolds: true })[0].late, false)

// ── totals never mix currencies ──
const mixed = buildForecast(client({
  shows: [show({ currency: 'EUR' })], invoices: [invoice(), invoice({ id: 'i2', currency: 'GBP', dueDate: '2026-11-05' })], expenses: [bill()],
}), TODAY)
assert.deepEqual(totalsByCurrency(mixed), [{ currency: 'EUR', in: 10000, out: 0 }, { currency: 'GBP', in: 3000, out: 0 }, { currency: 'USD', in: 3000, out: 800 }])

// ── windows and weeks ──
const w = windowTotals(mixed, TODAY)
assert.deepEqual(w.map(x => x.days), [30, 60, 90])
assert.deepEqual(w[0].totals, [{ currency: 'GBP', in: 3000, out: 0 }, { currency: 'USD', in: 3000, out: 800 }])      // next 30 days (to 11-15): both invoices and the bill; the show's 12-20 is later
assert.deepEqual(w[2].totals.find(t => t.currency === 'EUR'), { currency: 'EUR', in: 10000, out: 0 })              // inside 90 days
const lateMix = buildForecast(client({ invoices: [invoice({ status: 'overdue', dueDate: '2026-10-01' })] }), TODAY)
assert.deepEqual(windowTotals(lateMix, TODAY)[0].totals, [])                                                          // late money is shown apart, not inside the windows
const sch = scheduleByWeek([...lateMix, ...mixed], TODAY)
assert.equal(sch.late.length, 1)
assert.equal(sch.weeks.length, 13)
assert.equal(sch.weeks[0].start, TODAY); assert.equal(sch.weeks[0].end, '2026-10-22')
assert.ok(sch.weeks[2].items.some(i => i.id === 'bill:e1'))                                                           // 10-30 is 14 days out: the third week
assert.equal(sch.later.length, 0)
assert.equal(scheduleByWeek(buildForecast(client({ shows: [show({ date: '2027-06-01' })] }), TODAY), TODAY).later.length, 1)      // beyond the weeks shown

// ── the Inbox raises a late SCHEDULED payment (and only that: a plain late fee is "No settlement yet"'s job) ──
const access = { finance: true, tour: true, deals: true, legal: true, projects: true, music: true }
const lateSched = client({ shows: [show({ date: '2026-10-20', tourOfferId: 'o1' })], offers: [offer([{ when: '30 days out', pct: 50 }, { when: 'Day of show', pct: 50 }])] })   // the first half was due 2026-09-20
let inbox = buildInbox(lateSched, TODAY, access).filter(i => i.rule === 'receivable')
assert.equal(inbox.length, 1)
assert.equal(inbox[0].severity, 'urgent'); assert.equal(inbox[0].amount, 5000); assert.deepEqual(inbox[0].go, { section: 'finance', sub: 'forecast' })
assert.equal(buildInbox(lateSched, TODAY, { ...access, finance: false }).filter(i => i.rule === 'receivable').length, 0)             // no Finance access, no money items
assert.equal(buildInbox(client({ shows: [show({ date: '2026-08-01' })] }), TODAY, access).filter(i => i.rule === 'receivable').length, 0)   // a late plain fee is not raised here
assert.equal(buildInbox(client({ shows: [show({ date: '2026-11-04', tourOfferId: 'o1' })], offers: [offer([{ when: '15 days out', pct: 100 }])] }), TODAY, access).filter(i => i.rule === 'receivable').length, 0)  // due today, not late
inbox = buildInbox(client({ shows: [show({ date: '2026-10-20', tourOfferId: 'o1', received: 5000 })], offers: [offer([{ when: '30 days out', pct: 50 }, { when: 'Day of show', pct: 50 }])] }), TODAY, access).filter(i => i.rule === 'receivable')
assert.equal(inbox.length, 0)                                                                                                         // recorded as received: gone

// ── part-paid invoices: only what is still owed, the settlement balance is not counted a second time, and no money goes missing ──
const deposit = (amount: number, invoiceId = 'i1') => ({ id: `d-${amount}`, invoiceId, amount, currency: 'USD' })
f = buildForecast(client({ invoices: [invoice()], deposits: [deposit(1000)] }), TODAY)
assert.equal(f.find(i => i.id === 'invoice:i1')?.amount, 2000, 'the deposit that paid part of the invoice comes off')
assert.match(f.find(i => i.id === 'invoice:i1')?.detail ?? '', /\$1,000 of it is already paid/, 'and the line says so')
assert.ok(!buildForecast(client({ invoices: [invoice()], deposits: [deposit(3000)] }), TODAY).some(i => i.kind === 'invoice'), 'paid off by deposits: no line')
assert.equal(buildForecast(client({ invoices: [invoice()], deposits: [deposit(1000, 'other')] }), TODAY).find(i => i.id === 'invoice:i1')?.amount, 3000, 'a deposit for another invoice does not count')
const owing = (balance: number, over: Partial<Settlement> = {}) => settlement({ totalDue: balance + 5000, ...over })            // 5,000 already paid on it
// invoice 3,000 less 1,000 = 2,000 owed; settlement balance 2,000: the same money
f = buildForecast(client({ shows: [show({ invoiceId: 'i1' })], invoices: [invoice()], settlements: [owing(2000)], deposits: [deposit(1000)] }), TODAY)
assert.deepEqual(ids(f), ['invoice:i1'], 'the invoice and the settlement balance for the same show are one claim, listed once')
assert.equal(totalsByCurrency(f).find(t => t.currency === 'USD')?.in, 2000, 'so the money expected in is counted once')
f = buildForecast(client({ shows: [show({ invoiceId: 'i1' })], invoices: [invoice({ status: 'paid' })], settlements: [owing(7000)] }), TODAY)
assert.deepEqual(ids(f), ['settlement:st1'], 'a paid invoice is not a claim, so a balance still owed is kept')
f = buildForecast(client({ shows: [show({ invoiceId: 'i1' })], invoices: [invoice()], settlements: [owing(2000)], deposits: [deposit(3000)] }), TODAY)
assert.deepEqual(ids(f), ['settlement:st1'], 'once deposits cover the invoice, the settlement balance is the only claim left')
// money must never go missing
f = buildForecast(client({ shows: [show({ invoiceId: 'i1' })], invoices: [invoice()], settlements: [owing(14000)] }), TODAY)
assert.deepEqual(f.map(i => [i.kind, i.amount]).sort(), [['invoice', 3000], ['settlement', 11000]], 'a balance bigger than the invoice keeps the excess as its own line')
assert.equal(totalsByCurrency(f).find(t => t.currency === 'USD')?.in, 14000, 'so the total expected in is the whole 14,000')
assert.match(f.find(i => i.kind === 'settlement')?.detail ?? '', /an invoice on this list already lists part of this balance/)
f = buildForecast(client({ shows: [show({ id: 's1', invoiceId: 'i1' }), show({ id: 's2', date: '2026-10-01' })], invoices: [invoice()], settlements: [owing(21000, { showIds: ['s1', 's2'] })] }), TODAY)
assert.deepEqual(f.map(i => [i.kind, i.amount]).sort(), [['invoice', 3000], ['settlement', 18000]], 'a settlement for two shows with one invoice keeps the other show\'s money')
assert.equal(totalsByCurrency(f).find(t => t.currency === 'USD')?.in, 21000)

// one invoice, two settlements: its amount is shared out once, so the money expected in is neither doubled nor lost
f = buildForecast(client({ shows: [show({ id: 's1', invoiceId: 'i1' }), show({ id: 's2', invoiceId: 'i1', date: '2026-10-02' })], invoices: [invoice({ items: [{ description: 'x', quantity: 1, rate: 20000 }] })],
  settlements: [owing(10000, { id: 'A', showIds: ['s1'] }), owing(15000, { id: 'B', showIds: ['s2'] })] }), TODAY)
assert.equal(totalsByCurrency(f).find(t => t.currency === 'USD')?.in, 25000, 'the invoice plus what it does not cover is exactly what is owed')
assert.deepEqual(f.map(i => [i.kind, i.amount]).sort(), [['invoice', 20000], ['settlement', 5000]])

console.log('forecast: all checks passed')
