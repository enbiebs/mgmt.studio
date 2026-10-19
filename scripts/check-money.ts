// Checks the small money sums every screen shares: invoice totals, per-currency totals, and how a deposit divides up.  Run with:  npx tsx scripts/check-money.ts
import assert from 'node:assert/strict'
import { invoiceTotal, r2, splitDeposit, sumByCurrency } from '../src/lib/money'
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
// shares are rounded to whole units, and the remainder stays, so the four ALWAYS add back to the amount
for (const [amount, mgmt, lawyer, taxes] of [[1234.56, 0.18, 0.06, 0.4], [999, 0.333, 0.333, 0.333], [17, 0.1, 0.1, 0.1], [50000, 0.2, 0.06, 0.4]] as const) {
  const s = splitDeposit(amount, { mgmt, lawyer, taxes })
  assert.equal(r2(s.mgmt + s.lawyer + s.taxes + s.stays), amount, `split of ${amount} adds back up`)
  assert.equal(Number.isInteger(s.mgmt) && Number.isInteger(s.lawyer) && Number.isInteger(s.taxes), true)
}
assert.deepEqual(splitDeposit(17, { mgmt: 0.1, lawyer: 0.1, taxes: 0.1 }), { mgmt: 2, lawyer: 2, taxes: 2, stays: 11 })     // 1.7 rounds up to 2
// shares that add to more than 100% leave a negative remainder rather than hiding it
assert.equal(splitDeposit(1000, { mgmt: 0.5, lawyer: 0.4, taxes: 0.3 }).stays, -200)

console.log('money checks passed')
