// Checks what the ⌘K bar can find (contracts, songs, people, bookings, bills...), where each result opens, and that nothing is found that the person may not see.
// Run with:  npx tsx scripts/check-search-records.ts
import assert from 'node:assert/strict'
import { searchCommands } from '../src/lib/command-search'
import { GROUP_ORDER, buildRecordEntries, type RecordEntry } from '../src/lib/search-records'
import type { Client, MainSection } from '../src/types'

const alpha = {
  id: 'c1', name: 'Mascolo',
  legal: { contracts: [
    { id: 'k1', title: 'Publishing Admin — Kobalt', type: 'publishing', status: 'signed', counterparty: 'Kobalt Music', notes: 'admin deal', currency: 'USD' },
    { id: 'k2', title: 'Touring Agreement', type: 'touring', status: 'expired', counterparty: 'WME', currency: 'USD' },
  ] },
  songs: { albums: [
    { id: 'a1', title: 'Night Shift EP', type: 'ep', releaseDate: '2026-11-20', labelCopy: { upc: '0123456789012', label: 'Defected' }, tracks: [
      { id: 't1', title: 'Long Time', stage: 'mix', labelCopy: { isrc: 'GBXYZ2600001', writers: 'Marco Rossi' }, owner: 'Alex mixing' },
      { id: 't2', title: 'Reverie', stage: 'master' },
    ] },
  ] },
  people: [
    { id: 'p1', name: 'Dana Reyes', email: 'dana@promo.co', org: 'Promo Co', title: 'Publicist' },
    { id: 'p2', name: 'Sam Ortiz', title: 'FOH' },
  ],
  tour: {
    shows: [{ id: 's1', date: '2026-11-05', venue: 'Fabric', city: 'London', time: '', status: 'confirmed' }],
    guestList: [{ id: 'g1', showId: 's1', name: 'Dana Reyes', qty: 2, category: 'industry', checkedIn: false }],
    travel: [
      { id: 'tr1', kind: 'flight', status: 'booked', traveler: 'Full Party', showIds: ['s1'], confirmationCode: 'ZX81QP', legs: [{ id: 'l1', airline: 'BA', flightNumber: '117', from: 'JFK', fromCity: 'New York', to: 'LHR', toCity: 'London' }] },
      { id: 'tr2', kind: 'hotel', status: 'booked', name: 'The Hoxton, Shoreditch', showIds: ['s1'], address: '81 Great Eastern St' },
      { id: 'tr3', kind: 'ground', status: 'needed', type: 'transfer', provider: 'Addison Lee', from: 'LHR', to: 'Hotel' },
      { id: 'tr4', kind: 'hotel', status: 'cancelled', name: 'Cancelled Inn' },
    ],
  },
  finance: {
    settlements: [{ id: 'st1', venue: 'Fabric', promoter: 'Fabric Live Ltd', eventName: 'Saturday', currency: 'GBP', totalDue: 12000 }],
    expenses: [{ id: 'e1', vendor: 'Vans Ltd', description: 'Sprinter hire', amount: 800, currency: 'GBP', category: 'travel', paid: false, billNumber: 'V-1042' }],
    budgets: [{ id: 'b1', name: 'Fabric London', showId: 's1' }],
    invoices: [],
  },
  content: { posts: [{ id: 'po1', date: '2026-11-18', title: 'Night Shift teaser', type: 'reel' }] },
} as unknown as Client

const beta = { id: 'c2', name: 'nimino', legal: { contracts: [] }, songs: { albums: [] }, people: [{ id: 'p9', name: 'Dana Kim' }], tour: { shows: [], guestList: [], travel: [] }, finance: { settlements: [], expenses: [], budgets: [] }, content: { posts: [] } } as unknown as Client

const all = () => true
const entries = buildRecordEntries([alpha, beta], all)
const find = (query: string, list: RecordEntry[] = entries) => searchCommands(list, query)
const groupsOf = (list: RecordEntry[]) => [...new Set(list.map(e => e.group))]

// ── the words you would actually type find the thing ──
const hit = find('Kobalt')
assert.deepEqual(hit.map(h => h.id), ['contract-k1'])
assert.equal(hit[0].group, 'Contracts'); assert.match(hit[0].hint ?? '', /Mascolo · Kobalt Music · Signed/)
assert.deepEqual(find('WME').map(h => h.id), ['contract-k2'])                      // found by who it is with, not only its title
assert.deepEqual(find('Long Time').map(h => h.id), ['song-t1'])
assert.deepEqual(find('longtime').map(h => h.id), [])                               // a run-together spelling is not guessed at
assert.deepEqual(find('GBXYZ2600001').map(h => h.id), ['song-t1'])                  // by ISRC
assert.deepEqual(find('Night Shift').map(h => h.id).sort(), ['post-po1', 'release-a1', 'song-t1', 'song-t2'])   // the release, its songs (they carry the release name) and the post about it
assert.deepEqual(find('Dana').map(h => h.id).sort(), ['guest-g1', 'person-p1', 'person-p9'])      // the same name on a person, a guest list and another artist
assert.deepEqual(find('dana@promo').map(h => h.id), ['person-p1'])                  // by email
assert.deepEqual(find('publicist').map(h => h.id), ['person-p1'])                   // by job title
assert.deepEqual(find('Hoxton').map(h => h.id), ['travel-tr2'])
assert.deepEqual(find('BA 117').map(h => h.id), ['travel-tr1'])
assert.deepEqual(find('ZX81QP').map(h => h.id), ['travel-tr1'])                     // by confirmation code
assert.deepEqual(find('Addison').map(h => h.id), ['travel-tr3'])
assert.deepEqual(find('Cancelled Inn').map(h => h.id), [])                          // a cancelled booking is not offered
assert.deepEqual(find('Fabric Live').map(h => h.id), ['settlement-st1'])
assert.deepEqual(find('V-1042').map(h => h.id), ['bill-e1'])                        // a bill by its number
assert.deepEqual(find('Sprinter').map(h => h.id), ['bill-e1'])
assert.ok(find('Fabric London').some(h => h.id === 'budget-b1'))                       // found by its name (the flight into London for Fabric shows up too, in its own group)
assert.deepEqual(find('teaser').map(h => h.id), ['post-po1'])
assert.deepEqual(find('nothing like this'), [])

// ── each result opens the right place, and the record itself when it is one ──
const t = (id: string) => entries.find(e => e.id === id)!.target
assert.deepEqual(t('contract-k1'), { clientId: 'c1', section: 'legal', legalSub: 'pipeline' })
assert.deepEqual(t('release-a1'), { clientId: 'c1', section: 'songs', songsSub: 'tracks', selectedAlbumId: 'a1' })
assert.deepEqual(t('song-t1'), { clientId: 'c1', section: 'songs', songsSub: 'tracks', selectedAlbumId: 'a1' })
assert.deepEqual(t('person-p1'), { clientId: 'c1', section: 'team' })
assert.deepEqual(t('guest-g1'), { clientId: 'c1', section: 'tour', tourSub: 'guests', selectedShowId: 's1' })   // that show's guest list
assert.deepEqual(t('travel-tr2'), { clientId: 'c1', section: 'tour', tourSub: 'travel', selectedShowId: 's1' })  // the show the booking is for
assert.equal(t('travel-tr3').selectedShowId, undefined)                                                            // a booking with no show opens Travel in general
assert.deepEqual(t('settlement-st1'), { clientId: 'c1', section: 'tour', tourSub: 'settlements' })
assert.deepEqual(t('bill-e1'), { clientId: 'c1', section: 'finance', bizSub: 'payments' })
assert.deepEqual(t('budget-b1'), { clientId: 'c1', section: 'tour', tourSub: 'budget', selectedBudgetId: 'b1' })
assert.deepEqual(t('post-po1'), { clientId: 'c1', section: 'content', contentSub: 'manage' })

// ── what a result says about itself ──
const hint = (id: string) => entries.find(e => e.id === id)!.hint ?? ''
assert.match(hint('release-a1'), /Mascolo · Ep · Nov 20, 2026/)
assert.match(hint('song-t1'), /Mascolo · Night Shift EP · Mix/)
assert.match(hint('guest-g1'), /Mascolo · on the guest list · Fabric · Nov 5, 2026/)
assert.match(hint('settlement-st1'), /Mascolo · Settlement · £12,000/)
assert.match(hint('bill-e1'), /Mascolo · Unpaid · £800/)
assert.match(hint('travel-tr1'), /Mascolo · Flight · Fabric/)

// ── nothing is found that the person may not see: each group sits behind the same access as its page ──
const without = (...hidden: MainSection[]) => groupsOf(buildRecordEntries([alpha, beta], (s) => !hidden.includes(s)))
assert.deepEqual(without(), [...GROUP_ORDER].filter(g => groupsOf(entries).includes(g)))   // sanity: everything shows with full access
assert.ok(!without('legal').includes('Contracts') && without('legal').includes('Songs'))
assert.ok(!without('songs').includes('Songs') && !without('songs').includes('Releases'))
assert.ok(!without('team').includes('People') && without('team').includes('Guests'))
assert.ok(!without('tour').includes('Guests') && !without('tour').includes('Travel') && without('tour').includes('Bills'))
assert.deepEqual(['Settlements', 'Bills', 'Budgets'].filter(g => without('finance').includes(g)), [])
assert.ok(!without('content').includes('Posts'))
assert.deepEqual(buildRecordEntries([alpha, beta], () => false), [])                          // someone who can open nothing finds nothing
// access is asked per artist: allowed on one artist, not on the other
const onlyAlpha = buildRecordEntries([alpha, beta], (_s, id) => id === 'c1')
assert.ok(onlyAlpha.every(e => e.target.clientId === 'c1'))
assert.deepEqual(find('Dana Kim', onlyAlpha).map(h => h.id), [])

// ── order and size ──
assert.deepEqual(groupsOf(entries), GROUP_ORDER.filter(g => groupsOf(entries).includes(g)))   // the same group order whichever artist has what
assert.deepEqual(buildRecordEntries([], all), [])
assert.equal(new Set(entries.map(e => e.id)).size, entries.length)                              // no two results share an id
const crowded = { ...beta, id: 'c3', name: 'Crowd', songs: { albums: [{ id: 'ax', title: 'Big', tracks: Array.from({ length: 30 }, (_, i) => ({ id: `x${i}`, title: `Track ${i}` })) }] } } as unknown as Client
assert.equal(find('Track', buildRecordEntries([crowded], all)).length, 6)                       // a group never shows more than six

console.log('search-records checks passed')
