// Checks the calendar clash warnings.  Run with:  npx tsx scripts/check-calendar-clashes.ts
import assert from 'node:assert/strict'
import type { Client } from '../src/types'
import { getCalendarEvents } from '../src/lib/calendar'
import { clashLine, findClashes, type ClashEvent } from '../src/lib/calendar-clashes'

let n = 0
const check = (name: string, fn: () => void) => { fn(); n++; console.log('  ok  ' + name) }
const TODAY = '2026-10-26'
let k = 0
const show = (date: string, title: string, status: ClashEvent['status'] = 'confirmed', clientId?: string, clientName?: string): ClashEvent =>
  ({ id: `s${k++}`, date, domain: 'show', title, status, clientId, clientName })
const offer = (date: string, title: string, clientId?: string): ClashEvent => ({ id: `o${k++}`, date, domain: 'offer', title, clientId })

check('two confirmed shows on one day for one artist is a clash', () => {
  const [c, ...rest] = findClashes([show('2026-11-06', 'The Fillmore'), show('2026-11-06', 'Brooklyn Steel')], TODAY)
  assert.equal(rest.length, 0); assert.equal(c.kind, 'double'); assert.deepEqual(c.booked, ['The Fillmore', 'Brooklyn Steel']); assert.equal(c.ids.length, 2)
})
check('a hold or an open offer on a day that already has a confirmed show is a clash; either alone is not', () => {
  assert.equal(findClashes([show('2026-11-06', 'A'), show('2026-11-06', 'B', 'hold')], TODAY)[0].kind, 'hold')
  assert.equal(findClashes([show('2026-11-06', 'A'), offer('2026-11-06', 'B')], TODAY)[0].kind, 'offer')
  assert.deepEqual(findClashes([show('2026-11-06', 'B', 'hold')], TODAY), [])
  assert.deepEqual(findClashes([offer('2026-11-06', 'B')], TODAY), [])
})
check('two holds, or a hold and an offer, are normal: that is how a date is kept open', () => {
  assert.deepEqual(findClashes([show('2026-11-06', 'A', 'hold'), show('2026-11-06', 'B', 'hold')], TODAY), [])
  assert.deepEqual(findClashes([show('2026-11-06', 'A', 'hold'), offer('2026-11-06', 'B')], TODAY), [])
})
check('cancelled shows never count, however they are marked', () => {
  assert.deepEqual(findClashes([show('2026-11-06', 'A'), show('2026-11-06', 'B', 'cancelled')], TODAY), [])
  assert.deepEqual(findClashes([show('2026-11-06', 'A'), { ...show('2026-11-06', 'B'), cancelled: true }], TODAY), [])
})
check('only today and later: yesterday is history, today still counts', () => {
  assert.deepEqual(findClashes([show('2026-10-25', 'A'), show('2026-10-25', 'B')], TODAY), [])
  assert.equal(findClashes([show(TODAY, 'A'), show(TODAY, 'B')], TODAY).length, 1)
})
check('different artists on the same day, or the same artist on different days, are fine', () => {
  assert.deepEqual(findClashes([show('2026-11-06', 'A', 'confirmed', 'x', 'X'), show('2026-11-06', 'B', 'confirmed', 'y', 'Y')], TODAY), [])
  assert.deepEqual(findClashes([show('2026-11-06', 'A'), show('2026-11-07', 'B')], TODAY), [])
})
check('one clash per artist per day, named for the worst; the others involved are listed', () => {
  const [c, ...rest] = findClashes([show('2026-11-06', 'A'), show('2026-11-06', 'B'), offer('2026-11-06', 'C'), show('2026-11-06', 'D', 'hold')], TODAY)
  assert.equal(rest.length, 0); assert.equal(c.kind, 'double'); assert.equal(c.ids.length, 4)
})
check('other kinds of date are ignored; clashes come back in date order, then artist name', () => {
  assert.deepEqual(findClashes([show('2026-11-06', 'A'), { id: 'p', date: '2026-11-06', domain: 'post', title: 'P' }], TODAY), [])
  const out = findClashes([
    show('2026-12-01', 'A', 'confirmed', 'b', 'Beta'), show('2026-12-01', 'B', 'confirmed', 'b', 'Beta'),
    show('2026-12-01', 'C', 'confirmed', 'a', 'Alpha'), show('2026-12-01', 'D', 'confirmed', 'a', 'Alpha'),
    show('2026-11-06', 'E', 'confirmed', 'b', 'Beta'), show('2026-11-06', 'F', 'confirmed', 'b', 'Beta'),
  ], TODAY)
  assert.deepEqual(out.map(c => `${c.date} ${c.clientName}`), ['2026-11-06 Beta', '2026-12-01 Alpha', '2026-12-01 Beta'])
})
check('the sentence says who, what and when in plain words, and counts the shows', () => {
  const [c] = findClashes([show('2026-11-06', 'The Fillmore', 'confirmed', 'x', 'Mascolo'), show('2026-11-06', 'Brooklyn Steel', 'confirmed', 'x', 'Mascolo')], TODAY)
  assert.equal(clashLine(c, 'Fri, Nov 6'), 'Mascolo: 2 shows on Fri, Nov 6 (The Fillmore and Brooklyn Steel)')
  const [three] = findClashes([show('2026-11-06', 'A'), show('2026-11-06', 'B'), show('2026-11-06', 'C')], TODAY)
  assert.equal(three.kind, 'double'); assert.equal(clashLine(three, 'Fri, Nov 6'), '3 shows on Fri, Nov 6 (A, B and C)')
  const [h] = findClashes([show('2026-11-06', 'A'), show('2026-11-06', 'B', 'hold')], TODAY)
  assert.equal(clashLine(h, 'Fri, Nov 6'), 'a hold at B on Fri, Nov 6, which already has a show at A')
  const [o] = findClashes([show('2026-11-06', 'A'), offer('2026-11-06', 'C')], TODAY)
  assert.equal(clashLine(o, 'Fri, Nov 6'), 'an open offer at C on Fri, Nov 6, which already has a show at A')
})
check('a hold or offer beside two shows is named as what it is, not counted as a show', () => {
  const [d] = findClashes([show('2026-11-06', 'A'), show('2026-11-06', 'B'), show('2026-11-06', 'H', 'hold'), offer('2026-11-06', 'O')], TODAY)
  assert.equal(clashLine(d, 'Fri, Nov 6'), '2 shows on Fri, Nov 6 (A and B), plus a hold at H and an open offer at O')
  const [m] = findClashes([show('2026-11-06', 'A'), show('2026-11-06', 'H', 'hold'), offer('2026-11-06', 'O')], TODAY)
  assert.equal(clashLine(m, 'Fri, Nov 6'), 'a hold at H on Fri, Nov 6, which already has a show at A, plus an open offer at O')
})
check('a show kept only for the record never clashes', () => {
  assert.deepEqual(findClashes([show('2026-11-06', 'A'), { ...show('2026-11-06', 'B'), historyOnly: true }], TODAY), [])
})
check('the calendar passes each show\'s status on, so holds and confirmed shows are told apart (the wire the warnings depend on)', () => {
  const shows = (list: [string, string, string][]) => ({
    tour: { shows: list.map(([id, date, status]) => ({ id, date, city: 'X', venue: `Venue ${id}`, time: '', status })) },
    songs: { albums: [] }, content: { posts: [] }, finance: { invoices: [], expenses: [] }, business: { banking: { deposits: [] } },
    legal: { contracts: [] }, projects: [], agentData: { offers: [] },
  }) as unknown as Client
  const clashesFor = (c: Client) => findClashes(getCalendarEvents(c, () => true, TODAY), TODAY)
  assert.equal(clashesFor(shows([['a', '2026-11-06', 'confirmed'], ['b', '2026-11-06', 'hold']]))[0].kind, 'hold')
  assert.deepEqual(clashesFor(shows([['a', '2026-11-06', 'hold'], ['b', '2026-11-06', 'hold']])), [], 'two holds are not a clash')
  assert.deepEqual(clashesFor(shows([['a', '2026-11-06', 'confirmed'], ['b', '2026-11-06', 'cancelled']])), [])
  const hist = shows([['a', '2026-11-06', 'confirmed'], ['b', '2026-11-06', 'confirmed']]); hist.tour.shows[1].historyOnly = true
  assert.deepEqual(clashesFor(hist), [], 'history-only shows are left out')
  assert.equal(clashesFor(shows([['a', '2026-11-06', 'confirmed'], ['b', '2026-11-06', 'confirmed'], ['c', '2026-11-06', 'confirmed']]))[0].booked.length, 3)
})
console.log(`${n} checks passed`)
