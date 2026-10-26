// Checks the "All artists" Legal page: which contracts are listed and in what state, who sees them, the order, the filters and the numbers on top.
// Run with:  npx tsx scripts/check-roster-legal.ts
import assert from 'node:assert/strict'
import { buildRosterLegal, defaultFilter, filterContracts, legalAccessFor, legalCapabilities, legalStats, type LegalAccess, type RosterLegalInput } from '../src/lib/roster-legal'
import { contractAlerts } from '../src/lib/contract-status'
import type { Client, Contract, MainSection, UserRole } from '../src/types'

const TODAY = '2026-10-21'
const FULL: LegalAccess = { open: true, full: true }
const SHARED: LegalAccess = { open: true, full: false }   // sent single contracts
const NONE: LegalAccess = { open: false, full: false }

const contract = (o: Partial<Contract> & { id: string }): Contract => ({ title: `Deal ${o.id}`, type: 'recording', status: 'signed', counterparty: 'Label Co', createdAt: '2026-01-01', ...o })
const artist = (id: string, name: string, contracts: Contract[], isDemo?: boolean): Client => ({ id, name, color: `#${id}`, isDemo, legal: { contracts } }) as unknown as Client
const input = (client: Client, access: LegalAccess = FULL): RosterLegalInput => ({ client, access })
const ids = (rows: { contractId: string }[]) => rows.map(r => r.contractId)

// ── every contract, in the state it is really in today ──
const alpha = artist('a', 'Alpha', [
  contract({ id: 'far', expiryDate: '2028-01-01' }),                                  // signed, a long way off
  contract({ id: 'soon', expiryDate: '2026-12-01', title: 'Kobalt', counterparty: 'Kobalt' }),   // signed, ends in 41 days
  contract({ id: 'gone', expiryDate: '2026-09-21' }),                                 // signed, ended 30 days ago
  contract({ id: 'draft-old', status: 'draft', expiryDate: '2020-01-01' }),           // a draft is still a draft whatever the date
  contract({ id: 'flag', status: 'review', flagged: true }),                          // the attorney asked for a look
  contract({ id: 'neg', status: 'negotiation', value: 25000, currency: 'EUR' }),
  contract({ id: 'term', status: 'terminated', expiryDate: '2026-01-01' }),
  contract({ id: 'open-end', status: 'signed' }),                                     // signed, no end date
])
const rows = buildRosterLegal([input(alpha)], TODAY)
const row = (id: string) => rows.find(r => r.contractId === id)!
assert.deepEqual(rows.map(r => [r.contractId, r.state]), [
  ['gone', 'expired'], ['soon', 'expiring'], ['flag', 'review'], ['far', 'signed'], ['draft-old', 'draft'], ['neg', 'negotiation'], ['open-end', 'signed'], ['term', 'terminated'],
], 'needs attention first (ended, then ending soonest, then flagged), then by end date, undated after dated; ended-for-good last')
assert.deepEqual(rows.filter(r => r.attention).map(r => r.contractId), ['gone', 'soon', 'flag'])
assert.deepEqual([row('soon').days, row('gone').days, row('open-end').days], [41, -30, null])
assert.equal(row('soon').endLine, 'Expires Dec 1, 2026 (in 41 days)')
assert.equal(row('open-end').endLine, null)
// A draft's or a terminated contract's date is not a real end: it is neither shown as "Expired" nor sorted as one
assert.deepEqual([row('draft-old').live, row('draft-old').days, row('draft-old').endLine], [false, null, null])
assert.deepEqual([row('term').live, row('term').days, row('term').endLine], [false, null, null])
assert.deepEqual([row('gone').live, row('soon').live, row('far').live, row('open-end').live], [true, true, true, true])
const oldFlagged = buildRosterLegal([input(artist('o', 'Old', [contract({ id: 'o1', status: 'draft', flagged: true, expiryDate: '2020-01-01' })])), input(alpha)], TODAY)
assert.deepEqual(ids(oldFlagged).slice(0, 4), ['gone', 'soon', 'flag', 'o1'], 'a flagged draft with a stale date comes after the genuinely expired and expiring ones')
assert.deepEqual([row('soon').clientName, row('soon').clientColor, row('soon').title, row('soon').counterparty, row('soon').type], ['Alpha', '#a', 'Kobalt', 'Kobalt', 'recording'])
assert.deepEqual([row('neg').value, row('far').value], [{ amount: 25000, currency: 'EUR' }, undefined])
assert.deepEqual(buildRosterLegal([input(artist('a', 'Alpha', [contract({ id: 'v', value: 900 })]))], TODAY)[0].value, { amount: 900, currency: 'USD' }, 'no currency means dollars, as on the artist page')
assert.equal('value' in buildRosterLegal([input(artist('a', 'Alpha', [contract({ id: 'v0', value: 0 })]))], TODAY)[0], false, 'a value of zero is no value')
assert.equal(row('flag').flagged, true)
// the same answer as the artist's own page for "needs attention"
assert.equal(rows.filter(r => r.attention).length, contractAlerts(alpha.legal.contracts, TODAY).count)

// ── where a contract opens ──
assert.deepEqual([row('gone').sub, row('soon').sub, row('flag').sub], ['alerts', 'alerts', 'alerts'], 'needs attention: the alerts')
assert.deepEqual([row('draft-old').sub, row('neg').sub], ['pipeline', 'pipeline'], 'being worked on: the pipeline')
assert.deepEqual([row('far').sub, row('open-end').sub, row('term').sub], ['register', 'register', 'register'])
// someone sent single contracts has the pipeline tab only, so every contract opens there
const shared = buildRosterLegal([input(alpha, SHARED)], TODAY)
assert.deepEqual([...new Set(shared.map(r => r.sub))], ['pipeline'])
assert.equal(shared.every(r => !r.full), true)

// ── ties: same date goes by artist name, then title ──
const tie = buildRosterLegal([
  input(artist('b', 'Beta', [contract({ id: 'b1', expiryDate: '2028-01-01', title: 'Zed' })])),
  input(artist('a', 'Alpha', [contract({ id: 'a1', expiryDate: '2028-01-01', title: 'Mid' }), contract({ id: 'a2', expiryDate: '2028-01-01', title: 'Abe' })])),
], TODAY)
assert.deepEqual(ids(tie), ['a2', 'a1', 'b1'])
const tie2 = buildRosterLegal([
  input(artist('b', 'Beta', [contract({ id: 'b2', expiryDate: '2028-01-01', title: 'Abe' })])),
  input(artist('a', 'Alpha', [contract({ id: 'a3', expiryDate: '2028-01-01', title: 'Zed' })])),
], TODAY)
assert.deepEqual(ids(tie2), ['a3', 'b2'], 'artist name before contract title')

// ended-for-good goes last even when its name sorts first
assert.deepEqual(ids(buildRosterLegal([input(artist('t', 'Tee', [contract({ id: 't-term', status: 'terminated', title: 'AAA' }), contract({ id: 't-open', title: 'ZZZ' })]))], TODAY)), ['t-open', 't-term'])

// ── who is listed: only artists whose Legal page the person may open; an artist's own login is not one of them ──
const beta = artist('b', 'Beta', [contract({ id: 'b-sig', expiryDate: '2029-01-01' })])
const gamma = artist('g', 'Gamma', [contract({ id: 'g-sig', expiryDate: '2029-01-01' })])
const mixed = buildRosterLegal([input(beta), input(gamma, NONE)], TODAY)
assert.deepEqual(ids(mixed), ['b-sig'], 'no Legal page, no contracts')
assert.deepEqual(buildRosterLegal([], TODAY), [])
assert.deepEqual(buildRosterLegal([input(artist('e', 'Empty', []))], TODAY), [], 'an artist with no contracts')
assert.deepEqual(buildRosterLegal([input({ id: 'x', name: 'X', color: '#x' } as unknown as Client)], TODAY), [], 'an artist with no legal data at all')

// ── one list with a fully open artist and a shared-only one: each row knows its own artist ──
const mixedAccess = buildRosterLegal([input(alpha, FULL), input(beta, SHARED)], TODAY)
assert.deepEqual(mixedAccess.filter(r => r.clientId === 'b').map(r => [r.full, r.sub]), [[false, 'pipeline']])
assert.equal(mixedAccess.filter(r => r.clientId === 'a').every(r => r.full), true)
assert.deepEqual(legalStats(mixedAccess), legalStats(rows), 'only the fully open artist is counted')

// ── the access rule, from the real flags ──
const grants = (map: Record<string, MainSection[]>, shareOnly: Record<string, MainSection[]> = {}) => ({
  has: (s: MainSection, id: string) => (map[id] ?? []).includes(s) || (shareOnly[id] ?? []).includes(s),
  shareOnly: (s: MainSection, id: string) => (shareOnly[id] ?? []).includes(s),
})
const acc = (g: ReturnType<typeof grants>, role: UserRole = 'manager') => legalAccessFor(g.has, g.shareOnly, 'x', role)
assert.deepEqual(acc(grants({ x: ['legal'] })), { open: true, full: true })
assert.deepEqual(acc(grants({}, { x: ['legal'] })), { open: true, full: false }, 'one contract sent to them')
assert.deepEqual(acc(grants({ x: ['finance', 'tour'] })), { open: false, full: false }, 'no Legal at all')
assert.deepEqual(acc(grants({ y: ['legal'] })), { open: false, full: false }, 'another artist')
assert.deepEqual(acc(grants({ x: ['legal'] }), 'artist'), { open: false, full: false }, "an artist's own login does not get the management view")
assert.deepEqual(acc(grants({ x: ['legal'] }), 'team'), { open: true, full: true })

// ── filters ──
const f = (o: { filter: 'attention' | 'progress' | 'signed' | 'all'; clientId?: string }) => ids(filterContracts(rows, o))
assert.deepEqual(f({ filter: 'attention' }), ['gone', 'soon', 'flag'])
assert.deepEqual(f({ filter: 'progress' }), ['flag', 'draft-old', 'neg'], 'draft, in review, negotiating (a flagged review is both)')
assert.deepEqual(f({ filter: 'signed' }), ['soon', 'far', 'open-end'], 'signed includes the ones about to expire, never the expired')
assert.deepEqual(f({ filter: 'all' }), ids(rows))
assert.deepEqual(f({ filter: 'all', clientId: 'nobody' }), [])
const two = buildRosterLegal([input(alpha), input(beta)], TODAY)
assert.deepEqual(ids(filterContracts(two, { filter: 'all', clientId: 'b' })), ['b-sig'], 'one artist')
assert.equal(filterContracts(two, { filter: 'all' }).length, 9)

// ── the numbers on top: only whole-Legal artists, never a practice artist ──
assert.deepEqual(legalStats(rows), { attention: 3, expiring: 1, expired: 1, inProgress: 3 })
assert.deepEqual(legalStats(shared), { attention: 0, expiring: 0, expired: 0, inProgress: 0 }, 'a few shared contracts say nothing about the whole picture')
const demoArtist = artist('p', 'Practice', [contract({ id: 'd1', expiryDate: '2026-01-01' }), contract({ id: 'd2', status: 'draft' }), contract({ id: 'd3', expiryDate: '2026-11-01' })], true)
const withDemo = buildRosterLegal([input(alpha), input(demoArtist)], TODAY)
assert.equal(withDemo.find(r => r.contractId === 'd1')!.demo, true, 'a practice artist is listed, marked')
assert.equal(withDemo.length, rows.length + 3)
assert.deepEqual(legalStats(withDemo), legalStats(rows), 'but the numbers are the same with or without it')
assert.deepEqual(legalStats([]), { attention: 0, expiring: 0, expired: 0, inProgress: 0 })
// a contract that is flagged AND expiring is one contract needing attention, not two
const both = buildRosterLegal([input(artist('z', 'Zed', [contract({ id: 'z1', expiryDate: '2026-11-01', flagged: true })]))], TODAY)
assert.deepEqual(legalStats(both), { attention: 1, expiring: 1, expired: 0, inProgress: 0 })
assert.deepEqual(legalStats(buildRosterLegal([input(artist('z', 'Zed', [contract({ id: 'z2', status: 'terminated', flagged: true })]))], TODAY)), { attention: 1, expiring: 0, expired: 0, inProgress: 0 }, 'flagged is flagged whatever the status')

// ── where the page opens ──
assert.equal(defaultFilter(true, { attention: 2, expiring: 0, expired: 0, inProgress: 0 }), 'attention')
assert.equal(defaultFilter(true, { attention: 0, expiring: 0, expired: 0, inProgress: 3 }), 'all', 'nothing needs a look: show everything')
assert.equal(defaultFilter(false, { attention: 3, expiring: 0, expired: 0, inProgress: 0 }), 'all', 'no numbers to go by')

// ── what the page offers this person ──
assert.deepEqual(legalCapabilities([FULL, NONE]), { list: true, counts: true })
assert.deepEqual(legalCapabilities([SHARED, NONE]), { list: true, counts: false }, 'only shared contracts: a list, no numbers')
assert.deepEqual(legalCapabilities([NONE]), { list: false, counts: false })
assert.deepEqual(legalCapabilities([]), { list: false, counts: false })

console.log('roster-legal checks passed')
