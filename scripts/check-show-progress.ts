// Checks where a show stands on its way from offer to paid: the date decides what comes after show day.  Run with:  npx tsx scripts/check-show-progress.ts
import assert from 'node:assert/strict'
import { STEPS, progressForShow } from '../src/lib/show-progress'
import type { Client, Invoice, Settlement, Show, ShowAdvance, TravelItem } from '../src/types'

const TODAY = '2026-10-19'

function client(over: { advances?: ShowAdvance[]; travel?: TravelItem[]; settlements?: Settlement[]; invoices?: Invoice[] } = {}): Client {
  return {
    id: 'c1', name: 'Artist',
    tour: { shows: [], advances: over.advances ?? [], travel: over.travel ?? [], guestList: [] },
    finance: { budgets: [], invoices: over.invoices ?? [], settlements: over.settlements ?? [] },
  } as unknown as Client
}
const show = (o: Partial<Show> = {}): Show => ({ id: 's1', date: '2026-11-20', city: 'Lisbon', venue: 'LX', time: '20:00', status: 'confirmed', ...o })
const advance = (status: ShowAdvance['status']): ShowAdvance => ({ id: 'a1', showId: 's1', status } as unknown as ShowAdvance)
const settlement = (payments: number, total = 12000): Settlement => ({ id: 'st1', showIds: ['s1'], currency: 'USD', totalDue: total, payments: [{ label: 'Paid', amount: payments }] } as unknown as Settlement)
const stateOf = (p: ReturnType<typeof progressForShow>, key: string) => p.steps.find(s => s.key === key)?.state
const currentKey = (p: ReturnType<typeof progressForShow>) => (p.current < STEPS.length ? STEPS[p.current].key : 'all-done')
const fact = (p: ReturnType<typeof progressForShow>, key: string) => p.facts.find(f => f.key === key)!

// ── a show still ahead: the advance is the job ──
let p = progressForShow(client(), show(), TODAY)
assert.equal(currentKey(p), 'advance')
assert.equal(p.next?.label, 'Start the advance')
assert.equal(fact(p, 'advance').value, 'Not started')
assert.equal(fact(p, 'advance').tone, 'todo')
p = progressForShow(client({ advances: [advance('draft')] }), show(), TODAY)
assert.equal(p.next?.label, 'Finish and send the advance')

// ── once the show has happened the advance can no longer be "now": the settlement is next ──
for (const adv of [undefined, advance('draft'), advance('in-progress')]) {
  p = progressForShow(client({ advances: adv ? [adv] : [] }), show({ date: '2026-09-22' }), TODAY)
  assert.equal(stateOf(p, 'advance'), 'done', `advance is moot after the show (${adv?.status ?? 'none'})`)
  assert.equal(stateOf(p, 'showday'), 'done')
  assert.equal(currentKey(p), 'settlement')
  assert.equal(p.next?.label, 'Add the settlement')
  assert.equal(p.next?.detail, 'The show was 27 days ago')
  assert.equal(fact(p, 'advance').value === 'Complete', false)
}
p = progressForShow(client(), show({ date: '2026-09-22' }), TODAY)
assert.equal(fact(p, 'advance').value, 'Not completed')     // honest about it, but not a to-do any more
assert.equal(fact(p, 'advance').tone, 'quiet')
assert.equal(fact(p, 'settlement').tone, 'todo')            // the thing that is actually missing

// …even with a booked-but-unconfirmed trip still on the list
const pendingTrip = { id: 't1', kind: 'flight', status: 'pending', showIds: ['s1'] } as unknown as TravelItem
p = progressForShow(client({ travel: [pendingTrip] }), show({ date: '2026-09-22' }), TODAY)
assert.equal(stateOf(p, 'travel'), 'done')
assert.equal(currentKey(p), 'settlement')

// ── the day before, the day of, the day after ──
p = progressForShow(client({ advances: [advance('complete')] }), show({ date: '2026-10-20' }), TODAY)
assert.equal(currentKey(p), 'showday')                      // tomorrow: still ahead
p = progressForShow(client({ advances: [advance('complete')] }), show({ date: TODAY }), TODAY)
assert.equal(currentKey(p), 'showday')
assert.equal(p.next?.label, 'Share the day sheet (show is today)')
p = progressForShow(client({ advances: [advance('draft')] }), show({ date: TODAY }), TODAY)
assert.equal(currentKey(p), 'advance')                      // show day itself: an unfinished advance is still the job until the day is over
p = progressForShow(client(), show({ date: '2026-10-18' }), TODAY)
assert.equal(currentKey(p), 'settlement')                   // yesterday: show day is over

// ── after settlement: money ──
p = progressForShow(client({ settlements: [settlement(5000)] }), show({ date: '2026-09-22' }), TODAY)
assert.equal(currentKey(p), 'paid')
assert.equal(p.next?.label, 'Collect the balance')
p = progressForShow(client({ settlements: [settlement(12000)] }), show({ date: '2026-09-22' }), TODAY)
assert.equal(currentKey(p), 'all-done')
assert.equal(p.next, null)

// ── a hold that passed without being confirmed has lapsed, it is not a "confirm the hold" job ──
p = progressForShow(client(), show({ date: '2026-09-22', status: 'hold' }), TODAY)
assert.equal(p.lapsed, true)
assert.equal(p.next, null)
assert.equal(p.waiting, 'This hold passed without being confirmed')
p = progressForShow(client(), show({ date: '2026-11-20', status: 'hold' }), TODAY)
assert.equal(p.lapsed, false)                               // a hold still ahead is a normal hold
assert.equal(p.next?.label, 'Confirm the hold')

// ── cancelled stays cancelled ──
p = progressForShow(client(), show({ date: '2026-09-22', status: 'cancelled' }), TODAY)
assert.equal(p.cancelled, true)
assert.equal(p.lapsed, false)
assert.equal(p.next, null)

console.log('show-progress checks passed')
