// Checks the small money sums every screen shares: invoice totals, per-currency totals, and how a deposit divides up.  Run with:  npx tsx scripts/check-money.ts
import assert from 'node:assert/strict'
import { fmtMoney, formatTotals, invoiceOutstanding, invoiceState, invoiceStateWithDeposits, invoiceTotal, owedByCurrency, r2, royaltiesOwed, settlementBalancesNotOnInvoices, showNet, splitDeposit, sumByCurrency, unloggedWhenPaid } from '../src/lib/money'
import type { Invoice } from '../src/types'

const items = (...rows: [number, number][]): Pick<Invoice, 'items'> => ({ items: rows.map(([quantity, rate], i) => ({ description: `line ${i}`, quantity, rate })) })

// ── rounding ──
assert.equal(r2(0.1 * 3), 0.3)               // float noise is gone
assert.equal(r2(1.005 * 100), 100.5)
assert.equal(r2(2.675), 2.68)
assert.equal(r2(-1.234), -1.23)

// ── an invoice's total ──
assert.equal(invoiceTotal(items()), 0)                                     // no lines
assert.equal(invoiceTotal(items([1, 3000])), 3000)
assert.equal(invoiceTotal(items([2, 1500], [1, 250.5])), 3250.5)
assert.equal(invoiceTotal(items([3, 0.1])), 0.3)                           // not 0.30000000000000004
assert.equal(invoiceTotal(items([0.5, 1000], [1, -200])), 300)             // a credit line subtracts

// ── totals per currency: never added together ──
const rows = [
  { amount: 1000, currency: 'USD' }, { amount: 250.25, currency: 'GBP' }, { amount: 500, currency: 'USD' },
  { amount: 80, currency: 'EUR' }, { amount: 0.1, currency: 'GBP' }, { amount: 0.2, currency: 'GBP' },
]
assert.deepEqual(sumByCurrency(rows, r => r.amount, r => r.currency), { USD: 1500, GBP: 250.55, EUR: 80 })
assert.deepEqual(sumByCurrency([], (r: { amount: number }) => r.amount, () => 'USD'), {})
assert.equal(Object.keys(sumByCurrency(rows, r => r.amount, r => r.currency)).length, 3)         // three currencies, three totals
assert.deepEqual(sumByCurrency([{ a: 10 }, { a: 5 }], r => r.a, () => 'USD'), { USD: 15 })

// ── dividing up a deposit ──
// 200,000 at 10% management, 6% lawyer, 40% taxes
assert.deepEqual(splitDeposit(200000, { mgmt: 0.10, lawyer: 0.06, taxes: 0.40 }), { mgmt: 20000, lawyer: 12000, taxes: 80000, stays: 88000 })
assert.deepEqual(splitDeposit(0, { mgmt: 0.2, lawyer: 0.06, taxes: 0.4 }), { mgmt: 0, lawyer: 0, taxes: 0, stays: 0 })
assert.deepEqual(splitDeposit(1000, { mgmt: 0, lawyer: 0, taxes: 0 }), { mgmt: 0, lawyer: 0, taxes: 0, stays: 1000 })      // nothing taken: all stays
// shares are rounded to the cent, and the remainder stays, so the four ALWAYS add back to the amount
for (const [amount, mgmt, lawyer, taxes] of [[1234.56, 0.18, 0.06, 0.4], [999, 0.333, 0.333, 0.333], [17, 0.1, 0.1, 0.1], [50000, 0.2, 0.06, 0.4]] as const) {
  const s = splitDeposit(amount, { mgmt, lawyer, taxes })
  assert.equal(r2(s.mgmt + s.lawyer + s.taxes + s.stays), amount, `split of ${amount} adds back up`)
  for (const v of [s.mgmt, s.lawyer, s.taxes, s.stays]) assert.equal(r2(v), v, `${v} is a whole number of cents`)
}
assert.deepEqual(splitDeposit(17, { mgmt: 0.1, lawyer: 0.1, taxes: 0.1 }), { mgmt: 1.7, lawyer: 1.7, taxes: 1.7, stays: 11.9 })     // cents are kept, not rounded away
assert.deepEqual(splitDeposit(1234.56, { mgmt: 0.18, lawyer: 0.06, taxes: 0.4 }), { mgmt: 222.22, lawyer: 74.07, taxes: 493.82, stays: 444.45 })   // 222.2208, 74.0736, 493.824 -> cents; the rest stays
assert.deepEqual(splitDeposit(100, { mgmt: 1 / 3, lawyer: 1 / 3, taxes: 1 / 3 }), { mgmt: 33.33, lawyer: 33.33, taxes: 33.33, stays: 0.01 }, 'thirds: the stray cent stays')
// shares that add to more than 100% leave a negative remainder rather than hiding it
assert.equal(splitDeposit(1000, { mgmt: 0.5, lawyer: 0.4, taxes: 0.3 }).stays, -200)

// ── what a show nets after the agency's and management's cuts ──
assert.equal(showNet({ guarantee: 10000 }), 10000)
assert.equal(showNet({ guarantee: 10000, viaAgency: true, agencyCommissionPct: 10, managementCommissionPct: 5 }), 8500)
assert.equal(showNet({ guarantee: 10000, viaAgency: false, agencyCommissionPct: 10, managementCommissionPct: 5 }), 10000)   // cuts only count when booked through an agency
assert.equal(showNet({ guarantee: 10000, viaAgency: true }), 10000)                                                           // an agency with no rate set takes nothing
assert.equal(showNet({ guarantee: 3333.33, viaAgency: true, agencyCommissionPct: 10 }), 3000)                                 // to the cent
assert.equal(showNet({}), 0)
assert.equal(showNet({ guarantee: 0 }), 0)

// ── where an invoice stands today: the due date decides ──
const TODAY = '2026-10-19'
assert.equal(invoiceState({ status: 'sent', dueDate: '2026-10-18' }, TODAY), 'overdue')      // a sent invoice past due is overdue even if nobody marked it
assert.equal(invoiceState({ status: 'sent', dueDate: '2026-10-19' }, TODAY), 'sent')         // due today is not yet overdue
assert.equal(invoiceState({ status: 'sent', dueDate: '2026-11-30' }, TODAY), 'sent')
assert.equal(invoiceState({ status: 'overdue', dueDate: '2026-10-01' }, TODAY), 'overdue')
assert.equal(invoiceState({ status: 'overdue', dueDate: '2026-12-01' }, TODAY), 'sent')       // marked overdue, but the date has not come: still just sent
for (const status of ['draft', 'paid', 'void'] as const) assert.equal(invoiceState({ status, dueDate: '2026-01-01' }, TODAY), status)   // these never become overdue

// ── royalties owed, per currency, euros included ──
assert.deepEqual(royaltiesOwed([{ amount: 17000, currency: 'USD' }, { amount: 40000, currency: 'GBP' }, { amount: 2500, currency: 'EUR' }, { amount: 1000, currency: 'USD' }]), { USD: 18000, GBP: 40000, EUR: 2500 })
assert.deepEqual(royaltiesOwed([]), {})

// ── totals on one line ──
assert.equal(formatTotals({ USD: 1500, GBP: 250, EUR: 80 }), '$1,500 · £250 · €80')
assert.equal(formatTotals({ EUR: 80, USD: 1500 }), '$1,500 · €80')                          // dollars, pounds, euros, in that order
assert.equal(formatTotals({ GBP: 250 }), '£250')
// money is never rounded on screen: cents show when there are cents, and only then
assert.deepEqual([fmtMoney(1250, 'USD'), fmtMoney(1250.5, 'USD'), fmtMoney(0.07, 'EUR'), fmtMoney(-80.25, 'GBP'), fmtMoney(1000000, 'USD')], ['$1,250', '$1,250.50', '€0.07', '-£80.25', '$1,000,000'])
assert.equal(formatTotals({ USD: 1250.5, EUR: 80 }), '$1,250.50 · €80')
// float noise and negative zero never reach the screen
assert.equal(fmtMoney(0.1 + 2.7 + 0.2, 'USD'), '$3', '3.0000000000000004 is $3, not $3.00')
assert.equal(fmtMoney(-1e-14, 'USD'), '$0', 'a remainder of nothing is $0, not -$0')
assert.equal(fmtMoney(-0, 'EUR'), '€0')
assert.equal(fmtMoney(1234.565, 'USD'), '$1,234.57')
assert.equal(fmtMoney(splitDeposit(103, { mgmt: 0.3, lawyer: 0.3, taxes: 0.4 }).stays, 'USD'), '$0', 'a split that gives away all of it leaves $0')
assert.equal(fmtMoney(splitDeposit(10.29, { mgmt: 0.5, lawyer: 0.25, taxes: 0.25 }).stays, 'USD'), '$0')
assert.equal(formatTotals({ USD: 0 }), '')                                                    // nothing owed: nothing shown
assert.equal(formatTotals({}), '')
assert.equal(formatTotals({ USD: 0, GBP: 40000 }), '£40,000')                                 // a zero is left out
assert.equal(formatTotals({ JPY: 5000, USD: 10 }), '$10 · ¥5,000')                           // other currencies follow
assert.equal(formatTotals({ USD: 1200, GBP: 800 }, (n, c) => `${c} ${n}`), 'USD 1200 · GBP 800')   // a screen can write amounts its own way

// ── what an invoice still has to collect ──
const inv22 = { id: 'i1', currency: 'USD' as const, ...items([1, 22000]) }
const dep = (amount: number, invoiceId: string | undefined, currency: 'USD' | 'GBP' | 'EUR' = 'USD') => ({ amount, invoiceId, currency })
assert.equal(invoiceOutstanding(inv22, []), 22000, 'nothing paid: the whole invoice is owed')
assert.equal(invoiceOutstanding(inv22, [dep(11000, 'i1'), dep(5000, 'i1')]), 6000, 'part paid: the deposits that pay it come off')
assert.equal(invoiceOutstanding(inv22, [dep(22000, 'i1')]), 0, 'paid in full: nothing owed')
assert.equal(invoiceOutstanding(inv22, [dep(30000, 'i1')]), 0, 'overpaid never goes below zero')
assert.equal(invoiceOutstanding(inv22, [dep(11000, 'other-invoice'), dep(500, undefined)]), 22000, 'deposits for other invoices, or none, do not count')
assert.equal(invoiceOutstanding(inv22, [dep(11000, 'i1', 'GBP')]), 22000, 'pounds are never taken off a dollar invoice')
assert.equal(invoiceOutstanding({ id: 'i2', currency: 'USD', ...items([3, 0.1]) }, [dep(0.1, 'i2')]), 0.2, 'to the cent, no float noise')

// ── an unpaid invoice and the settlement balance are one claim, but no money may go missing ──
const showsList = [{ id: 's1', invoiceId: 'i1' }, { id: 's2', invoiceId: undefined }, { id: 's3', invoiceId: 'i3' }, { id: 's4', invoiceId: 'i1' }]
const sent = { ...inv22, status: 'sent' as const }
const paidInv = { id: 'i3', currency: 'USD' as const, status: 'paid' as const, ...items([1, 5000]) }
const rest = (showIds: string[], balance: number, invoices: Parameters<typeof settlementBalancesNotOnInvoices>[2], deposits: Parameters<typeof settlementBalancesNotOnInvoices>[3] = [], currency: 'USD' | 'GBP' | 'EUR' = 'USD', listed?: Set<string>) =>
  settlementBalancesNotOnInvoices([{ id: 'st', showIds, currency, balance }], showsList, invoices, deposits, listed).st
assert.equal(rest(['s1'], 22000, [sent]), 0, 'a sent invoice for the whole balance says it all')
assert.equal(rest(['s1'], 6000, [sent], [dep(16000, 'i1')]), 0, 'part paid: the invoice still has 6,000 to collect, which is the balance')
assert.equal(rest(['s1'], 14000, [{ ...sent, ...items([1, 6000]) }]), 8000, 'a balance bigger than the invoice keeps the excess (a bonus or overage the invoice never billed)')
assert.equal(rest(['s1', 's2'], 21000, [{ ...sent, ...items([1, 6000]) }]), 15000, 'a settlement for two shows, only one invoiced: the other show\'s money stays')
assert.equal(rest(['s1', 's4'], 12000, [{ ...sent, ...items([1, 12000]) }]), 0, 'two shows pointing at the same invoice: it covers its own 12,000')
assert.equal(rest(['s1', 's4'], 20000, [{ ...sent, ...items([1, 12000]) }]), 8000, 'and it is counted once, not once per show (counting it twice would hide the other 8,000)')
assert.equal(rest(['s1'], 1000, [sent]), 0, 'an invoice bigger than the balance (a payment only recorded on the settlement) never invents money')
assert.equal(rest(['s1'], 6000, [{ ...sent, status: 'overdue' }], [dep(16000, 'i1')]), 0, 'an overdue invoice stands for it too')
assert.equal(rest(['s1'], 22000, [{ ...sent, status: 'draft' }]), 22000, 'a draft was never sent, so the whole balance stays')
assert.equal(rest(['s1'], 6000, [sent], [dep(22000, 'i1')]), 6000, 'an invoice paid off by deposits no longer stands for anything')
assert.equal(rest(['s3'], 7000, [paidInv]), 7000, 'a paid invoice is not a claim, so a balance still owed is kept')
assert.equal(rest(['s1'], 6000, [sent], [], 'GBP'), 6000, 'an invoice in another currency is a different claim')
assert.equal(rest(['s2'], 6000, [sent]), 6000, 'a show with no invoice has nothing standing for it')
assert.equal(rest([], 6000, [sent]), 6000)
assert.equal(rest(['s1'], 0, [sent]), 0, 'nothing owed stays nothing')
// a screen that lists only some invoices: an invoice that is not on screen cannot stand in for a balance that is
assert.equal(rest(['s1'], 22000, [sent], [], 'USD', new Set()), 22000, 'an invoice not listed covers nothing')
assert.equal(rest(['s1'], 22000, [sent], [], 'USD', new Set(['i1'])), 0, 'one that is listed does')
assert.equal(rest(['s1'], 22000, [sent], [], 'USD', new Set(['someone-else'])), 22000)
// one invoice, several settlements: its amount is shared out ONCE (two settlements must not each be credited all of it)
const twoSettlements = (a: number, b: number, invoiceRate: number) => settlementBalancesNotOnInvoices(
  [{ id: 'A', showIds: ['s1'], currency: 'USD', balance: a }, { id: 'B', showIds: ['s4'], currency: 'USD', balance: b }], showsList, [{ ...sent, ...items([1, invoiceRate]) }], [])
assert.deepEqual(twoSettlements(10000, 15000, 20000), { A: 0, B: 5000 }, 'the invoice covers A, then what is left of it covers part of B: 10,000 + 15,000 owed, 20,000 invoiced, 5,000 left over')
assert.deepEqual(twoSettlements(10000, 15000, 5000), { A: 5000, B: 15000 }, 'a small invoice covers only the first it reaches')
assert.deepEqual(twoSettlements(3000, 4000, 20000), { A: 0, B: 0 }, 'a big invoice covers both')
assert.equal(Object.values(twoSettlements(10000, 15000, 20000)).reduce((a, b) => a + b, 0) + 20000, 25000, 'the invoice plus what is left over is exactly what is owed')
// the same figures whichever order the settlements arrive in (the credit is handed out by id, not by list position)
const twoReversed = (a: number, b: number, invoiceRate: number) => settlementBalancesNotOnInvoices(
  [{ id: 'B', showIds: ['s4'], currency: 'USD', balance: b }, { id: 'A', showIds: ['s1'], currency: 'USD', balance: a }], showsList, [{ ...sent, ...items([1, invoiceRate]) }], [])
assert.deepEqual(twoReversed(10000, 15000, 20000), { A: 0, B: 5000 }, 'listed the other way round: the same answer')
assert.deepEqual(twoReversed(10000, 15000, 5000), { A: 5000, B: 15000 }, 'a small invoice still covers A first, even when B is listed first')
// the figure must not depend on the order the settlements were loaded in, however the shows and invoices cross-link
const cross = [{ id: 'i1', status: 'sent' as const, currency: 'USD' as const, ...items([1, 100]) }, { id: 'i2', status: 'sent' as const, currency: 'USD' as const, ...items([1, 100]) }]
const crossShows = [{ id: 'A', invoiceId: 'i1' }, { id: 'B', invoiceId: 'i2' }, { id: 'C', invoiceId: 'i1' }]
const S1 = { id: 'S1', showIds: ['A', 'B'], currency: 'USD' as const, balance: 100 }, S2 = { id: 'S2', showIds: ['C'], currency: 'USD' as const, balance: 100 }
const shown = (list: typeof S1[], inv: typeof cross = cross) => { const r = settlementBalancesNotOnInvoices(list, crossShows, inv, []); return { r, total: inv.length * 100 + Object.values(r).reduce((a, b) => a + b, 0) } }
for (const order of [[S1, S2], [S2, S1]]) assert.equal(shown(order).total, 200, 'invoices of 200 for settlements of 200: 200 is shown, in either order (not 300)')
assert.deepEqual(shown([S1, S2]).r, shown([S2, S1]).r, 'and every settlement gets the same figure whichever order they come in')
assert.equal(shown([{ ...S1, showIds: ['B', 'A'] }, S2]).total, 200, 'and whichever order a settlement lists its shows')
const lopsided = [{ ...S1, balance: 300 }, S2]
assert.equal(shown(lopsided).total, 400, 'owed 400 against invoices of 200: 200 from the invoices plus the 200 they do not cover')
// an overpaid settlement (negative balance) neither invents nor eats anyone else's money
const overpaid = [{ id: 'X', showIds: ['A'], currency: 'USD' as const, balance: -50 }, { id: 'Y', showIds: ['C'], currency: 'USD' as const, balance: 100 }, { id: 'Z', showIds: ['A'], currency: 'USD' as const, balance: 100 }]
const op = settlementBalancesNotOnInvoices(overpaid, crossShows, [cross[0]], [])
assert.equal(op.X, 0, 'nothing is owed on the overpaid one'); assert.equal(100 + op.X + op.Y + op.Z, 200, 'one $100 invoice, $200 owed on the others: $200 shown, not $150')
// ...and an overpaid settlement does not shrink what a big enough invoice covers for the others
const op2 = settlementBalancesNotOnInvoices(overpaid, crossShows, [{ ...cross[0], ...items([1, 200]) }], [])
assert.deepEqual(op2, { X: 0, Y: 0, Z: 0 }, 'a $200 invoice covers the $200 owed on the other two in full, whatever the overpaid one says')

// ── an invoice whose deposits cover it is paid, whatever it says ──
const stateOf = (inv: Parameters<typeof invoiceStateWithDeposits>[0], deposits: Parameters<typeof invoiceStateWithDeposits>[2] = []) => invoiceStateWithDeposits(inv, '2026-10-19', deposits)
const live = { ...inv22, status: 'sent' as const, dueDate: '2026-10-14' }
assert.equal(stateOf(live), 'overdue', 'no deposits: the due date decides, as before')
assert.equal(stateOf(live, [dep(16000, 'i1')]), 'overdue', 'part paid is still overdue')
assert.equal(stateOf(live, [dep(22000, 'i1')]), 'paid', 'fully covered by deposits is paid')
assert.equal(stateOf(live, [dep(30000, 'i1')]), 'paid', 'overpaid is paid')
assert.equal(stateOf(live, [dep(22000, 'i1', 'GBP')]), 'overdue', 'pounds do not pay a dollar invoice')
assert.equal(stateOf(live, [dep(22000, 'other')]), 'overdue', "someone else's deposit does not")
assert.equal(stateOf({ ...live, status: 'draft' }, [dep(22000, 'i1')]), 'draft', 'a draft stays a draft')
assert.equal(stateOf({ ...live, status: 'void' }, [dep(22000, 'i1')]), 'void', 'a void invoice stays void')
assert.equal(stateOf({ id: 'z', currency: 'USD', status: 'sent', dueDate: '2026-11-30', ...items() }, [dep(0, 'z')]), 'sent', 'a zero-value invoice with a zero deposit is not "paid off by money"')

// ── marking a part-paid invoice as paid: how much of it is not logged as a deposit yet (told to the person, never invented) ──
assert.equal(unloggedWhenPaid(inv22, [dep(16000, 'i1')]), 6000, 'part paid: the rest is not logged')
assert.equal(unloggedWhenPaid(inv22, [dep(11000, 'i1'), dep(5000, 'i1')]), 6000, 'across several deposits')
assert.equal(unloggedWhenPaid(inv22, []), 0, 'no deposit points at it: the invoice itself stands for the money, nothing to say')
assert.equal(unloggedWhenPaid(inv22, [dep(22000, 'i1')]), 0, 'already covered')
assert.equal(unloggedWhenPaid(inv22, [dep(30000, 'i1')]), 0, 'overpaid')
assert.equal(unloggedWhenPaid(inv22, [dep(5000, 'i1', 'GBP')]), 0, 'a deposit in another currency is not a part payment')
assert.equal(unloggedWhenPaid(inv22, [dep(5000, 'other')]), 0, "someone else's deposit")

// ── what is owed, per currency ──
const gbp = { id: 'g1', currency: 'GBP' as const, ...items([1, 1000]) }
assert.deepEqual(owedByCurrency([inv22, gbp], [dep(16000, 'i1'), dep(250, 'g1', 'GBP')]), { USD: 6000, GBP: 750 }, 'each invoice less its own deposits, never mixed across currencies')
assert.deepEqual(owedByCurrency([], []), {})
assert.deepEqual(owedByCurrency([inv22], [dep(22000, 'i1')]), { USD: 0 }, 'paid off: zero')

console.log('money checks passed')
