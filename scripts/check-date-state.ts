// Checks how dated things are classed (upcoming / due soon / overdue / done) and how shows are ordered.  Run with:  npx tsx scripts/check-date-state.ts
import assert from 'node:assert/strict'
import { SOON_DAYS, daysUntil, defaultShow, dueState, eventState, isUpcomingShow, nextShow, orderShows, showCounts, splitShows, type DatedShow } from '../src/lib/date-state'
import { getCalendarEvents } from '../src/lib/calendar'
import type { Client } from '../src/types'

const TODAY = '2026-10-19'
const show = (id: string, date: string, over: Partial<DatedShow> = {}): DatedShow => ({ id, date, status: 'confirmed', ...over })

// ── days between ──
assert.equal(daysUntil('2026-10-19', TODAY), 0)
assert.equal(daysUntil('2026-10-20', TODAY), 1)
assert.equal(daysUntil('2026-10-12', TODAY), -7)
assert.equal(daysUntil('2026-11-01', '2026-10-31'), 1)      // across a month end
assert.equal(daysUntil('2026-03-29', '2026-03-28'), 1)      // across a clock change
assert.equal(daysUntil('2026-10-19T09:30:00Z', TODAY), 0)   // a full timestamp counts as its day

// ── deadlines: overdue once passed and unfinished ──
assert.equal(SOON_DAYS, 7)
assert.equal(dueState('2026-10-18', TODAY), 'overdue')
assert.equal(dueState('2026-10-19', TODAY), 'soon')          // due today is "due soon", not overdue
assert.equal(dueState('2026-10-26', TODAY), 'soon')          // exactly 7 days
assert.equal(dueState('2026-10-27', TODAY), 'upcoming')      // 8 days
assert.equal(dueState('2026-10-01', TODAY, { done: true }), 'done')   // finished beats overdue
assert.equal(dueState('2026-10-27', TODAY, { soonDays: 14 }), 'soon')

// ── events: a played event is done, never overdue ──
assert.equal(eventState('2026-10-18', TODAY), 'done')
assert.equal(eventState('2026-10-19', TODAY), 'soon')
assert.equal(eventState('2026-12-01', TODAY), 'upcoming')

// ── which shows count as upcoming ──
assert.equal(isUpcomingShow(show('a', '2026-10-19'), TODAY), true)         // today counts
assert.equal(isUpcomingShow(show('a', '2026-10-18'), TODAY), false)
assert.equal(isUpcomingShow(show('a', '2026-11-01', { status: 'cancelled' }), TODAY), false)   // cancelled is never upcoming
assert.equal(isUpcomingShow(show('a', '2026-11-01', { historyOnly: true }), TODAY), false)
assert.equal(isUpcomingShow(show('a', '2026-11-01', { status: 'hold' }), TODAY), true)         // a hold is still ahead

// ── ordering: ahead soonest-first, played most-recent-first ──
const mixed = [show('old', '2026-08-14'), show('later', '2026-12-05'), show('recent', '2026-10-10'), show('soon', '2026-10-25'), show('cx', '2026-11-02', { status: 'cancelled' })]
const split = splitShows(mixed, TODAY)
assert.deepEqual(split.upcoming.map(s => s.id), ['soon', 'cx', 'later'])         // the cancelled show keeps its place
assert.deepEqual(split.past.map(s => s.id), ['recent', 'old'])
assert.deepEqual(orderShows(mixed, TODAY).map(s => s.id), ['soon', 'cx', 'later', 'recent', 'old'])
assert.deepEqual(orderShows(mixed, TODAY).length, mixed.length)                  // nothing lost
// same day: ordered by set time, then venue
assert.deepEqual(splitShows([show('b', '2026-10-25', { time: '21:00' }), show('a', '2026-10-25', { time: '19:00' })], TODAY).upcoming.map(s => s.id), ['a', 'b'])

// ── which show a screen opens on ──
assert.equal(nextShow(mixed, TODAY)?.id, 'soon')                                  // the next one that will happen (cancelled skipped)
assert.equal(defaultShow(mixed, TODAY)?.id, 'soon')
assert.equal(defaultShow([show('old', '2026-08-14'), show('recent', '2026-10-10')], TODAY)?.id, 'recent')   // nothing ahead: the one played most recently
assert.equal(defaultShow([show('x', '2026-11-02', { status: 'cancelled' }), show('recent', '2026-10-10')], TODAY)?.id, 'recent')
assert.equal(defaultShow([show('x', '2026-11-02', { status: 'cancelled' })], TODAY)?.id, 'x')    // only a cancelled future show: still something to open
assert.equal(defaultShow([], TODAY), undefined)
assert.equal(nextShow([show('old', '2026-08-14')], TODAY), undefined)

// ── the calendar gives every event its state ──
const client = {
  tour: { shows: [
    { id: 's1', date: '2026-10-10', city: 'A', venue: 'Played', time: '', status: 'confirmed' },
    { id: 's2', date: '2026-10-22', city: 'B', venue: 'Soon', time: '', status: 'confirmed' },
    { id: 's3', date: '2026-11-30', city: 'C', venue: 'Later', time: '', status: 'cancelled' },
  ] },
  songs: { albums: [{ id: 'al', title: 'EP', releaseDate: '2026-10-19', tracks: [] }] },
  content: { posts: [] },
  finance: {
    invoices: [
      { id: 'i1', number: 'INV-1', to: 'Promoter', status: 'sent', dueDate: '2026-09-02' }, { id: 'i2', number: 'INV-2', to: 'Other', status: 'paid', dueDate: '2026-09-02' },
      { id: 'i3', number: 'INV-3', to: 'Covered', status: 'sent', dueDate: '2026-09-02', currency: 'USD', items: [{ description: 'x', quantity: 1, rate: 500 }] },
      { id: 'i4', number: 'INV-4', to: 'Part paid', status: 'sent', dueDate: '2026-09-02', currency: 'USD', items: [{ description: 'x', quantity: 1, rate: 500 }] },
    ],
    expenses: [{ id: 'e1', vendor: 'Vans', amount: 100, currency: 'USD', paid: false, dueDate: '2026-10-21' }],
  },
  business: { banking: { deposits: [{ invoiceId: 'i3', amount: 500, currency: 'USD' }, { invoiceId: 'i4', amount: 200, currency: 'USD' }] } },
  legal: { contracts: [{ id: 'c1', title: 'Pub deal', status: 'signed', expiryDate: '2026-10-01', counterparty: 'Kobalt' }] },
  projects: [{ id: 'p1', title: 'Artwork', status: 'in-progress', dueDate: '2026-12-31' }],
  agentData: { offers: [{ id: 'o1', venue: 'Old inquiry', city: 'D', status: 'inquiry', date: '2026-09-20' }] },
} as unknown as Client
const events = getCalendarEvents(client, () => true, TODAY)
const state = (id: string) => events.find(e => e.id === id)?.state
assert.equal(state('show-s1'), 'done')
assert.equal(state('show-s2'), 'soon')
assert.equal(state('show-s3'), 'done')                                              // cancelled: done (struck through), not upcoming
assert.equal(events.find(e => e.id === 'show-s3')?.cancelled, true)
assert.equal(state('release-al'), 'soon')                                           // release day is today
assert.equal(state('invoice-i1'), 'overdue')
assert.equal(events.some(e => e.id === 'invoice-i2'), false)                        // paid invoices are not on the calendar
assert.equal(events.some(e => e.id === 'invoice-i3'), false)                        // ...nor ones whose deposits add up to the invoice
assert.equal(state('invoice-i4'), 'overdue')                                        // a part-paid one is still owed
assert.equal(state('bill-e1'), 'soon')
assert.equal(state('contract-c1'), 'overdue')
assert.equal(state('project-p1'), 'upcoming')
assert.equal(state('offer-o1'), 'done')                                             // an open offer for a date that has passed just fades

// ── the four numbers on an artist's Tour page ──
assert.deepEqual(showCounts([], TODAY), { comingUp: 0, confirmed: 0, onHold: 0, past: 0 })
const mix = [
  show('c1', '2026-11-01'), show('c2', TODAY), show('h1', '2026-11-05', { status: 'hold' }), show('x1', '2026-11-09', { status: 'cancelled' }),
  show('p1', '2026-09-01'), show('p2', '2026-09-02', { status: 'cancelled' }), show('p3', '2026-09-03', { status: 'hold' }), show('hist', '2025-01-01', { historyOnly: true }),
]
assert.deepEqual(showCounts(mix, TODAY), { comingUp: 3, confirmed: 2, onHold: 1, past: 3 })
assert.equal(showCounts([show('a', '2026-10-18'), show('b', '2026-10-19')], TODAY).past, 1, 'yesterday is past, today is still coming up')
assert.equal(showCounts([show('f', '2026-12-01', { historyOnly: true })], TODAY).comingUp, 0, 'a history-only show is never coming up')
assert.equal(showCounts(mix, TODAY).past, splitShows(mix.filter(s => !s.historyOnly), TODAY).past.length, 'the tile and the list header agree')

console.log('date-state checks passed')
