// Checks the "No budget yet" list on the Budget tab: each gig listed once, whether it is an offer, a show, or both.
// Run with:  npx tsx scripts/check-budget-candidates.ts
import assert from 'node:assert/strict'
import { budgetCandidates, sameGig } from '../src/lib/budget-candidates'
import type { Show, TourOffer } from '../src/types'

const offer = (o: Partial<TourOffer> & { id: string; date: string; venue: string }): TourOffer =>
  ({ city: 'Berlin', country: 'DE', promoter: 'P', guarantee: 1000, status: 'confirmed', ...o })
const show = (o: Partial<Show> & { id: string; date: string; venue: string }): Show =>
  ({ city: 'Berlin', time: '20:00', status: 'confirmed', ...o })
const names = (r: { needOffer: TourOffer[]; needShow: Show[] }) => ({ offers: r.needOffer.map(o => o.id), shows: r.needShow.map(s => s.id) })

// ── the same gig: same day, same venue (ignoring case and spacing), and never an empty venue ──
assert.equal(sameGig({ date: '2026-11-01', venue: 'Tresor' }, { date: '2026-11-01', venue: '  TRESOR ' }), true)
assert.equal(sameGig({ date: '2026-11-01', venue: 'Tresor' }, { date: '2026-11-02', venue: 'Tresor' }), false, 'another day')
assert.equal(sameGig({ date: '2026-11-01', venue: 'Tresor' }, { date: '2026-11-01', venue: 'Berghain' }), false, 'another venue')
assert.equal(sameGig({ date: '2026-11-01', venue: '' }, { date: '2026-11-01', venue: ' ' }), false, 'two blank venues are not the same gig')
assert.equal(sameGig({ date: '2026-11-01', venue: 'Rex  Club' }, { date: '2026-11-01', venue: 'rex club' }), true, 'extra spaces inside')

// ── nothing yet: everything is listed ──
assert.deepEqual(names(budgetCandidates([offer({ id: 'o1', date: '2026-11-01', venue: 'A' })], [show({ id: 's1', date: '2026-12-01', venue: 'B' })], [])), { offers: ['o1'], shows: ['s1'] })

// ── an offer and a show linked by the app: the offer is listed, not the show ──
assert.deepEqual(names(budgetCandidates([offer({ id: 'o1', date: '2026-11-01', venue: 'A', showId: 's1' })], [show({ id: 's1', date: '2026-11-01', venue: 'A' })], [])), { offers: ['o1'], shows: [] })
// ...and if the show already has the budget, neither
assert.deepEqual(names(budgetCandidates([offer({ id: 'o1', date: '2026-11-01', venue: 'A', showId: 's1' })], [show({ id: 's1', date: '2026-11-01', venue: 'A' })], [{ showId: 's1' }])), { offers: [], shows: [] })

// ── not linked, but the same day at the same venue (a show added directly or imported): the show is listed once ──
assert.deepEqual(names(budgetCandidates([offer({ id: 'o1', date: '2026-11-01', venue: 'Tresor' })], [show({ id: 's1', date: '2026-11-01', venue: 'tresor' })], [])), { offers: [], shows: ['s1'] })
// ...unless the offer already has the budget: then the show does not ask for a second one
assert.deepEqual(names(budgetCandidates([offer({ id: 'o1', date: '2026-11-01', venue: 'Tresor' })], [show({ id: 's1', date: '2026-11-01', venue: 'Tresor' })], [{ offerId: 'o1' }])), { offers: [], shows: [] })
// ...and if the show has the budget, the offer does not ask again
assert.deepEqual(names(budgetCandidates([offer({ id: 'o1', date: '2026-11-01', venue: 'Tresor' })], [show({ id: 's1', date: '2026-11-01', venue: 'Tresor' })], [{ showId: 's1' }])), { offers: [], shows: [] })
// a show kept only as history does not count as the gig's show, so the offer stays
assert.deepEqual(names(budgetCandidates([offer({ id: 'o1', date: '2026-11-01', venue: 'Tresor' })], [show({ id: 'h1', date: '2026-11-01', venue: 'Tresor', historyOnly: true })], [])), { offers: ['o1'], shows: [] })

// ── only live offers are listed; different gigs are never merged ──
const off = (status: TourOffer['status']) => budgetCandidates([offer({ id: 'o1', date: '2026-11-01', venue: 'A', status })], [], [])
assert.deepEqual([off('inquiry'), off('hold'), off('confirmed')].map(r => r.needOffer.length), [1, 1, 1])
assert.deepEqual([off('settled'), off('cancelled')].map(r => r.needOffer.length), [0, 0])
assert.deepEqual(names(budgetCandidates([offer({ id: 'o1', date: '2026-11-01', venue: 'A' })], [show({ id: 's1', date: '2026-11-08', venue: 'A' })], [])), { offers: ['o1'], shows: ['s1'] }, 'a week later at the same venue is another gig')
assert.deepEqual(names(budgetCandidates([offer({ id: 'o1', date: '2026-11-01', venue: 'A', status: 'settled', showId: 's1' })], [show({ id: 's1', date: '2026-11-01', venue: 'A' })], [])), { offers: [], shows: [] }, 'a settled gig asks for nothing, as before')

// ── cases found in review ──
// a linked offer + show, and a SECOND living show on the same day and venue (an early and a late show, or a duplicate import): all three get a row
assert.deepEqual(names(budgetCandidates([offer({ id: 'o1', date: '2026-11-01', venue: 'A', showId: 's1' })], [show({ id: 's1', date: '2026-11-01', venue: 'A' }), show({ id: 's2', date: '2026-11-01', venue: 'A' })], [])), { offers: ['o1'], shows: ['s2'] })
// ...even when the linked offer already has its budget: the second show still asks for its own
assert.deepEqual(names(budgetCandidates([offer({ id: 'o1', date: '2026-11-01', venue: 'A', showId: 's1' })], [show({ id: 's1', date: '2026-11-01', venue: 'A' }), show({ id: 's2', date: '2026-11-01', venue: 'A' })], [{ offerId: 'o1' }])), { offers: [], shows: ['s2'] })
// a live offer is not replaced by a cancelled show of the same day and venue (cancelled and rebooked)
assert.deepEqual(budgetCandidates([offer({ id: 'o1', date: '2026-11-01', venue: 'A', status: 'hold' })], [show({ id: 's1', date: '2026-11-01', venue: 'A', status: 'cancelled' })], []).needOffer.map(o => o.id), ['o1'])
// a cancelled offer with a draft budget does not stop a new show on the same day and venue from asking for one
assert.deepEqual(names(budgetCandidates([offer({ id: 'o1', date: '2026-11-01', venue: 'A', status: 'cancelled' })], [show({ id: 's1', date: '2026-11-01', venue: 'A' })], [{ offerId: 'o1' }])), { offers: [], shows: ['s1'] })
// the link may be held by the show alone (its tourOfferId): still one gig, listed once, even if the venue was later edited
assert.deepEqual(names(budgetCandidates([offer({ id: 'o1', date: '2026-11-01', venue: 'Tresor' })], [show({ id: 's1', date: '2026-11-03', venue: 'Tresor Berlin', tourOfferId: 'o1' })], [])), { offers: ['o1'], shows: [] })
assert.deepEqual(names(budgetCandidates([offer({ id: 'o1', date: '2026-11-01', venue: 'Tresor' })], [show({ id: 's1', date: '2026-11-03', venue: 'Tresor Berlin', tourOfferId: 'o1' })], [{ showId: 's1' }])), { offers: [], shows: [] }, 'and when that show has the budget, neither asks')

// an offer already linked (from the show's side) to another show is not also paired with an unlinked show of the same day and venue
assert.deepEqual(names(budgetCandidates([offer({ id: 'o1', date: '2026-11-01', venue: 'Tresor' })], [show({ id: 's1', date: '2026-11-05', venue: 'Elsewhere', tourOfferId: 'o1' }), show({ id: 's2', date: '2026-11-01', venue: 'Tresor' })], [])), { offers: ['o1'], shows: ['s2'] })
// two offers for the same gig, one linked to the show: the second still gets its own row instead of vanishing into the show
assert.deepEqual(names(budgetCandidates([offer({ id: 'o1', date: '2026-11-01', venue: 'A', showId: 's1' }), offer({ id: 'o2', date: '2026-11-01', venue: 'A', status: 'hold' })], [show({ id: 's1', date: '2026-11-01', venue: 'A' })], [])), { offers: ['o1', 'o2'], shows: [] })

console.log('budget-candidates checks passed')
