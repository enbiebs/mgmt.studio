// Checks the "do we already have this bill?" warning.  Run with:  npx tsx scripts/check-bill-duplicates.ts
import assert from 'node:assert/strict'
import { findDuplicateBills, type BillCandidate } from '../src/lib/bill-duplicates'
import type { Expense } from '../src/types'

let n = 0
const check = (name: string, fn: () => void) => { fn(); n++; console.log('  ok  ' + name) }
const bill = (id: string, o: Partial<Expense> = {}): Expense => ({ id, description: 'Van hire', vendor: 'Vans Inc', amount: 800.5, currency: 'USD', category: 'travel', date: '2026-10-01', paid: false, billNumber: 'B-0042', ...o } as Expense)
const cand = (o: Partial<BillCandidate> = {}): BillCandidate => ({ vendor: 'Vans Inc', billNumber: 'B-0042', amount: 800.5, currency: 'USD', date: '2026-10-02', ...o })
const ids = (r: ReturnType<typeof findDuplicateBills>) => r.map(x => `${x.bill.id}:${x.why}`)

check('the same vendor and the same number is the same bill, whatever the amount or date', () => {
  assert.deepEqual(ids(findDuplicateBills([bill('b1')], cand({ amount: 99, date: '2027-01-01' }))), ['b1:same-number'])
})
check('numbers written differently are still the same number', () => {
  for (const n of ['b-0042', 'B 0042', '#B-42', 'Invoice B-0042']) assert.deepEqual(ids(findDuplicateBills([bill('b1', { billNumber: 'B-42' })], cand({ billNumber: n, amount: 1 }))), ['b1:same-number'], n)
  assert.deepEqual(ids(findDuplicateBills([bill('b1', { billNumber: '0042' })], cand({ billNumber: 'No. 42', amount: 1 }))), ['b1:same-number'])
})
check('different numbers with different amounts are different bills', () => {
  assert.deepEqual(findDuplicateBills([bill('b1')], cand({ billNumber: 'B-0043', amount: 120 })), [])
})
check('no bill number on either: the same amount within a week is probably the same bill', () => {
  assert.deepEqual(ids(findDuplicateBills([bill('b1', { billNumber: undefined })], cand({ billNumber: undefined, date: '2026-10-07' }))), ['b1:same-amount'])
  assert.deepEqual(findDuplicateBills([bill('b1', { billNumber: undefined })], cand({ billNumber: undefined, date: '2026-10-20' })), [], 'weeks apart is a different month\'s van')
})
check('two different bill numbers are two bills, even for the same amount a few days apart (a flat weekly bill is not a duplicate)', () => {
  assert.deepEqual(findDuplicateBills([bill('b1')], cand({ billNumber: 'B-0099' })), [])
})
check('a number on only one of the two, with the same amount close together, is still worth a look', () => {
  assert.deepEqual(ids(findDuplicateBills([bill('b1', { billNumber: undefined })], cand({ billNumber: 'B-0099' }))), ['b1:same-amount'])
  assert.deepEqual(ids(findDuplicateBills([bill('b1')], cand({ billNumber: undefined }))), ['b1:same-amount'])
})
check('another currency, or another vendor, is never a match', () => {
  assert.deepEqual(findDuplicateBills([bill('b1')], cand({ billNumber: 'x', currency: 'GBP' })), [])
  assert.deepEqual(findDuplicateBills([bill('b1')], cand({ vendor: 'Hotel Co' })), [])
  assert.deepEqual(findDuplicateBills([bill('b1', { vendor: '' })], cand({ vendor: '' })), [], 'two blank vendors are not the same vendor')
})
check('vendor names are compared the way people write them', () => {
  for (const v of ['VANS INC.', 'vans, inc', 'Vans']) assert.deepEqual(ids(findDuplicateBills([bill('b1')], cand({ vendor: v }))), ['b1:same-number'], v)
  assert.deepEqual(ids(findDuplicateBills([bill('b1', { vendorId: 'v1', vendor: 'Vans Inc' })], cand({ vendorId: 'v1', vendor: 'Totally Different Name' }))), ['b1:same-number'], 'the saved vendor decides when both have one')
  assert.deepEqual(findDuplicateBills([bill('b1', { vendorId: 'v1' })], cand({ vendorId: 'v2' })), [])
})
check('the surest match comes first, and the bill being edited is not its own duplicate', () => {
  const r = findDuplicateBills([bill('a', { billNumber: undefined }), bill('b'), bill('me')], cand(), 'me')
  assert.deepEqual(ids(r), ['b:same-number', 'a:same-amount'])
})
check('a bill with no amount yet matches nothing by amount', () => {
  assert.deepEqual(findDuplicateBills([bill('b1', { billNumber: undefined, amount: 0 })], cand({ billNumber: undefined, amount: 0 })), [])
})
console.log(`${n} checks passed`)
