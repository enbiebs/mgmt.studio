// Checks the "who needs you most" ranking.  Run with:  npx tsx scripts/check-attention-table.ts
import assert from 'node:assert/strict'
import type { InboxItem, InboxSeverity } from '../src/lib/inbox'
import { attentionRows } from '../src/lib/attention-table'

let n = 0
const check = (name: string, fn: () => void) => { fn(); n++; console.log('  ok  ' + name) }
let k = 0
const item = (clientId: string, severity: InboxSeverity, date?: string, title = 'x'): InboxItem => ({
  key: `k${k++}`, clientId, clientName: clientId.toUpperCase(), rule: 'invoice', entityId: 'e', severity, title, date, go: { section: 'finance' },
})

check('one row per artist, heads-ups never count, artists with only heads-ups are left out', () => {
  const rows = attentionRows([item('a', 'urgent'), item('a', 'soon'), item('b', 'info'), item('c', 'soon')])
  assert.deepEqual(rows.map(r => r.clientId), ['a', 'c'])
  assert.deepEqual([rows[0].urgent, rows[0].soon, rows[0].more], [1, 1, 1])
})
check('the artist with the most urgent things goes first, then the most coming up, then the name', () => {
  const rows = attentionRows([
    item('a', 'soon'), item('a', 'soon'), item('a', 'soon'),
    item('b', 'urgent'),
    item('c', 'urgent'), item('c', 'urgent'),
    item('d', 'soon'), item('d', 'soon'), item('d', 'soon'),
  ])
  assert.deepEqual(rows.map(r => r.clientId), ['c', 'b', 'a', 'd'])
})
check('with the same number urgent, more coming up goes first; with everything level, the name decides (not the order they arrived in)', () => {
  assert.deepEqual(attentionRows([item('a', 'urgent'), item('a', 'soon'), item('b', 'urgent'), item('b', 'soon'), item('b', 'soon')]).map(r => r.clientId), ['b', 'a'])
  assert.deepEqual(attentionRows([item('d', 'soon'), item('a', 'soon'), item('c', 'soon'), item('b', 'soon')]).map(r => r.clientId), ['a', 'b', 'c', 'd'])
})
check('the top alert is the most severe, then the earliest date, whatever order they arrive in', () => {
  const soonEarly = item('a', 'soon', '2026-11-01', 'early'); const urgentLate = item('a', 'urgent', '2026-12-30', 'late urgent'); const urgentSoonest = item('a', 'urgent', '2026-11-05', 'soonest urgent')
  for (const order of [[soonEarly, urgentLate, urgentSoonest], [urgentSoonest, soonEarly, urgentLate], [urgentLate, urgentSoonest, soonEarly]]) assert.equal(attentionRows(order)[0].top.title, 'soonest urgent')
  assert.equal(attentionRows([item('a', 'soon', undefined, 'no date'), item('a', 'soon', '2026-11-01', 'dated')])[0].top.title, 'dated', 'undated goes last')
})
check('heads-ups on an artist who also has real alerts change neither the top alert nor the count behind it', () => {
  const [r] = attentionRows([item('a', 'info', '2026-10-01', 'heads-up'), item('a', 'soon', '2026-12-01', 'real')])
  assert.equal(r.top.title, 'real'); assert.equal(r.more, 0); assert.equal(r.soon, 1)
})
check('two alerts equally pressing: the same one comes first however they arrive', () => {
  const x = { ...item('a', 'soon', '2026-11-01', 'x'), key: 'a-key' }; const y = { ...item('a', 'soon', '2026-11-01', 'y'), key: 'b-key' }
  assert.equal(attentionRows([x, y])[0].top.title, 'x'); assert.equal(attentionRows([y, x])[0].top.title, 'x')
})
check('practice-artist alerts are left out, so they never rank beside real artists', () => {
  assert.deepEqual(attentionRows([{ ...item('demo', 'urgent'), demo: true }, item('a', 'soon')]).map(r => r.clientId), ['a'])
})
check('nothing in, nothing out; the input is not changed', () => {
  assert.deepEqual(attentionRows([]), [])
  const input = [item('a', 'soon', '2026-11-02'), item('a', 'urgent', '2026-11-09')]
  const copy = [...input]; attentionRows(input); assert.deepEqual(input, copy)
})
console.log(`${n} checks passed`)
