// Checks the one line each artist gets on the "All artists" Music, Finance and Legal pages.
// Run with:  npx tsx scripts/check-roster-summary.ts
import assert from 'node:assert/strict'
import { summarize, type SummaryClient } from '../src/lib/roster-summary'
import type { Album, Contract, Deposit, Invoice, Track } from '../src/types'

const TODAY = '2026-10-21'

const track = (id: string, stage: Track['stage']): Track => ({ id, num: 1, title: id, stage, version: 1, touched: 'now' })
const album = (o: Partial<Album> & { id: string }): Album => ({ title: 'Night Shift EP', tracks: [], ...o })
const invoice = (o: Partial<Invoice> & { id: string }): Invoice => ({
  number: o.id, to: 'Promoter', category: 'Shows' as Invoice['category'], status: 'sent', issuedDate: '2026-09-01', dueDate: '2026-11-30',
  items: [{ description: 'Fee', quantity: 1, rate: 1000 }], currency: 'USD', ...o,
})
const contract = (o: Partial<Contract> & { id: string }): Contract => ({
  title: 'Deal', type: 'management' as Contract['type'], status: 'signed', counterparty: 'WME', createdAt: '2026-01-01', ...o,
})
const client = (o: { albums?: Album[]; invoices?: Invoice[]; deposits?: Deposit[]; contracts?: Contract[] } = {}): SummaryClient => ({
  tour: { shows: [] }, songs: { albums: o.albums ?? [] }, finance: { invoices: o.invoices ?? [] },
  business: { banking: { deposits: o.deposits ?? [] } }, legal: { contracts: o.contracts ?? [] },
})

// ── Music: the next release, and what is not finished ──
assert.deepEqual(summarize('music', client(), TODAY), { headline: 'No music yet', tone: 'quiet' })
const m1 = summarize('music', client({ albums: [
  album({ id: 'x', title: 'Later', releaseDate: '2027-02-01', tracks: [track('t1', 'done')] }),
  album({ id: 'y', title: 'Night Shift EP', releaseDate: '2026-11-14', tracks: [track('t2', 'mix'), track('t3', 'done'), track('t4', 'track')] }),
  album({ id: 'z', title: 'Old', releaseDate: '2026-01-01', tracks: [track('t5', 'done')] }),
] }), TODAY)
assert.equal(m1.headline, 'Night Shift EP · Nov 14', 'the soonest release still ahead')
assert.equal(m1.detail, 'in 24 days · 2 songs not finished')
assert.equal(m1.tone, 'todo')
assert.equal(summarize('music', client({ albums: [album({ id: 'y', releaseDate: '2026-11-14', tracks: [track('t', 'done')] })] }), TODAY).tone, 'ok', 'everything finished and a date set')
assert.deepEqual(summarize('music', client({ albums: [album({ id: 'y', tracks: [track('t', 'mix')] })] }), TODAY), { headline: 'No release date set', detail: '1 song not finished', tone: 'todo' })
assert.deepEqual(summarize('music', client({ albums: [album({ id: 'y', releaseDate: '2026-01-01', tracks: [track('t', 'done')] })] }), TODAY), { headline: 'Nothing in progress', tone: 'quiet' }, 'already released and finished')
assert.equal(summarize('music', client({ albums: [album({ id: 'y', releaseDate: TODAY, tracks: [] })] }), TODAY).headline, 'Night Shift EP · Oct 21', 'releasing today is still ahead')

// ── Finance: what is still owed, per currency, and what is late ──
assert.deepEqual(summarize('finance', client(), TODAY), { headline: 'Nothing owed', tone: 'quiet' })
const f1 = summarize('finance', client({ invoices: [
  invoice({ id: 'i1', dueDate: '2026-10-01' }),                              // overdue by date, $1,000
  invoice({ id: 'i2', status: 'overdue', dueDate: '2026-11-30' }),           // stored as overdue but not due yet: just open
  invoice({ id: 'i3', currency: 'EUR', items: [{ description: 'Fee', quantity: 2, rate: 250 }] }),
  invoice({ id: 'i4', status: 'paid' }), invoice({ id: 'i5', status: 'draft' }), invoice({ id: 'i6', status: 'void' }),
] }), TODAY)
assert.equal(f1.headline, '$2,000 · €500 owed', 'draft, paid and void are not owed; currencies are never mixed')
assert.equal(f1.detail, '1 invoice overdue')
assert.equal(f1.tone, 'late')
const f2 = summarize('finance', client({ invoices: [invoice({ id: 'i1' })] }), TODAY)
assert.deepEqual(f2, { headline: '$1,000 owed', detail: '1 open invoice', tone: 'todo' })
assert.equal(summarize('finance', client({ invoices: [invoice({ id: 'i1' }), invoice({ id: 'i2' })] }), TODAY).detail, '2 open invoices')
assert.deepEqual(summarize('finance', client({ invoices: [invoice({ id: 'i4', status: 'paid' })] }), TODAY), { headline: 'Nothing owed', tone: 'ok' }, 'has invoices, all settled')
// a deposit that part-pays an invoice reduces what is owed; one that pays it fully makes it not owed at all
const dep = (invoiceId: string, amount: number): Deposit => ({ id: `d-${invoiceId}`, name: 'Pay', date: '2026-10-10', amount, currency: 'USD', mgmt: 0.1, lawyer: 0, taxes: 0, done: true, invoiceId })
assert.equal(summarize('finance', client({ invoices: [invoice({ id: 'i1' })], deposits: [dep('i1', 400)] }), TODAY).headline, '$600 owed', 'part paid')
assert.deepEqual(summarize('finance', client({ invoices: [invoice({ id: 'i1' })], deposits: [dep('i1', 1000)] }), TODAY), { headline: 'Nothing owed', tone: 'ok' }, 'fully paid by a deposit')

// ── Legal: contracts needing attention, worst first ──
assert.deepEqual(summarize('legal', client(), TODAY), { headline: 'No contracts', tone: 'quiet' })
assert.deepEqual(summarize('legal', client({ contracts: [contract({ id: 'c1', expiryDate: '2028-01-01' }), contract({ id: 'c2' })] }), TODAY), { headline: 'All clear', detail: '2 contracts', tone: 'ok' })
assert.deepEqual(summarize('legal', client({ contracts: [contract({ id: 'c1' })] }), TODAY), { headline: 'All clear', detail: '1 contract', tone: 'ok' })
const l1 = summarize('legal', client({ contracts: [
  contract({ id: 'c1', title: 'Kobalt', expiryDate: '2026-12-01' }),         // expiring in 41 days
  contract({ id: 'c2', title: 'WME', expiryDate: '2026-10-01' }),            // expired
  contract({ id: 'c3', title: 'Fine', expiryDate: '2030-01-01' }),
] }), TODAY)
assert.equal(l1.headline, '2 contracts need attention')
assert.equal(l1.detail, 'WME · Expired Oct 1, 2026 (20 days ago)', 'the expired one is named first')
assert.equal(l1.tone, 'late')
const l2 = summarize('legal', client({ contracts: [contract({ id: 'c1', title: 'Kobalt', expiryDate: '2026-12-01' })] }), TODAY)
assert.equal(l2.headline, '1 contract needs attention'); assert.equal(l2.tone, 'todo'); assert.match(l2.detail!, /^Kobalt · Expires Dec 1, 2026 \(in 41 days\)$/)
const l3 = summarize('legal', client({ contracts: [contract({ id: 'c1', title: 'NDA', flagged: true })] }), TODAY)
assert.deepEqual(l3, { headline: '1 contract needs attention', detail: 'NDA · Flagged for review', tone: 'todo' })
assert.equal(summarize('legal', client({ contracts: [contract({ id: 'c1', status: 'draft', expiryDate: '2020-01-01' })] }), TODAY).headline, 'All clear', 'a draft with an old end date is still a draft')

console.log('roster-summary checks passed')
