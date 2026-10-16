// Checks how a show's money moves between the Show on screen and its show_deals row.  Run with:  npx tsx scripts/check-show-deals.ts
import assert from 'node:assert/strict'
import { DEAL_KEYS, dealFromRow, hasDealData, showDealRow, splitDealPatch, withoutDeal } from '../src/lib/show-deals'
import type { Show } from '../src/types'

const show: Show = {
  id: 's1', date: '2026-11-01', city: 'Lisbon', venue: 'LX Factory', time: '20:00', status: 'confirmed',
  guarantee: 5000, deposit: 1000, received: 2000, currency: 'EUR', viaAgency: true, agencyName: 'Acme Agency', agencyCommissionPct: 10, managementCommissionPct: 15, invoiceId: 'inv-1',
  tourOfferId: 'o1', notes: 'load in 4pm',
}

// the row to save carries every money field and nothing else about the show
const row = showDealRow(show, 'c1')
assert.deepEqual(row, { show_id: 's1', client_id: 'c1', guarantee: 5000, deposit: 1000, received: 2000, currency: 'EUR', via_agency: true, agency_name: 'Acme Agency', agency_commission_pct: 10, management_commission_pct: 15, invoice_id: 'inv-1' })
assert.equal(Object.keys(row).length, DEAL_KEYS.length + 2)                                    // the nine fields plus the show and the artist
// and reading it back gives the same fields
const back = dealFromRow(row)
for (const k of DEAL_KEYS) assert.equal(back[k], show[k], k)

// nothing set: nulls in, nothing out (no "null" ever lands on a Show)
const empty = showDealRow({ id: 's2' }, 'c1')
assert.ok(Object.entries(empty).every(([k, v]) => k === 'show_id' || k === 'client_id' || v === null))
assert.deepEqual(dealFromRow(empty), {
  guarantee: undefined, deposit: undefined, received: undefined, currency: undefined, viaAgency: undefined, agencyName: undefined,
  agencyCommissionPct: undefined, managementCommissionPct: undefined, invoiceId: undefined,
})
assert.deepEqual(dealFromRow(undefined), {})                                                    // no row (not allowed to read it, or none yet) = no money

// is there any money worth a row?
assert.ok(hasDealData(show))
assert.ok(hasDealData({ invoiceId: 'x' }))
assert.ok(hasDealData({ guarantee: 0 }))                                                         // a real zero is still a deal
assert.ok(!hasDealData({}))
assert.ok(!hasDealData({ guarantee: undefined, currency: undefined }))

// what someone without Deals & fees is given: the show, never its money
const bare = withoutDeal(show)
for (const k of DEAL_KEYS) assert.ok(!(k in bare), `${k} must be gone`)
assert.equal(bare.venue, 'LX Factory'); assert.equal(bare.tourOfferId, 'o1'); assert.equal(bare.notes, 'load in 4pm')   // everything else is kept
assert.equal(show.guarantee, 5000)                                                               // the original is not changed

// a change to a show is split: money goes to show_deals, the rest to the show
const { deal, rest, touchesDeal } = splitDealPatch({ guarantee: 7500, currency: 'USD' as const, historyOnly: true, driveUrl: 'https://x' })
assert.deepEqual(deal, { guarantee: 7500, currency: 'USD' })
assert.deepEqual(rest, { historyOnly: true, driveUrl: 'https://x' })
assert.ok(touchesDeal)
const plain = splitDealPatch({ historyOnly: false })
assert.ok(!plain.touchesDeal); assert.deepEqual(plain.deal, {})
// clearing a fee is a real change (an explicit undefined counts)
const clear = splitDealPatch({ guarantee: undefined })
assert.ok(clear.touchesDeal); assert.ok('guarantee' in clear.deal)

console.log('show-deals: all checks passed')
