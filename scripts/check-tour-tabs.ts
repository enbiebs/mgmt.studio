// Checks which Tour tabs each kind of person gets.  Run with:  npx tsx scripts/check-tour-tabs.ts
import assert from 'node:assert/strict'
import { canOpenSection, visibleTourTabs } from '../src/lib/tour-tabs'

const all = ['tour', 'offers', 'budget', 'settlements', 'advance', 'daysheet', 'travel', 'crew', 'guests']
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

console.log('tour-tabs: all checks passed')
