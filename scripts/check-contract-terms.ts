// Checks the key terms for each kind of contract: which boxes it has, and what gets saved.
// Run with:  npx tsx scripts/check-contract-terms.ts
import assert from 'node:assert/strict'
import { TERM_FIELDS, cleanTerms, termFieldsFor, termsSummary } from '../src/lib/contract-terms'
import type { ContractType } from '../src/types'

const TYPES: ContractType[] = ['management', 'recording', 'publishing', 'sync', 'brand', 'touring', 'nda', 'merch', 'other']
assert.deepEqual(Object.keys(TERM_FIELDS).sort(), [...TYPES].sort(), 'every kind of contract has an entry (even if empty)')

// a management deal is judged on these six
assert.deepEqual(termFieldsFor('management').map(x => x.key), ['term', 'commission', 'sunset', 'key_person', 'exclusivity', 'territory'])
assert.deepEqual(termFieldsFor('other'), [], 'a contract of no particular kind has no boxes')
for (const t of TYPES) {
  const keys = termFieldsFor(t).map(x => x.key)
  assert.equal(new Set(keys).size, keys.length, `${t}: no box twice`)
  assert.equal(termFieldsFor(t).length <= 6, true, `${t}: at most six boxes, so the form stays short`)
  for (const x of termFieldsFor(t)) { assert.match(x.key, /^[a-z]+(_[a-z]+)*$/, `${t}.${x.key} is snake_case`); assert.ok(x.label && x.hint, `${t}.${x.key} has a label and an example`) }
}

// what gets saved: only this kind's boxes, only if something is written, trimmed and not endless
assert.deepEqual(cleanTerms('management', { term: '  3 years ', commission: '20%', sunset: '', key_person: '   ', bogus: 'x' }), { term: '3 years', commission: '20%' })
assert.deepEqual(cleanTerms('sync', { commission: '20%', use: 'TV' }), { use: 'TV' }, 'a box from another kind of contract is dropped')
assert.deepEqual(cleanTerms('other', { term: '3 years' }), {})
assert.deepEqual(cleanTerms('management', undefined), {})
assert.equal(cleanTerms('management', { term: 'x'.repeat(900) }).term.length, 500)
assert.deepEqual(cleanTerms('management', { term: 5 as unknown as string }), {}, 'something that is not text is ignored')

// what the page shows: the filled boxes, in the form's order, with their labels
assert.deepEqual(termsSummary({ type: 'management', terms: { sunset: '15% for 3 years', term: '3 years' } }), [{ label: 'Term', value: '3 years' }, { label: 'Sunset commission', value: '15% for 3 years' }])
assert.deepEqual(termsSummary({ type: 'management' }), [])
assert.deepEqual(termsSummary({ type: 'sync', terms: { commission: 'x' } }), [])

console.log('contract-terms checks passed')
