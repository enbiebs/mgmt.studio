// Checks holds on offers: how long is left, who is first in line when several promoters hold the same date, and keeping hold details off offers that are not on hold.  Run with:  npx tsx scripts/check-holds.ts
import assert from 'node:assert/strict'
import { holdClock, holdPlaces, isLiveHold, ordinal, otherHoldsOnDate, othersLine, placeLabel, placeTone, termsForStatus, withoutHoldDetails } from '../src/lib/holds'
import { draftFromTerms, termsFromDraft } from '../src/lib/offer-terms'
import { buildOfferSheetSnapshot } from '../src/lib/offer-sheet'
import { useStore } from '../src/lib/store'
import type { Budget, Client, OfferTerms, TourOffer } from '../src/types'

const TODAY = '2026-10-19'
let n = 0
const check = (name: string, fn: () => void) => { fn(); n++; console.log('  ok  ' + name) }

const offer = (id: string, o: Partial<TourOffer> & { holdUntil?: string; holdPosition?: number } = {}): TourOffer => {
  const { holdUntil, holdPosition, ...rest } = o
  const terms: OfferTerms | undefined = holdUntil || holdPosition !== undefined ? { ...(holdUntil ? { holdUntil } : {}), ...(holdPosition !== undefined ? { holdPosition } : {}) } : rest.terms
  return { id, venue: 'V-' + id, city: 'Berlin', country: 'DE', date: '2026-11-12', promoter: 'P', guarantee: 5000, status: 'hold', ...rest, ...(terms ? { terms } : {}) } as TourOffer
}

check('ordinals read like a person says them', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th'])
})

check('only an offer on hold, with a date that has not passed, is a live hold', () => {
  assert.equal(isLiveHold(offer('a'), TODAY), true)
  assert.equal(isLiveHold(offer('a', { date: TODAY }), TODAY), true)             // today still counts
  assert.equal(isLiveHold(offer('a', { date: '2026-10-18' }), TODAY), false)     // the date has passed
  for (const status of ['inquiry', 'confirmed', 'cancelled', 'settled'] as const) assert.equal(isLiveHold(offer('a', { status }), TODAY), false, status)
})

check('the clock: how long is left on a hold', () => {
  assert.equal(holdClock(offer('a', { status: 'inquiry', holdUntil: '2026-10-25' }), TODAY), undefined)   // not a hold, nothing to say
  assert.equal(holdClock(offer('a', { date: '2026-10-01', holdUntil: '2026-10-25' }), TODAY), undefined)   // the show date has passed
  assert.deepEqual(holdClock(offer('a'), TODAY), { label: 'No hold-until date', tone: 'quiet', daysLeft: null })
  assert.deepEqual(holdClock(offer('a', { holdUntil: '2026-10-17' }), TODAY), { label: 'Hold ran out Oct 17', tone: 'late', daysLeft: -2 })
  assert.deepEqual(holdClock(offer('a', { holdUntil: TODAY }), TODAY), { label: 'Hold runs out today', tone: 'soon', daysLeft: 0 })
  assert.deepEqual(holdClock(offer('a', { holdUntil: '2026-10-20' }), TODAY), { label: 'Held until Oct 20 (1 day left)', tone: 'soon', daysLeft: 1 })
  assert.equal(holdClock(offer('a', { holdUntil: '2026-10-22' }), TODAY)?.tone, 'soon')       // 3 days is still "soon"
  assert.deepEqual(holdClock(offer('a', { holdUntil: '2026-10-23' }), TODAY), { label: 'Held until Oct 23 (4 days left)', tone: 'ok', daysLeft: 4 })
})

check('a hold on a date by itself has no place in line', () => {
  assert.equal(holdPlaces([offer('a')], TODAY).size, 0)
  assert.equal(holdPlaces([offer('a'), offer('b', { date: '2026-11-13' })], TODAY).size, 0)                    // different dates
  assert.equal(holdPlaces([offer('a'), offer('b', { status: 'inquiry' })], TODAY).size, 0)                      // the other is not a hold
  assert.equal(holdPlaces([offer('a'), offer('b', { status: 'confirmed' })], TODAY).size, 0)
})

check('two holds on one date, ranked: first and second', () => {
  const p = holdPlaces([offer('a', { holdPosition: 2 }), offer('b', { holdPosition: 1 })], TODAY)
  assert.deepEqual(p.get('b'), { rank: 1, of: 2, ranked: true, tied: false, others: ['V-a'] })
  assert.deepEqual(p.get('a'), { rank: 2, of: 2, ranked: true, tied: false, others: ['V-b'] })
  assert.equal(placeLabel(p.get('b')!), '1st hold of 2'); assert.equal(placeLabel(p.get('a')!), '2nd hold of 2')
  assert.equal(placeTone(p.get('b')!), 'first'); assert.equal(placeTone(p.get('a')!), 'behind')
})

check('two holds on one date, not ranked: both are told to rank them', () => {
  const p = holdPlaces([offer('a'), offer('b')], TODAY)
  for (const id of ['a', 'b']) {
    assert.equal(p.get(id)?.ranked, false)
    assert.equal(p.get(id)?.tied, false)                 // two holds nobody has ranked are not "tied": they just are not ranked
    assert.equal(placeLabel(p.get(id)!), 'Not ranked · 2 holds on this date')
    assert.equal(placeTone(p.get(id)!), 'check')
  }
})

check('a ranked hold comes before one that is not ranked', () => {
  const p = holdPlaces([offer('a'), offer('b', { holdPosition: 1 })], TODAY)
  assert.equal(p.get('b')?.rank, 1); assert.equal(p.get('a')?.rank, 2)
  assert.equal(p.get('a')?.ranked, false)
})

check('two holds claiming the same place are flagged as tied', () => {
  const p = holdPlaces([offer('a', { holdPosition: 1 }), offer('b', { holdPosition: 1 }), offer('c', { holdPosition: 2 })], TODAY)
  assert.equal(p.get('a')?.tied, true); assert.equal(p.get('b')?.tied, true); assert.equal(p.get('c')?.tied, false)
  assert.equal(placeLabel(p.get('a')!), 'Tied for 1st hold')
  assert.equal(placeTone(p.get('a')!), 'check')
  assert.equal(p.get('c')?.rank, 3)       // two are ahead of it
})

check('when the first hold goes, the second moves up by itself', () => {
  const both = [offer('a', { holdPosition: 1 }), offer('b', { holdPosition: 2 })]
  assert.equal(holdPlaces(both, TODAY).get('b')?.rank, 2)
  const gone = [offer('a', { holdPosition: 1, status: 'cancelled' }), offer('b', { holdPosition: 2 })]
  assert.equal(holdPlaces(gone, TODAY).size, 0)                                  // b is alone now: no place to speak of
  const three = [offer('a', { holdPosition: 1, status: 'cancelled' }), offer('b', { holdPosition: 2 }), offer('c', { holdPosition: 3 })]
  assert.equal(holdPlaces(three, TODAY).get('b')?.rank, 1)                       // b is first in line now
  assert.equal(holdPlaces(three, TODAY).get('c')?.rank, 2)
  assert.equal(placeLabel(holdPlaces(three, TODAY).get('b')!), '1st hold of 2')
})

check('the form asks about the other live holds on the same date, and describes them', () => {
  const list = [offer('a', { holdPosition: 1 }), offer('b'), offer('c', { date: '2026-11-20' }), offer('d', { status: 'inquiry' }), offer('e', { date: '2026-10-01' })]
  assert.deepEqual(otherHoldsOnDate(list, '2026-11-12', TODAY).map(o => o.id), ['a', 'b'])
  assert.deepEqual(otherHoldsOnDate(list, '2026-11-12', TODAY, 'a').map(o => o.id), ['b'])        // not itself
  assert.deepEqual(otherHoldsOnDate(list, '2026-10-01', TODAY).map(o => o.id), [])                   // a date that has passed
  assert.equal(othersLine(otherHoldsOnDate(list, '2026-11-12', TODAY)), 'V-a (1st), V-b (not ranked)')
})

check('an offer that is not on hold carries no hold details', () => {
  const t: OfferTerms = { respondBy: '2026-10-25', holdUntil: '2026-10-30', holdPosition: 2 }
  assert.deepEqual(withoutHoldDetails(t), { respondBy: '2026-10-25' })
  assert.equal(withoutHoldDetails({ holdUntil: '2026-10-30' }), undefined)                          // nothing else in there: no terms at all
  assert.equal(withoutHoldDetails(undefined), undefined)
  const same = { capacity: 500 }
  assert.equal(withoutHoldDetails(same), same)                                                      // nothing to take off: left exactly as it was
  assert.deepEqual(termsForStatus(t, 'hold'), t)                                                    // on hold: kept
  for (const status of ['inquiry', 'confirmed', 'cancelled', 'settled'] as const) assert.deepEqual(termsForStatus(t, status), { respondBy: '2026-10-25' }, status)
  assert.equal(t.holdUntil, '2026-10-30')                                                            // the original was not changed
})

check('the offer form keeps the hold details when it saves, and drops them when empty', () => {
  const t: OfferTerms = { holdUntil: '2026-10-30', holdPosition: 2, capacity: 800 }
  assert.deepEqual(termsFromDraft(draftFromTerms(t)), t)
  assert.equal(draftFromTerms(undefined).holdUntil, ''); assert.equal(draftFromTerms(undefined).holdPosition, '')
  assert.equal(termsFromDraft(draftFromTerms(undefined)), undefined)
  const d = draftFromTerms(t)
  assert.deepEqual(termsFromDraft({ ...d, holdUntil: '', holdPosition: '' }), { capacity: 800 })
  for (const bad of ['0', '-1', 'abc']) assert.equal(termsFromDraft({ ...d, holdPosition: bad })?.holdPosition, undefined, bad)   // not a place in line
  assert.equal(termsFromDraft({ ...d, holdPosition: '2.6' })?.holdPosition, 3)                      // a whole number
})

check('an offer sheet never carries the hold details, but keeps the rest of the terms', () => {
  const budget = { id: 'b', currency: 'USD', lines: [], commissions: [], notes: '' } as unknown as Budget
  const client = { id: 'c1', name: 'Artist' } as unknown as Client
  const held = offer('o1', { holdUntil: '2026-10-30', holdPosition: 2, terms: undefined })
  const withTerms = { ...held, terms: { ...held.terms, capacity: 800, respondBy: '2026-10-25' } } as TourOffer
  for (const detail of ['full', 'summary'] as const) {
    const snap = buildOfferSheetSnapshot({ client, offer: withTerms, budget, detail })
    assert.deepEqual(snap.offer.terms, { capacity: 800, respondBy: '2026-10-25' }, detail)
    const text = JSON.stringify(snap)
    assert.equal(text.includes('holdUntil') || text.includes('holdPosition') || text.includes('2026-10-30'), false, detail)
  }
  assert.equal(withTerms.terms?.holdUntil, '2026-10-30')           // the offer itself still has them
  assert.equal(buildOfferSheetSnapshot({ client, offer: { ...held, terms: { holdUntil: '2026-10-30' } } as TourOffer, budget, detail: 'summary' }).offer.terms, undefined)   // nothing else in the terms: none at all
})

// ── in the app: hold details follow the status ──
const artist = (id: string): Client => ({
  id, name: id, legal: { contracts: [] },
  tour: { shows: [], advances: [], travel: [], guestList: [], crew: [] }, finance: { budgets: [], invoices: [], expenses: [], settlements: [], crewRates: [], vendors: [] },
  songs: { albums: [] }, content: { posts: [] }, agentData: { offers: [] }, business: { banking: { deposits: [] } }, projects: [],
}) as unknown as Client
const st = () => useStore.getState()
const mine = () => st().data.clients.find(c => c.id === 'c1')!.agentData!.offers
check('in the app: hold details are kept while on hold and taken off when the offer leaves hold', () => {
  console.error = () => {}      // saving to Google Calendar / a database is not set up here; those logged failures are expected
  useStore.setState({ data: { clients: [artist('c1')] }, clientId: 'c1', workspaceId: null })
  st().addOffer({ venue: 'Fabric', city: 'London', country: 'UK', date: '2027-02-01', promoter: 'P', guarantee: 5000, terms: { capacity: 500, holdUntil: '2027-01-10' } })
  const id = mine()[0].id
  assert.deepEqual(mine()[0].terms, { capacity: 500 }, 'a new offer is not on hold, so it starts with no hold details')
  st().updateOffer(id, { status: 'hold', terms: { capacity: 500, holdUntil: '2027-01-10', holdPosition: 2 } })
  assert.deepEqual(mine()[0].terms, { capacity: 500, holdUntil: '2027-01-10', holdPosition: 2 }, 'on hold: kept')
  st().updateOffer(id, { notes: 'called them' })
  assert.deepEqual(mine()[0].terms, { capacity: 500, holdUntil: '2027-01-10', holdPosition: 2 }, 'an edit that is not about the terms leaves them alone')
  st().updateOffer(id, { terms: { capacity: 600, holdUntil: '2027-01-17', holdPosition: 1 } })
  assert.deepEqual(mine()[0].terms, { capacity: 600, holdUntil: '2027-01-17', holdPosition: 1 }, 'a new hold date is saved while still on hold')
  st().updateOffer(id, { status: 'confirmed' })
  assert.deepEqual(mine()[0].terms, { capacity: 600 }, 'confirmed: the hold is over, its details go')
  st().updateOffer(id, { terms: { capacity: 600, holdUntil: '2027-01-17' } })     // a form that was open before the status changed, saving its old details
  assert.deepEqual(mine()[0].terms, { capacity: 600 }, 'an old form cannot put them back on a confirmed offer')
  st().updateOffer(id, { status: 'hold' })
  assert.deepEqual(mine()[0].terms, { capacity: 600 }, 'going back on hold starts with none')
  st().updateOffer(id, { status: 'cancelled' })
  assert.deepEqual(mine()[0].terms, { capacity: 600 })
})

console.log(`\n${n} checks passed`)
