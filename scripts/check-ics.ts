// Checks the calendar feed: a held date is tentative and a cancelled show is cancelled, never a plain confirmed event.
// Run with:  npx tsx scripts/check-ics.ts
import assert from 'node:assert/strict'
import { buildIcsFeed, foldLine, showTitle } from '../src/lib/ics'
import type { Show } from '../src/types'

const show = (o: Partial<Show> & { id: string }): Show => ({ date: '2026-11-14', city: 'Lisbon', venue: 'LX Factory', time: '20:00', status: 'confirmed', ...o })
const events = (feed: string) => feed.split('BEGIN:VEVENT').slice(1).map(e => e.split('END:VEVENT')[0])
const field = (event: string, name: string) => event.split('\r\n').find(l => l.startsWith(name + ':'))?.slice(name.length + 1)

const feed = buildIcsFeed('Nova Lane', [
  show({ id: 'c1' }),
  show({ id: 'h1', status: 'hold', city: 'Porto', venue: 'Hard Club' }),
  show({ id: 'x1', status: 'cancelled', city: 'Faro', venue: 'Teatro' }),
  show({ id: 'old', status: undefined as unknown as Show['status'], city: 'Rome', venue: 'Monk' }),   // an older row with no status is a normal booking
])
const [conf, hold, cancelled, older] = events(feed)

assert.equal(field(conf, 'STATUS'), 'CONFIRMED')
assert.equal(field(conf, 'SUMMARY'), 'LX Factory — Lisbon', 'a confirmed show keeps its plain title')
assert.equal(field(conf, 'TRANSP'), undefined)

assert.equal(field(hold, 'STATUS'), 'TENTATIVE', 'a held date is tentative')
assert.equal(field(hold, 'SUMMARY'), 'HOLD: Hard Club — Porto', 'and says so in the title, for apps that ignore status')

assert.equal(field(cancelled, 'STATUS'), 'CANCELLED', 'a cancelled show is cancelled')
assert.equal(field(cancelled, 'SUMMARY'), 'CANCELLED: Teatro — Faro')
assert.equal(field(cancelled, 'TRANSP'), 'TRANSPARENT', 'and no longer blocks time')
assert.equal(field(cancelled, 'UID'), 'x1@mgmtstudio', 'it keeps its id, so a calendar updates the event it already has')

assert.equal(field(older, 'STATUS'), 'CONFIRMED')
assert.equal(events(feed).length, 4, 'every show is still in the feed')
assert.equal(events(buildIcsFeed('Nova', [])).length, 0)
assert.ok(feed.startsWith('BEGIN:VCALENDAR') && feed.trimEnd().endsWith('END:VCALENDAR'))
assert.equal(field(events(buildIcsFeed('N', [show({ id: 'e', venue: 'Bar; Grill, Co', city: 'X', status: 'hold' })]))[0], 'SUMMARY'), 'HOLD: Bar\\; Grill\\, Co — X', 'punctuation in a venue name is escaped')

// ── the same title goes to Google Calendar ──
assert.deepEqual([showTitle(show({ id: 'a' })), showTitle(show({ id: 'b', status: 'hold' })), showTitle(show({ id: 'c', status: 'cancelled' }))], ['LX Factory — Lisbon', 'HOLD: LX Factory — Lisbon', 'CANCELLED: LX Factory — Lisbon'])

// ── long lines are folded the way calendar apps expect (75 bytes), without splitting a character ──
const bytes = (s: string) => new TextEncoder().encode(s).length
assert.equal(foldLine('SHORT'), 'SHORT')
const long = 'SUMMARY:' + 'Théâtre — '.repeat(12)
const folded = foldLine(long)
assert.equal(folded.split('\r\n').every(l => bytes(l) <= 75), true, 'no physical line is over 75 bytes')
assert.equal(folded.split('\r\n').slice(1).every(l => l.startsWith(' ')), true, 'each continuation starts with one space')
assert.equal(folded.replace(/\r\n /g, ''), long, 'unfolding gives back the original, characters intact')
assert.equal(foldLine('x'.repeat(75)).includes('\r\n'), false, 'exactly 75 bytes is fine')
assert.equal(foldLine('x'.repeat(76)).split('\r\n').length, 2)
const longFeed = buildIcsFeed('N', [show({ id: 'l', venue: 'The Very Long Named Concert Hall and Cultural Centre', city: 'Santiago de Compostela', status: 'cancelled' })])
assert.equal(longFeed.split('\r\n').every(l => bytes(l) <= 75), true, 'a long cancelled title still fits')
assert.equal(field(events(longFeed.replace(/\r\n /g, ''))[0], 'SUMMARY'), 'CANCELLED: The Very Long Named Concert Hall and Cultural Centre — Santiago de Compostela', 'and reads back whole')

console.log('ics checks passed')
