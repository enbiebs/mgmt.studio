// Checks reading the approval state of a track's versions.  Run with:  npx tsx scripts/check-round-approval.ts
import assert from 'node:assert/strict'
import { approvalLine, changesWanted, daysWaiting, roundsOf, waitingForAnswer } from '../src/lib/round-approval'
import type { Client, RoundApproval, TrackRound } from '../src/types'

process.env.TZ = 'UTC'          // dates here are the viewer's own day: pin the clock so the checks mean the same thing on any computer
let n = 0
const check = (name: string, fn: () => void) => { fn(); n++; console.log('  ok  ' + name) }
const TODAY = '2026-10-26'
const round = (id: string, approval?: RoundApproval): TrackRound => ({ id, label: id.toUpperCase(), stage: 'mix', notes: [], createdAt: '2026-10-01T00:00:00Z', ...(approval ? { approval } : {}) })
const client = (tracks: { id: string; title: string; rounds?: TrackRound[] }[]): Client => ({ songs: { albums: [{ id: 'al1', title: 'Debut', tracks }] } } as unknown as Client)

check('every version of every track is listed with where it sits', () => {
  const c = client([{ id: 't1', title: 'One', rounds: [round('v1'), round('v2')] }, { id: 't2', title: 'Two' }])
  assert.deepEqual(roundsOf(c).map(r => `${r.trackTitle}/${r.round.id}`), ['One/v1', 'One/v2'])
  assert.deepEqual(roundsOf({ songs: undefined } as unknown as Client), [])
})
check('versions waiting for the artist (only a track\'s newest), the longest-waiting first', () => {
  const c = client([{ id: 't1', title: 'One', rounds: [round('v1', { status: 'approved' }), round('v2', { status: 'awaiting', askedAt: '2026-10-20T10:00:00Z' })] }, { id: 't2', title: 'Two', rounds: [round('v1', { status: 'awaiting', askedAt: '2026-10-10T10:00:00Z' })] }])
  assert.deepEqual(waitingForAnswer(c).map(r => `${r.trackTitle}/${r.round.id}`), ['Two/v1', 'One/v2'])
  const old = client([{ id: 't1', title: 'One', rounds: [round('v1', { status: 'awaiting', askedAt: '2026-10-20T10:00:00Z' }), round('v2')] }])
  assert.deepEqual(waitingForAnswer(old), [], 'an older version that was asked about no longer waits once there is a newer one')
})
check('"I want changes" waits on the team only until there is a newer version or the question is asked again', () => {
  const asked = client([{ id: 't1', title: 'One', rounds: [round('v1', { status: 'changes', note: 'More low end' })] }])
  assert.deepEqual(changesWanted(asked).map(r => r.round.id), ['v1'])
  const newer = client([{ id: 't1', title: 'One', rounds: [round('v1', { status: 'changes' }), round('v2')] }])
  assert.deepEqual(changesWanted(newer), [], 'a newer version answers it')
  const again = client([{ id: 't1', title: 'One', rounds: [round('v1', { status: 'awaiting', askedAt: '2026-10-25T00:00:00Z' })] }])
  assert.deepEqual(changesWanted(again), [], 'asked again')
  assert.deepEqual(changesWanted(client([{ id: 't1', title: 'One', rounds: [round('v1', { status: 'changes' }), round('v2', { status: 'approved' })] }])), [])
})
check('days and dates are the viewer\'s own, not the server\'s (9pm in New York is already tomorrow in UTC)', () => {
  const was = process.env.TZ
  process.env.TZ = 'America/New_York'
  try {
    assert.equal(daysWaiting(round('v1', { status: 'awaiting', askedAt: '2026-10-26T01:00:00Z' }), '2026-10-26'), 1)      // 9pm on Oct 25 there: yesterday
    assert.equal(daysWaiting(round('v1', { status: 'awaiting', askedAt: '2026-10-26T01:00:00Z' }), '2026-10-27'), 2)
    assert.equal(approvalLine(round('v1', { status: 'awaiting', askedAt: '2026-10-26T01:00:00Z' }), 'M', '2026-10-26'), "Waiting for M's OK since Oct 25, 2026")
    assert.equal(approvalLine(round('v1', { status: 'changes', by: 'M', at: '2026-10-27T01:00:00Z' }), 'M', TODAY), 'M wants changes (Oct 26, 2026)')
  } finally { if (was === undefined) delete process.env.TZ; else process.env.TZ = was }
})
check('how long a request has been waiting', () => {
  assert.equal(daysWaiting(round('v1', { status: 'awaiting', askedAt: '2026-10-20T23:00:00Z' }), TODAY), 6)
  assert.equal(daysWaiting(round('v1', { status: 'awaiting', askedAt: '2026-10-26T01:00:00Z' }), TODAY), 0)
  assert.equal(daysWaiting(round('v1', { status: 'awaiting', askedAt: '2027-01-01T00:00:00Z' }), TODAY), 0, 'never negative')
  assert.equal(daysWaiting(round('v1', { status: 'awaiting' }), TODAY), 0)
  assert.equal(daysWaiting(round('v1'), TODAY), 0)
})
check('the line that says where a version stands', () => {
  assert.equal(approvalLine(round('v1'), 'Mascolo', TODAY), null)
  assert.equal(approvalLine(round('v1', { status: 'awaiting', askedAt: '2026-10-25T10:00:00Z' }), 'Mascolo', TODAY), "Waiting for Mascolo's OK since Oct 25, 2026")
  assert.match(approvalLine(round('v1', { status: 'awaiting', askedAt: '2026-10-20T10:00:00Z' }), 'Mascolo', TODAY)!, /\(6 days\)$/)
  assert.equal(approvalLine(round('v1', { status: 'approved', by: 'Mascolo', at: '2026-10-25T10:00:00Z', note: 'Love it' }), 'X', TODAY), 'Approved by Mascolo on Oct 25, 2026: “Love it”')
  assert.equal(approvalLine(round('v1', { status: 'changes', by: 'Mascolo', at: '2026-10-25T10:00:00Z', note: 'Less reverb' }), 'X', TODAY), 'Mascolo wants changes (Oct 25, 2026): “Less reverb”')
  assert.equal(approvalLine(round('v1', { status: 'changes' }), 'Mascolo', TODAY), 'Mascolo wants changes')
  assert.ok(approvalLine(round('v1', { status: 'approved', note: 'x'.repeat(500) }), 'M', TODAY)!.length < 200, 'a long note is cut')
})
console.log(`${n} checks passed`)
