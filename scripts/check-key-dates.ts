// Checks the key-date rules (what a show needs by when, and when it starts to appear).  Run with:  npx tsx scripts/check-key-dates.ts
import assert from 'node:assert/strict'
import { buildKeyDates, keyDateKey } from '../src/lib/key-dates'
import type { Client, Show, Task } from '../src/types'

const TODAY = '2026-10-14'
const show = (id: string, date: string, extra: Partial<Show> = {}): Show =>
  ({ id, venue: 'Tresor', city: 'Berlin', date, status: 'confirmed', ...extra }) as unknown as Show
const client = (shows: Show[], extra: Record<string, unknown> = {}, tasks: Task[] = []) => {
  const { tour, ...rest } = extra
  return {
    id: 'c1', name: 'Alpha', tasks,
    tour: { shows, advances: [], travel: [], guestList: [], ...(tour as object) },
    finance: { budgets: [], invoices: [], settlements: [], expenses: [] },
    ...rest,
  } as unknown as Client
}
const keys = (c: Client) => buildKeyDates(c, TODAY).map(k => k.key)

// the advance is due 14 days before the show and starts to appear a week before that (21 days out)
assert.deepEqual(keys(client([show('s1', '2026-11-04')])), ['advance:s1'])          // 21 days out: appears, due Oct 21
assert.deepEqual(keys(client([show('s1', '2026-11-05')])), [])                      // 22 days out: not yet
const adv = buildKeyDates(client([show('s1', '2026-11-04')]), TODAY)[0]
assert.equal(adv.due, '2026-10-21')
assert.equal(adv.rule, 'advance')
assert.equal(adv.title, 'Start the advance · Tresor · Berlin')
assert.deepEqual(adv.go, { section: 'tour', sub: 'advance' })
assert.equal(adv.clientName, 'Alpha')

// overdue ones keep showing, with a due date in the past
const late = buildKeyDates(client([show('s1', '2026-10-20')]), TODAY)[0]
assert.equal(late.due, '2026-10-06')

// a finished advance moves on to the next thing: travel (due 21 days before), only if a trip is pending
const advanceDone = { tour: { advances: [{ showId: 's1', status: 'complete' }], travel: [{ id: 't1', showIds: ['s1'], status: 'needed' }] } }
const travel = buildKeyDates(client([show('s1', '2026-11-10')], advanceDone), TODAY)
assert.deepEqual(travel.map(k => [k.rule, k.due]), [['travel', '2026-10-20']])      // 27 days out: due Oct 20, within the 7-day lead
assert.deepEqual(buildKeyDates(client([show('s1', '2026-11-20')], advanceDone), TODAY), [])   // 37 days out: too early

// the day sheet is due 2 days before and appears from a week out
const allDone = { tour: { advances: [{ showId: 's1', status: 'complete' }], travel: [] } }
assert.deepEqual(buildKeyDates(client([show('s1', '2026-10-21')], allDone), TODAY).map(k => [k.rule, k.due]), [['daysheet', '2026-10-19']])
assert.deepEqual(buildKeyDates(client([show('s1', '2026-10-22')], allDone), TODAY), [])

// each is judged on its own records: an unfinished advance does not hide travel or the day sheet
const trips = { tour: { travel: [{ id: 't1', showIds: ['s1'], status: 'needed' }, { id: 't2', showIds: ['s1'], status: 'pending' }, { id: 't3', showIds: ['s1'], status: 'booked' }, { id: 't4', showIds: ['other'], status: 'needed' }] } }
const both = buildKeyDates(client([show('s1', '2026-11-03')], trips), TODAY)
assert.deepEqual(both.map(k => k.rule).sort(), ['advance', 'travel'])                 // advance never ticked, trips still to book: both show
assert.equal(both.find(k => k.rule === 'travel')!.title, 'Book 2 pending trips · Tresor · Berlin')   // only this show's open trips are counted
assert.equal(buildKeyDates(client([show('s1', '2026-11-03')], { tour: { travel: [{ id: 't', showIds: ['s1'], status: 'booked' }] } }), TODAY).some(k => k.rule === 'travel'), false)
const soon = buildKeyDates(client([show('s1', '2026-10-17')]), TODAY)               // 3 days out, the advance was never marked complete
assert.deepEqual(soon.map(k => k.rule).sort(), ['advance', 'daysheet'])              // the day sheet still shows
assert.equal(buildKeyDates(client([show('s1', '2026-11-03')], { tour: { travel: [{ id: 't1', showIds: ['s1'], status: 'pending' }] } }), TODAY).find(k => k.rule === 'travel')!.title.startsWith('Book 1 pending trip ·'), true)
// the wording follows how far the advance has got
assert.equal(buildKeyDates(client([show('s1', '2026-11-04')], { tour: { advances: [{ showId: 's1', status: 'draft' }] } }), TODAY)[0].title, 'Finish and send the advance · Tresor · Berlin')
assert.equal(buildKeyDates(client([show('s1', '2026-11-04')], { tour: { advances: [{ showId: 's1', status: 'sent' }] } }), TODAY)[0].title, 'Finish the advance · Tresor · Berlin')

// holds, cancelled shows, history, and shows already played raise nothing
assert.deepEqual(keys(client([show('a', '2026-11-01', { status: 'hold' }), show('b', '2026-11-01', { status: 'cancelled' }), show('c', '2026-11-01', { historyOnly: true }), show('d', '2026-10-01')])), [])

// a key date someone already took (open OR finished) does not come back
const taken: Task = { id: 't', title: 'x', source: 'auto', autoKey: keyDateKey('advance', 's1'), createdAt: '2026-10-01T00:00:00Z' }
assert.deepEqual(keys(client([show('s1', '2026-11-04')], {}, [taken])), [])
assert.deepEqual(keys(client([show('s1', '2026-11-04')], {}, [{ ...taken, doneAt: '2026-10-02T00:00:00Z' }])), [])
assert.deepEqual(keys(client([show('s1', '2026-11-04')], {}, [{ ...taken, autoKey: keyDateKey('advance', 'other') }])), ['advance:s1'])   // a different show's key does not hide it

// a demo artist raises key dates like any other, so the demo shows the app working
assert.deepEqual(keys(client([show('s1', '2026-11-04')], { isDemo: true })), ['advance:s1'])

// several shows come back soonest-due first
assert.deepEqual(keys(client([show('late', '2026-11-04'), show('early', '2026-10-30')])), ['advance:early', 'advance:late'])
console.log('key-dates: all checks passed')
