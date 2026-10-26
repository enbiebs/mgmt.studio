// Checks asking for approval and answering in the app (no database: the same actions with nothing saved to a server).
// Run with:  npx tsx scripts/check-round-approval-store.ts
import assert from 'node:assert/strict'
import { useStore } from '../src/lib/store'
import { openInboxItem } from '../src/lib/inbox-open'
import type { InboxItem } from '../src/lib/inbox'
import type { Client, TrackRound } from '../src/types'

const round = (id: string): TrackRound => ({ id, label: id.toUpperCase(), stage: 'mix', audioPath: 'x/y.mp3', notes: [], createdAt: '2026-10-01T00:00:00Z' })
const artist = (id: string, rounds: TrackRound[]): Client => ({
  id, name: `Artist ${id}`, songs: { albums: [{ id: `al-${id}`, title: 'A', tracks: [{ id: `t-${id}`, title: 'One', rounds }] }] },
  legal: { contracts: [] }, tour: { shows: [], advances: [], travel: [], guestList: [] }, finance: { budgets: [], invoices: [], expenses: [], settlements: [] },
  content: { posts: [] }, agentData: { offers: [] }, business: { banking: { deposits: [] } }, projects: [],
}) as unknown as Client

useStore.setState({ data: { clients: [artist('c1', [round('v1'), round('v2')]), artist('c2', [round('w1')])] }, clientId: 'c1', workspaceId: null })
const st = () => useStore.getState()
const roundOf = (cid: string, id: string) => st().data.clients.find(c => c.id === cid)!.songs.albums[0].tracks[0].rounds!.find(r => r.id === id)!

async function main() {
  assert.equal(roundOf('c1', 'v1').approval, undefined, 'a version starts with no request')

  st().askRoundApproval('v1', true)
  assert.equal(roundOf('c1', 'v1').approval?.status, 'awaiting'); assert.ok(roundOf('c1', 'v1').approval?.askedAt)
  assert.equal(roundOf('c1', 'v2').approval, undefined, 'only that version')
  assert.equal(roundOf('c2', 'w1').approval, undefined, 'only that artist')

  st().askRoundApproval('v1', false)
  assert.equal(roundOf('c1', 'v1').approval, undefined, 'taking it back clears it')

  // answering
  assert.equal(await st().answerRound('v1', 'approved', 'x'), false, 'a version nobody asked about cannot be answered')
  assert.equal(roundOf('c1', 'v1').approval, undefined)
  st().askRoundApproval('v1', true)
  assert.equal(await st().answerRound('v1', 'changes', '  More low end  '), true)
  const a = roundOf('c1', 'v1').approval!
  assert.deepEqual([a.status, a.by, a.note], ['changes', 'Artist c1', 'More low end'], 'the answer carries the artist\'s name and the trimmed note')
  assert.ok(a.at && a.askedAt)
  assert.equal(await st().answerRound('v1', 'approved', ''), false, 'an answered version cannot be answered again')
  assert.equal(roundOf('c1', 'v1').approval?.status, 'changes')

  // asking again after "changes" starts over
  st().askRoundApproval('v1', true)
  assert.deepEqual([roundOf('c1', 'v1').approval?.status, roundOf('c1', 'v1').approval?.by, roundOf('c1', 'v1').approval?.note], ['awaiting', undefined, undefined], 'an old answer does not hang about')
  st().askRoundApproval('v1', true)
  assert.equal(await st().answerRound('v1', 'approved', ''), true)
  assert.equal(roundOf('c1', 'v1').approval?.note, undefined, 'a blank note is no note')

  // a manager looking at the artist's page ("view as") cannot answer for them
  st().askRoundApproval('w1', true)
  useStore.setState({ previewMemberId: 'someone', clientId: 'c2' })
  assert.equal(await st().answerRound('w1', 'approved', ''), false)
  assert.equal(roundOf('c2', 'w1').approval?.status, 'awaiting', 'nothing changed')
  useStore.setState({ previewMemberId: null, clientId: 'c1' })

  // "Open" on a release alert lands on that release, not the first one listed
  const item = { key: 'k', clientId: 'c1', clientName: 'Artist c1', rule: 'release', entityId: 'al-c1', severity: 'soon', title: 't', go: { section: 'songs', sub: 'checklist' } } as InboxItem
  openInboxItem(item)
  assert.equal(st().selectedAlbumId, 'al-c1'); assert.equal(st().section, 'songs'); assert.equal(st().songsSub, 'checklist')

  // an unknown version does nothing
  st().askRoundApproval('nope', true)
  assert.equal(await st().answerRound('nope', 'approved', ''), false)
  console.log('round approval store checks passed')
}
main().catch(e => { console.error(e); process.exit(1) })
