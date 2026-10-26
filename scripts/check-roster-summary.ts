// Checks the one line each artist gets on the "All artists" Music page, and the owed-money figures the Overview shows.
// Run with:  npx tsx scripts/check-roster-summary.ts
import assert from 'node:assert/strict'
import { owedFigures, summarize, type SummaryClient } from '../src/lib/roster-summary'
import type { Album, Deposit, Invoice, Track } from '../src/types'

const TODAY = '2026-10-21'

const track = (id: string, stage: Track['stage']): Track => ({ id, num: 1, title: id, stage, version: 1, touched: 'now' })
const album = (o: Partial<Album> & { id: string }): Album => ({ title: 'Night Shift EP', tracks: [], ...o })
const invoice = (o: Partial<Invoice> & { id: string }): Invoice => ({
  number: o.id, to: 'Promoter', category: 'Shows' as Invoice['category'], status: 'sent', issuedDate: '2026-09-01', dueDate: '2026-11-30',
  items: [{ description: 'Fee', quantity: 1, rate: 1000 }], currency: 'USD', ...o,
})
const client = (o: { albums?: Album[]; invoices?: Invoice[]; deposits?: Deposit[] } = {}): SummaryClient => ({
  tour: { shows: [] }, songs: { albums: o.albums ?? [] }, finance: { invoices: o.invoices ?? [] },
  business: { banking: { deposits: o.deposits ?? [] } }, legal: { contracts: [] },
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

// ── What is still owed on invoices (the Overview shows it): per currency, and what is late ──
assert.deepEqual(owedFigures(client(), TODAY), { owed: '', open: 0, overdue: 0 })
const f1 = owedFigures(client({ invoices: [
  invoice({ id: 'i1', dueDate: '2026-10-01' }),                              // overdue by date, $1,000
  invoice({ id: 'i2', status: 'overdue', dueDate: '2026-11-30' }),           // stored as overdue but not due yet: just open
  invoice({ id: 'i3', currency: 'EUR', items: [{ description: 'Fee', quantity: 2, rate: 250 }] }),
  invoice({ id: 'i4', status: 'paid' }), invoice({ id: 'i5', status: 'draft' }), invoice({ id: 'i6', status: 'void' }),
] }), TODAY)
assert.equal(f1.owed, '$2,000 · €500', 'draft, paid and void are not owed; currencies are never mixed')
assert.deepEqual([f1.open, f1.overdue], [3, 1])
assert.deepEqual(owedFigures(client({ invoices: [invoice({ id: 'i1' })] }), TODAY), { owed: '$1,000', open: 1, overdue: 0 })
assert.deepEqual(owedFigures(client({ invoices: [invoice({ id: 'i4', status: 'paid' })] }), TODAY), { owed: '', open: 0, overdue: 0 }, 'has invoices, all settled')
// a deposit that part-pays an invoice reduces what is owed; one that pays it fully makes it not owed at all
const dep = (invoiceId: string, amount: number): Deposit => ({ id: `d-${invoiceId}`, name: 'Pay', date: '2026-10-10', amount, currency: 'USD', mgmt: 0.1, lawyer: 0, taxes: 0, done: true, invoiceId })
assert.equal(owedFigures(client({ invoices: [invoice({ id: 'i1' })], deposits: [dep('i1', 400)] }), TODAY).owed, '$600', 'part paid')
assert.deepEqual(owedFigures(client({ invoices: [invoice({ id: 'i1' })], deposits: [dep('i1', 1000)] }), TODAY), { owed: '', open: 0, overdue: 0 }, 'fully paid by a deposit')

console.log('roster-summary checks passed')
