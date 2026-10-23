// Checks what the artist Overview page shows: next shows, next release, money owed, contracts needing a look,
// and that a block is left out entirely when the person may not open that part.
// Run with:  npx tsx scripts/check-artist-overview.ts
import assert from 'node:assert/strict'
import { buildOverview, overviewAccessFor, type OverviewAccess, type OverviewClient } from '../src/lib/artist-overview'
import type { Album, ChecklistItem, Contract, Deposit, Invoice, Show, Track } from '../src/types'

const TODAY = '2026-10-21'
const ALL: OverviewAccess = { tour: true, offers: true, music: true, finance: true, legal: true }
const NONE: OverviewAccess = { tour: false, offers: false, music: false, finance: false, legal: false }

const show = (o: Partial<Show> & { id: string; date: string }): Show => ({ city: 'Berlin', venue: 'Tresor', time: '20:00', status: 'confirmed', ...o })
const track = (id: string, stage: Track['stage']): Track => ({ id, num: 1, title: id, stage, version: 1, touched: 'now' })
const step = (key: string, done: boolean): ChecklistItem => ({ key, label: key, phase: 'Rights & Credits', done }) as ChecklistItem
const album = (o: Partial<Album> & { id: string }): Album => ({ title: 'Night Shift EP', tracks: [], ...o })
const invoice = (o: Partial<Invoice> & { id: string }): Invoice => ({
  number: o.id, to: 'Promoter', category: 'Shows' as Invoice['category'], status: 'sent', issuedDate: '2026-09-01', dueDate: '2026-11-30',
  items: [{ description: 'Fee', quantity: 1, rate: 1000 }], currency: 'USD', ...o,
})
const contract = (o: Partial<Contract> & { id: string }): Contract => ({
  title: 'Deal', type: 'management' as Contract['type'], status: 'signed', counterparty: 'WME', createdAt: '2026-01-01', ...o,
})
const client = (o: { shows?: Show[]; albums?: Album[]; invoices?: Invoice[]; deposits?: Deposit[]; contracts?: Contract[]; offers?: string[] } = {}): OverviewClient => ({
  tour: { shows: o.shows ?? [] }, songs: { albums: o.albums ?? [] }, finance: { invoices: o.invoices ?? [] },
  business: { banking: { deposits: o.deposits ?? [] } }, legal: { contracts: o.contracts ?? [] },
  agentData: { offers: (o.offers ?? []).map(status => ({ status })) },
})

// ── an empty artist: every block the person may open is there, and says there is nothing ──
assert.deepEqual(buildOverview(client(), TODAY, ALL), {
  tour: { shows: [], more: 0, openOffers: 0 },
  music: { release: null, unfinished: 0 },
  finance: { owed: '', open: 0, overdue: 0 },
  legal: { total: 0, needing: 0, items: [] },
})

// ── nothing the person may not open appears at all, not even an empty block ──
const rich = client({
  shows: [show({ id: 's1', date: '2026-10-28' })], albums: [album({ id: 'a', releaseDate: '2026-11-14' })],
  invoices: [invoice({ id: 'i1' })], contracts: [contract({ id: 'c1', flagged: true })], offers: ['inquiry'],
})
assert.deepEqual(buildOverview(rich, TODAY, NONE), {}, 'no access, no blocks')
assert.deepEqual(Object.keys(buildOverview(rich, TODAY, { ...NONE, finance: true })), ['finance'])
assert.deepEqual(Object.keys(buildOverview(rich, TODAY, { ...NONE, legal: true })), ['legal'])
assert.deepEqual(Object.keys(buildOverview(rich, TODAY, { ...NONE, music: true })), ['music'])
// Deals & fees alone: the offers count, but no shows (the database sends none) and no "more shows" number
assert.deepEqual(buildOverview(rich, TODAY, { ...NONE, offers: true }), { tour: { shows: [], more: 0, openOffers: 1 } })
// Tour alone: the shows, but no offers number
const tourOnly = buildOverview(rich, TODAY, { ...NONE, tour: true }).tour!
assert.equal(tourOnly.openOffers, undefined); assert.equal(tourOnly.shows.length, 1)

// ── Tour: the next three shows that are really happening, soonest first ──
const t = buildOverview(client({ shows: [
  show({ id: 'late', date: '2026-12-01', city: 'Rome' }), show({ id: 'p', date: '2026-09-01' }), show({ id: 'c', date: '2026-10-25', status: 'cancelled' }),
  show({ id: 'h', date: '2026-10-25', status: 'hold', city: 'Lyon' }), show({ id: 'hist', date: '2026-10-26', historyOnly: true }),
  show({ id: 'b', date: '2026-10-28', city: 'Paris' }), show({ id: 'z', date: '2026-11-20', city: 'Oslo' }), show({ id: 'today', date: TODAY, city: 'Ghent' }),
] }), TODAY, ALL).tour!
assert.deepEqual(t.shows.map(s => s.id), ['today', 'h', 'b'], 'soonest first; played, cancelled and history-only shows are not ahead')
assert.deepEqual(t.shows.map(s => s.days), [0, 4, 7])
assert.equal(t.shows[1].status, 'hold')
assert.equal(t.more, 2, 'two more beyond the three shown')
assert.equal(buildOverview(client({ shows: [show({ id: 'a', date: '2026-10-22' }), show({ id: 'b', date: '2026-10-23' }), show({ id: 'c', date: '2026-10-24' })] }), TODAY, ALL).tour!.more, 0, 'exactly three: nothing more')

// ── open offers are inquiries and holds only ──
assert.equal(buildOverview(client({ offers: ['inquiry', 'hold', 'confirmed', 'cancelled', 'settled', 'hold'] }), TODAY, ALL).tour!.openOffers, 3)

// ── Music: the next release still ahead, with how finished it is ──
const m = buildOverview(client({ albums: [
  album({ id: 'old', title: 'Old', releaseDate: '2026-01-01', tracks: [track('x', 'mix')] }),
  album({ id: 'next', title: 'Night Shift EP', releaseDate: '2026-11-14', tracks: [track('t1', 'done'), track('t2', 'mix'), track('t3', 'master'), track('t4', 'done')], checklist: [step('a', true), step('b', true), step('c', false)] }),
  album({ id: 'far', title: 'Later', releaseDate: '2027-03-01', tracks: [track('t5', 'track')] }),
] }), TODAY, ALL).music!
assert.deepEqual(m.release, { id: 'next', title: 'Night Shift EP', date: '2026-11-14', days: 24, songsDone: 2, songsTotal: 4, stepsDone: 2, stepsTotal: 3 })
assert.equal(m.unfinished, 4, 'old: mix, next: mix + master, far: track')
assert.equal(buildOverview(client({ albums: [album({ id: 'a', releaseDate: TODAY })] }), TODAY, ALL).music!.release!.days, 0, 'releasing today is still ahead')
assert.equal(buildOverview(client({ albums: [album({ id: 'a' })] }), TODAY, ALL).music!.release, null, 'no date set: no countdown')
assert.equal(buildOverview(client({ albums: [album({ id: 'a', releaseDate: '2026-11-14', title: '' })] }), TODAY, ALL).music!.release!.title, 'Untitled')
assert.deepEqual([m.release!.stepsDone, m.release!.stepsTotal], [2, 3])
// a release nobody has ticked yet has no saved checklist: it shows the full list, all undone (as its Checklist page does), not nothing
const fresh18 = buildOverview(client({ albums: [album({ id: 'a', releaseDate: '2026-11-14' })] }), TODAY, ALL).music!.release!
assert.deepEqual([fresh18.stepsDone, fresh18.stepsTotal], [0, 18])
assert.deepEqual([buildOverview(client({ albums: [album({ id: 'a', releaseDate: '2026-11-14', checklist: [] })] }), TODAY, ALL).music!.release!.stepsTotal], [18], 'a saved empty list counts as none saved')

// ── the access table: each part comes from its own section (Deals & fees is "deals", Music is "songs") ──
const only = (...sections: string[]) => overviewAccessFor(s => sections.includes(s), () => false, 'x')
assert.deepEqual(only('tour'), { ...NONE, tour: true })
assert.deepEqual(only('deals'), { ...NONE, offers: true })
assert.deepEqual(only('songs'), { ...NONE, music: true })
assert.deepEqual(only('finance'), { ...NONE, finance: true })
assert.deepEqual(only('legal'), { ...NONE, legal: true })
assert.deepEqual(only('content', 'projects', 'profile', 'team'), NONE, 'sections without a block give nothing')
assert.deepEqual(only('tour', 'deals', 'songs', 'finance', 'legal'), ALL)

// ── Finance: what is still owed ──
const f = buildOverview(client({ invoices: [
  invoice({ id: 'i1', dueDate: '2026-10-01' }), invoice({ id: 'i2' }), invoice({ id: 'i3', currency: 'EUR' }),
  invoice({ id: 'i4', status: 'paid' }), invoice({ id: 'i5', status: 'draft' }), invoice({ id: 'i6', status: 'void' }),
] }), TODAY, ALL).finance!
assert.deepEqual(f, { owed: '$2,000 · €1,000', open: 3, overdue: 1 })
const dep: Deposit = { id: 'd', name: 'Pay', date: '2026-10-10', amount: 1000, currency: 'USD', mgmt: 0.1, lawyer: 0, taxes: 0, done: true, invoiceId: 'i1' }
assert.deepEqual(buildOverview(client({ invoices: [invoice({ id: 'i1' })], deposits: [dep] }), TODAY, ALL).finance, { owed: '', open: 0, overdue: 0 }, 'paid in full by a deposit')

// ── Legal: worst first, each contract once, at most three shown ──
const l = buildOverview(client({ contracts: [
  contract({ id: 'ok', title: 'Fine', expiryDate: '2030-01-01' }),
  contract({ id: 'soon', title: 'Kobalt', expiryDate: '2026-12-01' }),
  contract({ id: 'gone', title: 'WME', expiryDate: '2026-10-01' }),
  contract({ id: 'both', title: 'Sony', expiryDate: '2026-11-15', flagged: true }),
  contract({ id: 'flag', title: 'NDA', flagged: true }),
] }), TODAY, ALL).legal!
assert.equal(l.total, 5); assert.equal(l.needing, 4)
assert.deepEqual(l.items.map(i => i.id), ['gone', 'both', 'soon'], 'expired first, then ending soonest; the flagged-and-ending one counts once; only three shown')
assert.deepEqual(l.items.map(i => i.tone), ['late', 'todo', 'todo'])
assert.equal(l.items[0].line, 'Expired Oct 1, 2026 (20 days ago)')
assert.equal(buildOverview(client({ contracts: [contract({ id: 'flag', title: 'NDA', flagged: true })] }), TODAY, ALL).legal!.items[0].line, 'Flagged for review')
assert.deepEqual(buildOverview(client({ contracts: [
  contract({ id: 'gone', title: 'WME', expiryDate: '2026-10-01' }), contract({ id: 'both', title: 'Sony', expiryDate: '2026-11-15', flagged: true }), contract({ id: 'flag', title: 'NDA', flagged: true }),
] }), TODAY, ALL).legal!.items.map(i => i.id), ['gone', 'both', 'flag'], 'a contract that is flagged AND ending is listed once, so the next one still fits')
assert.deepEqual(buildOverview(client({ contracts: [contract({ id: 'c', status: 'draft', expiryDate: '2020-01-01' })] }), TODAY, ALL).legal, { total: 1, needing: 0, items: [] })

console.log('artist-overview checks passed')
