// Checks which Tour tabs each kind of person gets.  Run with:  npx tsx scripts/check-tour-tabs.ts
import assert from 'node:assert/strict'
import { effectiveSub } from '../src/lib/item-access'
import { TOUR_GROUPS, TOUR_GROUP_LABEL, gigChoices, TOUR_TAB_HINT, TOUR_TAB_ORDER, canOpenSection, groupOfSub, subForGroup, visibleTourGroups, visibleTourTabs } from '../src/lib/tour-tabs'

const all = ['tour', 'offers', 'budget', 'settlements', 'advance', 'daysheet', 'travel', 'crew', 'guests']
// every tab says in one plain line what it is for: not blank, and short enough to stay on one line on a phone (about 60 characters)
for (const tab of TOUR_TAB_ORDER) assert.ok(TOUR_TAB_HINT[tab].length >= 20 && TOUR_TAB_HINT[tab].length <= 60, `a short plain hint for ${tab}`)
assert.deepEqual(Object.keys(TOUR_TAB_HINT).sort(), [...TOUR_TAB_ORDER].sort(), 'a hint for exactly the tabs there are')
// a manager-style person with everything gets every tab, in menu order
assert.deepEqual(visibleTourTabs({ tour: true, deals: true, finance: true }), all)
// touring crew: the schedule side only, no offers, no money
assert.deepEqual(visibleTourTabs({ tour: true, deals: false, finance: false }), ['tour', 'advance', 'daysheet', 'travel', 'crew', 'guests'])
// a business manager (Deals & fees and Finance, no Tour): just Offers, Budget and Settlements
assert.deepEqual(visibleTourTabs({ tour: false, deals: true, finance: true }), ['offers', 'budget', 'settlements'])
// Deals & fees alone: just Offers
assert.deepEqual(visibleTourTabs({ tour: false, deals: true, finance: false }), ['offers'])
// a tour manager reads the fees: Offers shows along with the schedule and the tour money
assert.deepEqual(visibleTourTabs({ tour: true, deals: true, finance: true }).includes('offers'), true)
// nothing at all: nothing
assert.deepEqual(visibleTourTabs({ tour: false, deals: false, finance: false }), [])
// someone with only a shared show: just the tabs that show it (and money tabs stay closed), but their own Deals access still counts
const shared = ['tour', 'advance', 'daysheet', 'travel', 'guests']
assert.deepEqual(visibleTourTabs({ tour: true, deals: false, finance: true, sharedTabs: shared }), shared)
assert.deepEqual(visibleTourTabs({ tour: true, deals: true, finance: false, sharedTabs: shared }), ['tour', 'offers', 'advance', 'daysheet', 'travel', 'guests'])

// the Tour page opens for Deals & fees alone; nothing else borrows another section's access
const has = (granted: string[]) => (s: string) => granted.includes(s)
assert.ok(canOpenSection('tour', has(['deals'])))
assert.ok(canOpenSection('tour', has(['tour'])))
assert.ok(!canOpenSection('tour', has(['finance'])))
assert.ok(!canOpenSection('finance', has(['deals'])))
assert.ok(!canOpenSection('deals', has(['tour'])))


// ── four tabs on top: every screen belongs to exactly one, and addresses to old screens still land somewhere sensible ──
assert.deepEqual(TOUR_GROUPS.map(g => TOUR_GROUP_LABEL[g]), ['Shows', 'Offers', 'Money', 'Crew'])
assert.deepEqual(TOUR_TAB_ORDER.map(groupOfSub), ['shows', 'offers', 'money', 'money', 'shows', 'shows', 'shows', 'crew', 'shows'])
assert.equal(groupOfSub('stage-plot'), 'shows', 'the stage plot has no screen of its own')
assert.equal(groupOfSub('nonsense'), 'shows')
assert.deepEqual(visibleTourGroups(all), ['shows', 'offers', 'money', 'crew'])
assert.deepEqual(visibleTourGroups(visibleTourTabs({ tour: true, deals: false, finance: false })), ['shows', 'crew'], 'touring crew: no offers, no money')
assert.deepEqual(visibleTourGroups(visibleTourTabs({ tour: false, deals: true, finance: true })), ['offers', 'money'], 'a business manager')
assert.deepEqual(visibleTourGroups(visibleTourTabs({ tour: false, deals: true, finance: false })), ['offers'], 'Deals & fees alone')
assert.deepEqual(visibleTourGroups(visibleTourTabs({ tour: true, deals: false, finance: false, sharedTabs: ['tour', 'advance'] })), ['shows'], 'one shared show')
assert.deepEqual(visibleTourGroups([]), [])
// clicking a tab: stay where you are if it is in that tab, else its first screen
assert.equal(subForGroup('shows', 'travel', all), 'travel', 'already inside Shows: stay on Travel')
assert.equal(subForGroup('shows', 'offers', all), 'tour', 'coming from Offers: the show details')
assert.equal(subForGroup('offers', 'advance', all), 'offers')
assert.equal(subForGroup('money', 'tour', all), 'budget')
assert.equal(subForGroup('money', 'settlements', all), 'settlements', 'already inside Money: stay')
assert.equal(subForGroup('money', 'tour', ['offers', 'settlements']), 'settlements', 'no Budget access: its first screen is Settlements')
assert.equal(subForGroup('crew', 'tour', all), 'crew')
assert.equal(subForGroup('shows', 'advance', ['offers']), 'advance', 'nothing to go to: stay put')


// ── a screen the person cannot open (a stale pick) lands on a tab they have ──
assert.deepEqual(visibleTourGroups(visibleTourTabs({ tour: true, deals: false, finance: true })), ['shows', 'money', 'crew'], 'Tour plus Finance, no Deals & fees: no Offers tab')
assert.equal(groupOfSub(effectiveSub('tour', visibleTourTabs({ tour: false, deals: true, finance: false }))), 'offers', 'Deals & fees alone, with Details picked: highlights Offers')
assert.equal(groupOfSub('constructor'), 'shows', 'odd words are just not screens')
assert.equal(groupOfSub('toString'), 'shows')

// ── what New gig offers: a booked show and a spreadsheet are Tour, an offer and a pasted offer are Deals & fees ──
assert.deepEqual(gigChoices({ show: true, offer: true }), { button: true, booked: true, talking: true, paste: true, spreadsheet: true })
assert.deepEqual(gigChoices({ show: true, offer: false }), { button: true, booked: true, talking: false, paste: false, spreadsheet: true }, 'Tour only: can add a show or import, not an offer')
assert.deepEqual(gigChoices({ show: false, offer: true }), { button: true, booked: false, talking: true, paste: true, spreadsheet: false }, 'Deals & fees only: can add or paste an offer, not a show')
assert.deepEqual(gigChoices({ show: false, offer: false }), { button: false, booked: false, talking: false, paste: false, spreadsheet: false }, 'neither: no button')

console.log('tour-tabs: all checks passed')
