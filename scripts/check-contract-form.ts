// Checks the contract form: what is accepted, what is saved, and that editing and saving again changes nothing.
// Run with:  npx tsx scripts/check-contract-form.ts
import assert from 'node:assert/strict'
import { contractProblem, contractProblemFor, contractToDraft, counterpartyFromBlanks, draftToContract, emptyDraft, typeFromName, type ContractDraft } from '../src/lib/contract-form'
import type { Contract } from '../src/types'

const BASE = { id: 'ct-1', createdAt: '2026-10-26' }
const draft = (o: Partial<ContractDraft> = {}): ContractDraft => ({ ...emptyDraft(), title: 'Mgmt deal', counterparty: 'Noted', ...o })

// ── what is accepted ──
assert.equal(contractProblem(draft()), null, 'a name and who it is with is enough')
assert.match(contractProblem(draft({ title: '  ' }))!, /name/)
assert.match(contractProblem(draft({ counterparty: '' }))!, /who/i)
assert.match(contractProblem(draft({ signedDate: '2026-05-01', expiryDate: '2026-04-30' }))!, /before/)
assert.equal(contractProblem(draft({ signedDate: '2026-05-01', expiryDate: '2026-05-01' })), null, 'it may end the day it starts')
assert.equal(contractProblem(draft({ expiryDate: '2026-04-30' })), null, 'one date alone is fine')
for (const bad of ['-1', '1001', '2.5', 'abc']) assert.match(contractProblem(draft({ noticeDays: bad }))!, /notice/i, `notice "${bad}"`)
for (const ok of ['', '0', '60', '1000', ' 30 ']) assert.equal(contractProblem(draft({ noticeDays: ok })), null, `notice "${ok}"`)
assert.match(contractProblem(draft({ autoRenews: true, expiryDate: '2026-12-01', renewalMonths: '0' }))!, /renewal/i)
assert.match(contractProblem(draft({ autoRenews: true, expiryDate: '2026-12-01', renewalMonths: '121' }))!, /renewal/i)
assert.equal(contractProblem(draft({ autoRenews: true, expiryDate: '2026-12-01', renewalMonths: '' })), null, 'blank renewal length means the usual 12')
assert.equal(contractProblem(draft({ autoRenews: false, renewalMonths: '999' })), null, 'a renewal length on a contract that does not renew is ignored, not an error')
assert.match(contractProblem(draft({ autoRenews: true }))!, /first term/i, 'renewing by itself needs an end date to start from')
assert.match(contractProblem(draft({ value: '-5' }))!, /negative/i)
assert.match(contractProblem(draft({ value: 'lots' }))!, /must be a number/i)
assert.match(contractProblem(draft({ value: '1,5' }))!, /must be a number/i, '"1,5" is not fifteen')
assert.match(contractProblem(draft({ value: '25,00' }))!, /must be a number/i)
assert.equal(contractProblem(draft({ value: '1,250.50' })), null)
assert.equal(draftToContract(draft({ value: '1,250.50' }), BASE).value, 1250.5)
assert.equal(contractProblem(draft({ value: '25,000' })), null, 'a comma in a number is fine')

// ── which box the problem is in (so the form can point at it) ──
assert.equal(contractProblemFor(draft({ title: '' }))!.field, 'title')
assert.equal(contractProblemFor(draft({ counterparty: '' }))!.field, 'counterparty')
assert.equal(contractProblemFor(draft({ signedDate: '2026-05-01', expiryDate: '2026-04-30' }))!.field, 'expiryDate')
assert.equal(contractProblemFor(draft({ noticeDays: '-3' }))!.field, 'noticeDays')
assert.equal(contractProblemFor(draft({ autoRenews: true, expiryDate: '2027-01-01', renewalMonths: '0' }))!.field, 'renewalMonths')
assert.equal(contractProblemFor(draft({ value: 'x' }))!.field, 'value')
assert.equal(contractProblemFor(draft({ autoRenews: true }))!.field, 'expiryDate')
assert.equal(contractProblemFor(draft()), null)
assert.equal(contractProblemFor(draft({ title: '', counterparty: '' }))!.field, 'title', 'the first problem is the one shown')

// ── what is saved ──
assert.deepEqual(draftToContract(draft(), BASE), { ...BASE, title: 'Mgmt deal', counterparty: 'Noted', type: 'management', status: 'draft' }, 'only what was filled in')
const full = draftToContract(draft({
  title: ' Deal ', counterparty: ' WME ', type: 'management', status: 'signed', signedDate: '2026-01-01', expiryDate: '2026-12-31',
  autoRenews: true, renewalMonths: '6', noticeDays: '60', value: '25,000', currency: 'EUR', notes: ' note ', flagged: true,
  terms: { commission: ' 20% ', sunset: '', bogus: 'x' }, files: [{ id: 'f1', path: 'c/f.pdf', name: 'f.pdf', label: 'signed copy', addedAt: '2026-10-26' }],
}), BASE)
assert.deepEqual(full, {
  ...BASE, title: 'Deal', counterparty: 'WME', type: 'management', status: 'signed', signedDate: '2026-01-01', expiryDate: '2026-12-31',
  value: 25000, currency: 'EUR', notes: 'note', flagged: true, autoRenews: true, renewalMonths: 6, noticeDays: 60,
  terms: { commission: '20%' }, files: [{ id: 'f1', path: 'c/f.pdf', name: 'f.pdf', label: 'signed copy', addedAt: '2026-10-26' }],
})
assert.equal(draftToContract(draft({ autoRenews: false, renewalMonths: '6' }), BASE).renewalMonths, undefined, 'a renewal length means nothing without automatic renewal')
assert.equal(draftToContract(draft({ noticeDays: '0' }), BASE).noticeDays, 0, 'zero days of notice is kept (it is not "blank")')
assert.equal('value' in draftToContract(draft({ value: '0' }), BASE), false, 'a value of 0 is no value')
assert.equal('currency' in draftToContract(draft({ currency: 'GBP' }), BASE), false, 'a currency alone means nothing')
assert.equal(draftToContract(draft({ type: 'other', terms: { term: '3 years' } }), BASE).terms, undefined, 'a kind of contract with no boxes keeps no terms')
assert.equal(draftToContract(draft({ type: 'sync', terms: { commission: '20%' } }), BASE).terms, undefined, 'a box from another kind is dropped')

// ── editing and saving again changes nothing ──
const saved: Contract = full
const again = draftToContract(contractToDraft(saved), { id: saved.id, createdAt: saved.createdAt })
assert.deepEqual(again, saved, 'open it, change nothing, save: the same contract')
assert.deepEqual(contractToDraft({ ...BASE, title: 'x', counterparty: 'y', type: 'nda', status: 'draft', signedDate: '2026-01-01T00:00:00.000Z' }).signedDate, '2026-01-01', 'a date with a time on it shows as a date')
assert.equal(contractToDraft({ ...BASE, title: 'x', counterparty: 'y', type: 'nda', status: 'draft', noticeDays: 0 }).noticeDays, '0', 'zero notice shows as 0, not blank')
assert.equal(contractToDraft({ ...BASE, title: 'x', counterparty: 'y', type: 'nda', status: 'draft', noticeDays: null as unknown as undefined }).noticeDays, '', 'a missing number from the database shows blank')

// ── a template-made document, saved as a draft contract ──
assert.deepEqual(['NDA (Confidentiality Agreement)', 'Split / Side Artist Agreement', 'Work-for-Hire + NDA', 'Management Agreement', 'Sync licence', 'Publishing admin', 'Merch deal', 'Brand endorsement', 'Booking agency agreement', 'Producer agreement', 'Something else'].map(typeFromName),
  ['nda', 'recording', 'nda', 'management', 'sync', 'publishing', 'merch', 'brand', 'touring', 'recording', 'other'])
assert.equal(counterpartyFromBlanks({ 'ARTIST NAME': 'Nova Lane', 'RECIPIENT NAME': ' Sam Rivers ' }), 'Sam Rivers', 'the other side, not the artist')
assert.equal(counterpartyFromBlanks({ 'SIDE ARTIST NAME': 'Jo', 'SIDE ARTIST': 'Jo Stage' }), 'Jo')
assert.equal(counterpartyFromBlanks({ 'ARTIST NAME': 'Nova Lane', DATE: 'today' }), '', 'nobody named')
assert.equal(counterpartyFromBlanks({ 'recipient name': 'Sam' }), 'Sam', 'case does not matter')
assert.equal(counterpartyFromBlanks({ 'RECIPIENT NAME': '   ', 'CONTRIBUTOR NAME': 'Kim' }), 'Kim', 'a blank blank is skipped')

console.log('contract-form checks passed')
