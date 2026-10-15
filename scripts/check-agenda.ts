// Checks the agenda helpers.  Run with:  npx tsx scripts/check-agenda.ts
import assert from 'node:assert/strict'
import { cleanPoint, nextPosition, pointsFor, progressOf, splitPoints, MAX_AGENDA_TEXT } from '../src/lib/agenda'
import type { AgendaPoint } from '../src/types'

const pt = (id: string, itemType: 'task' | 'project', itemId: string, position: number, done = false): AgendaPoint => ({ id, itemType, itemId, text: id, done, position })
const client = { agenda: [pt('c', 'project', 'p1', 2), pt('a', 'project', 'p1', 0), pt('b', 'project', 'p1', 0), pt('x', 'task', 'p1', 0), pt('y', 'project', 'p2', 0)] }

// one item's points, in order: by position, then the order they were added; other items and kinds are left out
assert.deepEqual(pointsFor(client, 'project', 'p1').map(p => p.id), ['a', 'b', 'c'])
assert.deepEqual(pointsFor(client, 'task', 'p1').map(p => p.id), ['x'])           // a task and a project can share an id: they are different things
assert.deepEqual(pointsFor(client, 'project', 'nope'), [])
assert.deepEqual(pointsFor(undefined, 'project', 'p1'), [])
assert.deepEqual(pointsFor({}, 'project', 'p1'), [])

assert.equal(nextPosition([]), 0)
assert.equal(nextPosition(pointsFor(client, 'project', 'p1')), 3)
assert.deepEqual(progressOf([pt('a', 'task', 't', 0, true), pt('b', 'task', 't', 1), pt('c', 'task', 't', 2, true)]), { done: 2, total: 3 })
assert.deepEqual(progressOf([]), { done: 0, total: 0 })

// typed text
assert.equal(cleanPoint('  Agree the schedule  '), 'Agree the schedule')
assert.equal(cleanPoint('- Ask about the advance'), 'Ask about the advance')
assert.equal(cleanPoint('* bullet'), 'bullet')
assert.equal(cleanPoint('• dot'), 'dot')
assert.equal(cleanPoint('3. numbered'), 'numbered')
assert.equal(cleanPoint('2) numbered too'), 'numbered too')
assert.equal(cleanPoint('2026 plan'), '2026 plan')                                // a number that is part of the text stays
assert.equal(cleanPoint('-nospace'), '-nospace')
assert.equal(cleanPoint('   '), '')
assert.equal(cleanPoint('x'.repeat(500)).length, MAX_AGENDA_TEXT)

// a pasted list becomes several points
assert.deepEqual(splitPoints('1. Schedule\n2. Budget\n\n- Travel\r\n   \nLast'), ['Schedule', 'Budget', 'Travel', 'Last'])
assert.deepEqual(splitPoints('a\nb\nc\nd', 2), ['a', 'b'])                         // only as many as there is room for
assert.deepEqual(splitPoints('a', 0), [])
assert.deepEqual(splitPoints(''), [])
console.log('agenda: all checks passed')
