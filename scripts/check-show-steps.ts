// Checks the steps along the top of a show's page: which a person gets, what each opens, and the dot for where each stands.
// Run with:  npx tsx scripts/check-show-steps.ts
import assert from 'node:assert/strict'
import { progressForShow } from '../src/lib/show-progress'
import { showSteps, stepsShowFor, type ShowStep } from '../src/lib/show-steps'
import { visibleTourTabs } from '../src/lib/tour-tabs'
import type { Client, Invoice, Settlement, Show, ShowAdvance, TravelItem, GuestListEntry } from '../src/types'

const TODAY = '2026-10-19'
const ALL_TABS = visibleTourTabs({ tour: true, deals: true, finance: true })
const TOUR_ONLY = visibleTourTabs({ tour: true, deals: false, finance: false })

function client(over: { advances?: ShowAdvance[]; travel?: TravelItem[]; guests?: GuestListEntry[]; settlements?: Settlement[]; invoices?: Invoice[] } = {}): Client {
  return {
    id: 'c1', name: 'Artist',
    tour: { shows: [], advances: over.advances ?? [], travel: over.travel ?? [], guestList: over.guests ?? [] },
    finance: { budgets: [], invoices: over.invoices ?? [], settlements: over.settlements ?? [] },
    business: { banking: { deposits: [] } },
  } as unknown as Client
}
const show = (o: Partial<Show> = {}): Show => ({ id: 's1', date: '2026-11-20', city: 'Lisbon', venue: 'LX', time: '20:00', status: 'confirmed', ...o })
const advance = (status: ShowAdvance['status']): ShowAdvance => ({ id: 'a1', showId: 's1', status } as unknown as ShowAdvance)
const settlement = (payments: number, total = 12000): Settlement => ({ id: 'st1', showIds: ['s1'], currency: 'USD', totalDue: total, payments: [{ label: 'Paid', amount: payments }] } as unknown as Settlement)
const steps = (c: Client, s: Show, tabs = ALL_TABS): ShowStep[] => showSteps(progressForShow(c, s, TODAY), s, tabs)
const by = (r: ShowStep[], key: string) => r.find(x => x.key === key)!

// ── everyone with the whole Tour page gets the six steps, in this order, each opening its own screen ──
let r = steps(client(), show())
assert.deepEqual(r.map(x => x.label), ['Details', 'Advance', 'Travel', 'Guests', 'Day sheet', 'Money'])
assert.deepEqual(r.map(x => x.sub), ['tour', 'advance', 'travel', 'guests', 'daysheet', 'budget'])
assert.deepEqual(r.filter(x => x.leaves).map(x => x.key), ['money'], 'only Money leaves the show page')

// ── a person only gets the steps whose screens they can open ──
assert.deepEqual(steps(client(), show(), TOUR_ONLY).map(x => x.key), ['tour', 'advance', 'travel', 'guests', 'daysheet'], 'no Finance: no Money step')
assert.deepEqual(steps(client(), show(), ['tour', 'advance']).map(x => x.key), ['tour', 'advance'], 'only some screens shared')
assert.deepEqual(steps(client(), show(), ['offers']).map(x => x.key), [], 'Deals & fees alone: no show steps at all')
assert.deepEqual(steps(client(), show(), ['budget']).map(x => x.key), ['money'], 'Finance alone: just Money')
assert.deepEqual(steps(client(), show(), ['settlements']).map(x => x.key), ['money'])

// ── the dots: Details follows the status ──
assert.equal(by(steps(client(), show({ status: 'hold' })), 'tour').tone, 'todo')
assert.equal(by(steps(client(), show({ status: 'confirmed' })), 'tour').tone, 'ok')
assert.equal(by(steps(client(), show({ status: 'cancelled' })), 'tour').tone, 'quiet')
assert.equal(by(steps(client(), show({ status: 'hold' })), 'tour').note, 'Still a hold')

// ── Advance, Travel and Guests follow the show's own facts ──
r = steps(client(), show())
assert.equal(by(r, 'advance').tone, 'todo'); assert.equal(by(r, 'advance').note, 'Not started')
assert.equal(by(steps(client({ advances: [advance('draft')] }), show()), 'advance').note, 'Draft')
assert.equal(by(steps(client({ advances: [advance('complete')] }), show()), 'advance').tone, 'ok')
assert.equal(by(r, 'travel').tone, 'quiet', 'nothing added: not a problem')
const pendingTrip = { id: 't1', kind: 'flight', status: 'pending', showIds: ['s1'] } as unknown as TravelItem
const bookedTrip = { id: 't2', kind: 'flight', status: 'booked', showIds: ['s1'] } as unknown as TravelItem
assert.equal(by(steps(client({ travel: [pendingTrip] }), show()), 'travel').tone, 'todo')
assert.equal(by(steps(client({ travel: [bookedTrip] }), show()), 'travel').tone, 'ok')
assert.equal(by(r, 'guests').tone, 'quiet')
assert.equal(by(r, 'daysheet').tone, 'none', 'the day sheet has no state of its own')
assert.equal(by(r, 'daysheet').note, undefined)

// ── Money: paid is ok, something still to collect is a to-do, nothing yet is quiet ──
assert.equal(by(r, 'money').tone, 'quiet', 'a show ahead with no budget or settlement')
const past = show({ date: '2026-09-22' })
assert.equal(by(steps(client(), past), 'money').tone, 'todo', 'played, no settlement entered')
assert.equal(by(steps(client({ settlements: [settlement(5000)] }), past), 'money').tone, 'todo', 'settlement entered, money still owed')
assert.equal(by(steps(client({ settlements: [settlement(12000)] }), past), 'money').tone, 'ok', 'paid in full')
assert.equal(by(steps(client({ settlements: [settlement(12000)] }), past), 'money').note, 'Paid in full')

// an overdue invoice on a show still ahead is a to-do for Money even though there is no settlement yet
const overdueInvoice = { id: 'inv1', number: 'INV-1', to: 'Promoter', category: 'Shows', status: 'sent', issuedDate: '2026-09-01', dueDate: '2026-10-01', items: [{ description: 'Fee', quantity: 1, rate: 1000 }], currency: 'USD' } as unknown as Invoice
assert.equal(by(steps(client({ invoices: [overdueInvoice] }), show({ invoiceId: 'inv1' })), 'money').tone, 'todo')
assert.equal(by(steps(client({ invoices: [{ ...overdueInvoice, dueDate: '2026-12-01' } as Invoice] }), show({ invoiceId: 'inv1' })), 'money').tone, 'quiet', 'an invoice not due yet is not a to-do')

// ── every step opens a screen this person can open (never a screen outside their tabs) ──
for (const tabs of [ALL_TABS, TOUR_ONLY, ['settlements'], ['budget'], ['tour', 'advance'], ['tour', 'budget'], ['guests']]) {
  for (const step of steps(client(), show(), tabs)) assert.ok(tabs.includes(step.sub), `${step.key} opens ${step.sub}, which is in ${tabs.join(',')}`)
}
assert.equal(by(steps(client(), show(), ['settlements']), 'money').sub, 'settlements', 'Settlements only: Money opens Settlements')
assert.equal(by(steps(client(), show(), ALL_TABS), 'money').sub, 'budget')

// ── the dots for a cancelled show, a hold that passed, and an invoice paid with no settlement ──
r = steps(client(), show({ status: 'cancelled' }))
assert.deepEqual([by(r, 'tour').tone, by(r, 'tour').note], ['quiet', 'Cancelled'])
r = steps(client(), show({ status: 'hold', date: '2026-09-22' }))
assert.equal(by(r, 'tour').tone, 'todo', 'a hold that passed is still a hold to deal with')
const paidInvoice = { id: 'inv2', number: 'INV-2', to: 'Promoter', category: 'Shows', status: 'paid', issuedDate: '2026-09-01', dueDate: '2026-10-01', paidDate: '2026-10-02', items: [{ description: 'Fee', quantity: 1, rate: 1000 }], currency: 'USD' } as unknown as Invoice
assert.notEqual(by(steps(client({ invoices: [paidInvoice] }), show({ invoiceId: 'inv2', date: '2026-09-22' })), 'money').tone, 'ok', 'a paid invoice alone is not "settled": the settlement is the money that counts')

// ── which show is on screen: the pick, else (on a step screen) the next one; never a history show; never changes the pick ──
type S = { id: string; date: string; status: Show['status']; historyOnly?: boolean }
const list: S[] = [
  { id: 'old', date: '2026-09-01', status: 'confirmed' }, { id: 'hist', date: '2025-01-01', status: 'confirmed', historyOnly: true },
  { id: 'next', date: '2026-11-01', status: 'confirmed' }, { id: 'later', date: '2026-12-01', status: 'confirmed' },
]
const shown = (picked: string | null, onStep: boolean) => stepsShowFor(list, picked, onStep, TODAY)?.id
assert.equal(shown('later', true), 'later', 'the pick wins on a step screen')
assert.equal(shown('later', false), 'later', 'and on Details')
assert.equal(shown(null, true), 'next', 'a step screen with nothing picked shows the next show')
assert.equal(shown(null, false), undefined, 'the summary has no show')
assert.equal(shown('gone', true), 'next', 'a pick that no longer exists falls back to the next show on a step screen')
assert.equal(shown('gone', false), undefined)
assert.equal(shown('hist', true), undefined, 'a history show has no steps, even on a step screen (it shows its details)')
assert.equal(shown('hist', false), undefined)
assert.equal(stepsShowFor([], null, true, TODAY), undefined, 'no shows: nothing to show')
assert.equal(stepsShowFor([{ id: 'h', date: '2026-11-01', status: 'confirmed', historyOnly: true }], null, true, TODAY), undefined, 'only history shows: nothing to show')
assert.equal(stepsShowFor([{ id: 'p', date: '2026-09-01', status: 'confirmed' }], null, true, TODAY)?.id, 'p', 'only a played show: that one')

console.log('show-steps checks passed')
