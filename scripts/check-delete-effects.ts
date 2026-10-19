// Checks what deleting a show or an offer takes with it (and what it must leave alone), and the plain words shown before it.  Run with:  npx tsx scripts/check-delete-effects.ts
import assert from 'node:assert/strict'
import { afterOfferDeleted, afterShowDeleted, billImpact, budgetsAfterOfferDeleted, clientImpact, insertAt, offerImpact, showImpact, staysLine, travelImpact } from '../src/lib/delete-effects'
import { askConfirm } from '../src/lib/confirm'
import type { Client } from '../src/types'

const client = {
  id: 'c1', name: 'Artist',
  tour: {
    shows: [
      { id: 's1', date: '2026-11-01', city: 'Berlin', venue: 'Tresor', time: '20:00', status: 'confirmed', guarantee: 10000, deposit: 3000, currency: 'EUR', tourOfferId: 'o1', invoiceId: 'inv1' },
      { id: 's2', date: '2026-11-02', city: 'Paris', venue: 'Olympia', time: '20:00', status: 'confirmed', guarantee: 8000, currency: 'EUR' },
    ],
    advances: [{ id: 'a1', showId: 's1' }, { id: 'a2', showId: 's2' }],
    guestList: [{ id: 'g1', showId: 's1', name: 'Dana', qty: 2 }, { id: 'g2', showId: 's1', name: 'Kit', qty: 1 }, { id: 'g3', showId: 's2', name: 'Sam', qty: 1 }],
    travel: [{ id: 't1', showIds: ['s1'], cost: 500, currency: 'USD' }, { id: 't2', showIds: ['s1', 's2'] }, { id: 't3', showIds: ['s2'] }, { id: 't4' }],
    offerSheets: [{ id: 'sh1', offerId: 'o1' }, { id: 'sh2', offerId: 'o1' }, { id: 'sh3', offerId: 'o2' }],
  },
  agentData: { offers: [{ id: 'o1', showId: 's1', guarantee: 10000, buyout: 500, venue: 'Tresor' }, { id: 'o2', guarantee: 4000, venue: 'Fabric' }] },
  finance: {
    budgets: [
      { id: 'b1', offerId: 'o1', showId: 's1' },        // locked for the show: must survive its offer being deleted
      { id: 'b2', offerId: 'o2' },                         // for the offer alone: goes with it
      { id: 'b3', showId: 's2' },
    ],
    settlements: [{ id: 'st1', showIds: ['s1', 's2'] }, { id: 'st2', showIds: ['s2'] }],
    expenses: [{ id: 'e1', showIds: ['s1', 's2'] }, { id: 'e2', showIds: ['s1'] }, { id: 'e3' }],
    invoices: [], plMonths: [],
  },
} as unknown as Client

const ids = (list: { id: string }[]) => list.map(x => x.id)

// ── deleting a show ──
let c = afterShowDeleted(client, 's1')
assert.deepEqual(ids(c.tour.shows), ['s2'])
assert.deepEqual(ids(c.tour.advances), ['a2'])                                   // its advance goes
assert.deepEqual(ids(c.tour.guestList), ['g3'])                                  // its guests go
assert.deepEqual(ids(c.tour.travel), ['t1', 't2', 't3', 't4'])                   // travel bookings stay ...
assert.deepEqual(c.tour.travel.map(t => t.showIds ?? null), [[], ['s2'], ['s2'], null])   // ... just no longer tied to it
assert.equal(c.agentData!.offers.find(o => o.id === 'o1')!.showId, undefined)    // its offer stays, pointing at nothing
assert.equal(c.finance.budgets.find(b => b.id === 'b1')!.showId, undefined)      // its budget stays
assert.equal(c.finance.budgets.length, 3)
assert.deepEqual(c.finance.settlements!.map(s => s.showIds), [['s2'], ['s2']])    // settlements stay, minus the link
assert.deepEqual(c.finance.expenses.map(e => e.showIds ?? null), [['s2'], [], null])
assert.equal(c.finance.budgets.find(b => b.id === 'b3')!.showId, 's2')           // another show's things are untouched
assert.deepEqual(ids(client.tour.shows), ['s1', 's2'])                           // the original is not changed
assert.equal(afterShowDeleted(client, 'nope').tour.shows.length, 2)              // a show that is not there changes nothing

// ── deleting an offer ──
c = afterOfferDeleted(client, 'o1')
assert.deepEqual(ids(c.agentData!.offers), ['o2'])
assert.deepEqual(ids(c.tour.offerSheets!), ['sh3'])                                // its sheets go
assert.equal(c.tour.shows.find(s => s.id === 's1')!.tourOfferId, undefined)       // its show stays, no longer pointing at it
assert.deepEqual(c.finance.budgets.map(b => b.id), ['b1', 'b2', 'b3'])             // the show's budget is KEPT ...
assert.equal(c.finance.budgets.find(b => b.id === 'b1')!.offerId, undefined)      // ... and stops pointing at the offer
c = afterOfferDeleted(client, 'o2')
assert.deepEqual(c.finance.budgets.map(b => b.id), ['b1', 'b3'])                   // a budget for the offer alone goes with it
assert.deepEqual(budgetsAfterOfferDeleted(client, 'o2').map(b => b.id), ['b1', 'b3'])

// ── plain words before a show goes ──
let impact = showImpact(client, client.tour.shows[0])
assert.deepEqual(impact.items, ['its fee of €10,000 and the €3,000 deposit', 'its advance', '2 names on its guest list'])
assert.deepEqual(impact.stays, ['2 travel bookings stay but are no longer tied to it', 'its settlement stays but loses its link to the show', 'its budget stays', 'its invoice stays'])
assert.equal(staysLine(impact), '2 travel bookings stay but are no longer tied to it; its settlement stays but loses its link to the show; its budget stays; its invoice stays.')
impact = showImpact(client, { ...client.tour.shows[1], guarantee: undefined })
assert.deepEqual(impact.items, ['its advance', '1 name on its guest list'])
assert.equal(staysLine({ items: [], stays: [] }), undefined)

// ── plain words before an offer goes ──
impact = offerImpact(client, client.agentData!.offers[0])
assert.deepEqual(impact.items, ['the offer of $10,500', '2 offer sheets sent to the artist'])
assert.deepEqual(impact.stays, ['the show it became stays, and so does that show\'s budget'])
impact = offerImpact(client, client.agentData!.offers[1])
assert.deepEqual(impact.items, ['the offer of $4,000', '1 offer sheet sent to the artist', 'its budget'])
assert.deepEqual(impact.stays, [])

// ── plain words before a bill or a booking goes ──
assert.deepEqual(billImpact({ amount: 800, currency: 'GBP', vendor: 'Vans Ltd' }).items, ['the £800 bill from Vans Ltd'])
assert.deepEqual(billImpact({ amount: 800, currency: 'USD', vendor: '', billFilePath: 'x/y.pdf' }).items, ['the $800 bill from this vendor', 'the PDF attached to it'])
assert.deepEqual(travelImpact({ cost: 500, currency: 'USD' })?.items, ['the $500 cost recorded on it'])
assert.equal(travelImpact({}), null)                                                // a booking with no cost just gets an Undo
assert.equal(travelImpact({ cost: 0 }), null)

// ── plain words before an artist is removed: everything that hangs off them ──
assert.deepEqual(
  clientImpact({ ...client, legal: { contracts: [{ id: 'k' }, { id: 'k2' }] }, songs: { albums: [{ tracks: [{}, {}, {}] }, { tracks: [{}] }] }, people: [{}] } as unknown as Client).items,
  ['2 shows', '2 booking offers', '3 bills and expenses', '2 settlements', '2 contracts', '4 songs', '1 person'])
assert.deepEqual(clientImpact({ tour: { shows: [] }, finance: { invoices: [], expenses: [], settlements: [] } } as unknown as Client).items, [])      // a brand-new artist: nothing to list

// ── putting something back where it was ──
assert.deepEqual(insertAt(['a', 'c'], 'b', 1), ['a', 'b', 'c'])
assert.deepEqual(insertAt(['a', 'b'], 'c', 5), ['a', 'b', 'c'])        // the list got shorter meanwhile: it goes at the end
assert.deepEqual(insertAt(['b'], 'a', 0), ['a', 'b'])
assert.deepEqual(insertAt(['b'], 'a', -3), ['a', 'b'])
assert.deepEqual(insertAt([], 'a', 0), ['a'])

// ── with no confirm box on screen the question still gets asked (the browser's own) and answered ──
async function confirmChecks() {
  const asked: string[] = []
  ;(globalThis as { window?: unknown }).window = { confirm: (text: string) => { asked.push(text); return true } }
  assert.equal(await askConfirm({ title: 'Remove the show?', body: 'It is gone for good.', items: ['its fee'] }), true)
  assert.deepEqual(asked, ['Remove the show?\nIt is gone for good.\n• its fee'])
  delete (globalThis as { window?: unknown }).window
  assert.equal(await askConfirm({ title: 'x' }), false)                             // nowhere to ask: the answer is no, never "yes by accident"
}

confirmChecks().then(() => console.log('delete-effects checks passed')).catch(e => { console.error(e); process.exit(1) })
