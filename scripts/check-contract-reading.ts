// Checks how an AI reading of a contract becomes the contract form: only sensible values, the sentence each came from, and what to check.
// Run with:  npx tsx scripts/check-contract-reading.ts
import assert from 'node:assert/strict'
import { readingToDraft, type ContractReading } from '../src/lib/contract-reading'

const reading = (o: Partial<ContractReading> = {}): ContractReading => ({
  title: 'Management Agreement', counterparty: 'Noted Management', type: 'management', status: 'signed',
  signedDate: '2026-01-15', expiryDate: '2029-01-15', autoRenews: true, renewalMonths: 12, noticeDays: 60, value: 0, currency: 'not stated',
  terms: [{ key: 'commission', value: '20% of gross' }, { key: 'sunset', value: '15% for 3 years' }],
  quotes: [
    { field: 'counterparty', quote: 'between Dana Artist and Noted Management LLC', sure: true },
    { field: 'expiryDate', quote: 'The Term shall continue for three (3) years', sure: false },
    { field: 'noticeDays', quote: 'sixty (60) days prior written notice', sure: true },
    { field: 'terms.commission', quote: 'Manager shall receive twenty percent (20%) of Gross Income', sure: true },
  ],
  checkThese: ['The end date is calculated from the first day of the Term', '  ', 'a', 'b', 'c', 'd', 'e'],
  ...o,
})

// ── a clean reading fills the form ──
const r = readingToDraft(reading())
assert.deepEqual([r.draft.title, r.draft.counterparty, r.draft.type, r.draft.status], ['Management Agreement', 'Noted Management', 'management', 'signed'])
assert.deepEqual([r.draft.signedDate, r.draft.expiryDate, r.draft.autoRenews, r.draft.renewalMonths, r.draft.noticeDays], ['2026-01-15', '2029-01-15', true, '12', '60'])
assert.deepEqual(r.draft.terms, { commission: '20% of gross', sunset: '15% for 3 years' })
assert.equal(r.draft.value, '', 'no value written: blank')
assert.deepEqual(r.draft.files, [], 'the reader does not attach anything; the form does')

// ── the sentence each answer came from ──
assert.equal(r.notes.noticeDays.quote, 'sixty (60) days prior written notice')
assert.equal(r.notes['terms.commission'].quote, 'Manager shall receive twenty percent (20%) of Gross Income')
assert.equal(r.notes.title, undefined, 'no quote given for the title: none shown')

// ── what to check: unsure ones, and filled ones with no sentence to point at ──
assert.equal(r.check.has('expiryDate'), true, 'the reader was not sure')
assert.equal(r.check.has('noticeDays'), false, 'sure, with a sentence')
assert.equal(r.check.has('counterparty'), false)
assert.equal(r.check.has('title'), true, 'filled in with nothing to point at')
assert.equal(r.check.has('terms.sunset'), true, 'a key term with no sentence')
assert.equal(r.check.has('status'), true, '"signed" is a claim about the document: always look')
assert.equal(r.check.has('type'), false, 'the reader\'s own judgement of what kind it is: not flagged')
assert.equal(r.check.has('autoRenews'), true)
assert.deepEqual(r.checkThese, ['The end date is calculated from the first day of the Term', 'a', 'b', 'c', 'd', 'e'], 'blank lines dropped, six at most')
assert.equal(readingToDraft(reading({ checkThese: ['1', '2', '3', '4', '5', '6', '7', '8'] })).checkThese.length, 6)
assert.equal(readingToDraft(reading({ status: 'draft' })).check.has('status'), false)

// ── nonsense is not put in the form ──
const bad = readingToDraft(reading({
  type: 'wizardry', status: 'maybe', signedDate: '2026-13-45', expiryDate: 'next year', renewalMonths: 0, noticeDays: -1, value: -5, currency: 'XYZ',
  terms: [{ key: 'bogus', value: 'x' }, { key: 'commission', value: '   ' }], quotes: [{ field: 'value', quote: 'q', sure: true }, { field: 'title', quote: '', sure: true }],
}))
assert.equal(bad.draft.type, 'other', 'an unknown kind of contract is "other"')
assert.equal(bad.draft.status, 'draft', 'only a clear "signed" counts')
assert.deepEqual([bad.draft.signedDate, bad.draft.expiryDate], ['', ''], 'impossible dates are blank')
assert.deepEqual([bad.draft.renewalMonths, bad.draft.noticeDays, bad.draft.value], ['', '', ''])
assert.deepEqual(bad.draft.terms, {}, '"other" has no boxes, and blank text is nothing')
assert.equal(bad.notes.value, undefined, 'a sentence for a box that stayed empty is dropped')
assert.equal(bad.notes.title, undefined, 'an empty quote is no quote')
assert.equal(readingToDraft(reading({ renewalMonths: 121 })).draft.renewalMonths, '')
assert.equal(readingToDraft(reading({ renewalMonths: 6.5 })).draft.renewalMonths, '')
assert.equal(readingToDraft(reading({ autoRenews: false, renewalMonths: 12 })).draft.renewalMonths, '', 'a renewal length without automatic renewal means nothing')
assert.equal(readingToDraft(reading({ noticeDays: 0 })).draft.noticeDays, '0', 'zero days of notice is real')
assert.equal(readingToDraft(reading({ noticeDays: 1001 })).draft.noticeDays, '')
assert.equal(readingToDraft(reading({ title: 'x'.repeat(300) })).draft.title.length, 120)

// ── money ──
const money = readingToDraft(reading({ value: 25000, currency: 'EUR' }))
assert.deepEqual([money.draft.value, money.draft.currency], ['25000', 'EUR'])
const noCur = readingToDraft(reading({ value: 25000, currency: 'not stated' }))
assert.deepEqual([noCur.draft.value, noCur.draft.currency, noCur.check.has('value')], ['25000', 'USD', true], 'no currency written: dollars, and look at it')
assert.equal(readingToDraft(reading({ value: 25000, currency: 'other' })).draft.currency, 'USD')

// ── the key terms follow the kind of contract ──
const sync = readingToDraft(reading({ type: 'sync', terms: [{ key: 'use', value: 'TV series' }, { key: 'commission', value: '20%' }] }))
assert.deepEqual(sync.draft.terms, { use: 'TV series' }, 'a box from another kind of contract is dropped')

// ── an empty or odd reading never breaks ──
const none = readingToDraft({ title: '', counterparty: '', type: '', status: '', signedDate: '', expiryDate: '', autoRenews: false, renewalMonths: 0, noticeDays: -1, value: 0, currency: '', terms: [], quotes: [], checkThese: [] })
assert.deepEqual([none.draft.title, none.draft.type, none.draft.status, none.check.has('title')], ['', 'other', 'draft', false])
assert.equal(readingToDraft({ ...reading(), terms: undefined as never, quotes: undefined as never, checkThese: undefined as never }).draft.terms !== undefined, true)

console.log('contract-reading checks passed')
