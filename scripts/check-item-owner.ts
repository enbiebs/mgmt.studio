// Checks owners on offers and shows: who may own, what reads as "nobody", the "Just mine" view, what is carried or hidden.  Run with:  npx tsx scripts/check-item-owner.ts
import assert from 'node:assert/strict'
import { buildInbox, type InboxAccess } from '../src/lib/inbox'
import { filterClientForViewer, type Viewer } from '../src/lib/item-access'
import { describeEntry, type ActivityEntry } from '../src/lib/activity'
import { buildOfferSheetSnapshot } from '../src/lib/offer-sheet'
import {
  canOwn, isOwnedBy, justMine, offerNeedsOwner, ownerChoices, ownerField, ownerName, ownerWords,
  ownerPatch, ownerToCarry, resolveOwner, showNeedsOwner, withoutOwner, withoutOwners,
} from '../src/lib/item-owner'
import { loadCompany, useStore } from '../src/lib/store'
import { assembleWorkspace, offerRow, showRow } from '../src/lib/db'
import { buildDemoRows } from '../src/lib/demo-seed'
import { toWorkspaceRows } from '../src/lib/demo-sql'
import { onNotice, type Notice } from '../src/lib/notify'
import { ownerRefusalText, ownerSavesIdle, rowSaved, saveOwners, trackRow, type OwnerWrite } from '../src/lib/owner-save'
import type { AppData, Budget, Client, Show, TourOffer, WorkspacePerson } from '../src/types'

let n = 0
const check = (name: string, fn: () => void) => { fn(); n++; console.log('  ok  ' + name) }

const person = (userId: string, label: string, p: Partial<WorkspacePerson> = {}): WorkspacePerson =>
  ({ memberId: 'm-' + userId, userId, label, role: 'manager', allClients: false, clientIds: [], ...p })
const jen = person('u-jen', 'Jen Park', { clientIds: ['c1'] })
const sam = person('u-sam', 'Sam', { allClients: true })
const raj = person('u-raj', 'raj@agency.com', { clientIds: ['c2'] })          // can open another artist only, and known only by email
const art = person('u-art', 'The Artist', { role: 'artist', allClients: true }) // an artist login is never an owner
const eli = person('u-eli', 'Eli', { allClients: true })
const people = [jen, sam, raj, art, eli]

// ── who may own ──
check('a teammate who can open the artist may own; one who can only open another artist may not; an artist login never may', () => {
  assert.equal(canOwn(jen, 'c1'), true)
  assert.equal(canOwn(jen, 'c2'), false)
  assert.equal(canOwn(sam, 'anything'), true)               // all artists
  assert.equal(canOwn(art, 'c1'), false)
})
check('the choices are only people who can open this artist, you first, then by name', () => {
  assert.deepEqual(ownerChoices(people, 'c1', null).map(p => p.userId), ['u-eli', 'u-jen', 'u-sam'])
  assert.deepEqual(ownerChoices(people, 'c1', 'u-sam').map(p => p.userId), ['u-sam', 'u-eli', 'u-jen'])
  assert.deepEqual(ownerChoices(people, 'c2', null).map(p => p.userId), ['u-eli', 'u-raj', 'u-sam'])
})
check('the input list is not reordered by choosing from it', () => {
  const copy = [...people]; ownerChoices(people, 'c1', 'u-sam'); assert.deepEqual(people, copy)
})

// ── what an owner reads as ──
check('no owner reads as none; a valid owner reads as set', () => {
  assert.deepEqual(resolveOwner(undefined, people, 'c1'), { state: 'none' })
  assert.deepEqual(resolveOwner('', people, 'c1'), { state: 'none' })
  const o = resolveOwner('u-jen', people, 'c1'); assert.equal(o.state, 'set'); assert.equal(o.state === 'set' && o.person.userId, 'u-jen')
})
check('an owner who can no longer open the artist reads as lost, never as set (nobody silently owns what they cannot open)', () => {
  assert.equal(resolveOwner('u-jen', people, 'c2').state, 'lost')                                          // Jen cannot open c2
  assert.equal(resolveOwner('u-jen', [person('u-jen', 'Jen', { clientIds: [] })], 'c1').state, 'lost')     // her access was taken away
  assert.equal(resolveOwner('u-gone', people, 'c1').state, 'lost')                                          // not on the team at all any more
  assert.equal(resolveOwner('u-art', people, 'c1').state, 'lost')                                           // an artist login
})
check('names: a plain name stays as written, a login known only by email shows what is before the @, "You" when it is you', () => {
  assert.equal(ownerName(jen), 'Jen Park'); assert.equal(ownerName(raj), 'raj')
  assert.equal(ownerWords(jen, 'u-jen'), 'You'); assert.equal(ownerWords(jen, 'u-sam'), 'Jen Park'); assert.equal(ownerWords(jen, null), 'Jen Park')
})

// ── Just mine ──
const offer = (id: string, ownerId?: string, status: TourOffer['status'] = 'hold'): TourOffer =>
  ({ id, venue: 'V' + id, city: 'City', country: 'US', date: '2026-12-01', promoter: 'P', guarantee: 1000, status, ...(ownerId ? { ownerId } : {}) })
check('"Just mine" keeps only what I own, and an owner who lost access is nobody (so it is not mine)', () => {
  const items = [offer('a', 'u-jen'), offer('b', 'u-sam'), offer('c'), offer('d', 'u-gone')]
  assert.deepEqual(justMine(items, 'u-jen', people, 'c1').map(i => i.id), ['a'])
  assert.deepEqual(justMine(items, 'u-sam', people, 'c1').map(i => i.id), ['b'])
  assert.deepEqual(justMine(items, 'u-gone', people, 'c1').map(i => i.id), [], 'someone no longer on the team owns nothing')
  assert.deepEqual(justMine(items, null, people, 'c1'), [], 'with nobody signed in, nothing is mine')
  assert.equal(isOwnedBy(offer('a', 'u-jen'), 'u-jen', people, 'c2'), false, 'not mine on an artist I cannot open')
})

// ── what is worth asking an owner for ──
check('only live offers and upcoming shows ask for an owner', () => {
  for (const s of ['inquiry', 'hold', 'confirmed'] as const) assert.equal(offerNeedsOwner({ status: s }), true, s)
  for (const s of ['settled', 'cancelled'] as const) assert.equal(offerNeedsOwner({ status: s }), false, s)
  const t = '2026-11-10'
  assert.equal(showNeedsOwner({ status: 'confirmed', date: '2026-11-10' }, t), true, 'today counts')
  assert.equal(showNeedsOwner({ status: 'hold', date: '2026-12-01' }, t), true)
  assert.equal(showNeedsOwner({ status: 'confirmed', date: '2026-11-09' }, t), false, 'past')
  assert.equal(showNeedsOwner({ status: 'cancelled', date: '2026-12-01' }, t), false)
  assert.equal(showNeedsOwner({ status: 'confirmed', date: '2026-12-01', historyOnly: true }, t), false)
})

// ── carried over, never invented ──
check('ownerField spreads nothing when there is no owner, so no "ownerId: undefined" sneaks into a new record', () => {
  assert.deepEqual(ownerField({}), {}); assert.deepEqual(ownerField({ ownerId: '' }), {})
  assert.deepEqual(ownerField({ ownerId: 'u-jen' }), { ownerId: 'u-jen' })
  assert.equal('ownerId' in { ...ownerField({}) }, false)
})

// ── the artist never sees owners ──
const show = (id: string, ownerId?: string): Show => ({ id, date: '2026-12-01', city: 'City', venue: 'V' + id, time: '20:00', status: 'confirmed', ...(ownerId ? { ownerId } : {}) })
check('withoutOwner removes the owner and leaves the rest, without changing the original', () => {
  const s = show('s1', 'u-jen'); const out = withoutOwner(s)
  assert.equal('ownerId' in out, false); assert.equal(out.venue, 'Vs1'); assert.equal(s.ownerId, 'u-jen')
  const none = show('s2'); assert.equal(withoutOwner(none), none)
})
const fullClient = (): Client => ({
  id: 'c1', name: 'Artist',
  tour: { shows: [show('s1', 'u-jen')], advances: [], guestList: [], offerSheets: [], travel: [] },
  songs: { albums: [] }, content: { posts: [] }, projects: [], legal: { contracts: [] },
  finance: { invoices: [], expenses: [], vendors: [], budgets: [], crewRates: [], settings: undefined, settlements: [] },
  agentData: { offers: [offer('o1', 'u-jen')] }, tasks: [], business: { banking: { deposits: [] } },
} as unknown as Client)
check('the artist\'s own login gets shows without their owner; the team keeps it', () => {
  const asArtist: Viewer = { memberId: 'm', role: 'artist', clientId: 'c1', grants: [] }
  const art1 = filterClientForViewer(fullClient(), asArtist, [])
  assert.equal(art1.tour.shows.length, 1); assert.equal(art1.tour.shows[0].ownerId, undefined)
  const asManager: Viewer = { memberId: 'm', role: 'manager', clientId: null, grants: [], userId: 'u-sam' }
  const mgr = filterClientForViewer(fullClient(), asManager, [])
  assert.equal(mgr.tour.shows[0].ownerId, 'u-jen'); assert.equal(mgr.agentData.offers[0].ownerId, 'u-jen')
})
check('an offer sheet never carries the owner', () => {
  const budget = { id: 'b', currency: 'USD', lines: [], commissions: [], notes: '' } as unknown as Budget
  for (const detail of ['full', 'summary'] as const) {
    const snap = buildOfferSheetSnapshot({ client: fullClient(), offer: offer('o1', 'u-jen'), budget, detail })
    assert.equal(JSON.stringify(snap).includes('u-jen'), false, detail)
    assert.equal(JSON.stringify(snap).toLowerCase().includes('owner'), false, detail)
  }
})

// ── alerts say whose it is ──
const ALL: InboxAccess = { finance: true, tour: true, deals: true, legal: true, projects: true, music: true }
const TODAY = '2026-11-10'
check('every alert about an offer or a show carries its owner; unowned ones carry none (not even an empty key)', () => {
  const c = fullClient()
  const withTerms = (id: string, respondBy: string | undefined, o: Partial<TourOffer> = {}): TourOffer => ({ ...offer(id, o.ownerId), ...o, terms: respondBy ? { respondBy } : undefined } as TourOffer)
  const offers = [
    withTerms('late', '2026-11-08', { ownerId: 'u-jen' }),      // reply was due 2 days ago
    withTerms('three', '2026-11-12', { ownerId: 'u-jen' }),     // reply due in 2 days
    withTerms('seven', '2026-11-16', { ownerId: 'u-sam' }),     // reply due in 6 days
    withTerms('hold', undefined, { ownerId: 'u-jen', date: '2026-11-20' }),   // a hold 10 days away, still unconfirmed
    withTerms('sheetA', undefined, { ownerId: 'u-sam' }), withTerms('sheetP', undefined, { ownerId: 'u-jen' }), withTerms('sheetS', undefined, { ownerId: 'u-sam' }),
    withTerms('nobody', '2026-11-11'),                           // nobody owns it
  ]
  const sheet = (id: string, offerId: string, status: string, extra: object = {}) => ({ id, offerId, version: 1, status, detail: 'summary', snapshot: {}, sentAt: '2026-11-01T10:00:00Z', ...extra })
  c.agentData = { offers }
  c.tour = { ...c.tour,
    offerSheets: [sheet('shA', 'sheetA', 'approved', { respondedAt: '2026-11-09T10:00:00Z' }), sheet('shP', 'sheetP', 'passed', { respondedAt: '2026-11-09T10:00:00Z' }), sheet('shS', 'sheetS', 'sent')],
    shows: [
      { ...show('s1', 'u-sam'), date: '2026-10-01' }, { ...show('s2'), date: '2026-10-01' },    // happened, no settlement
      { ...show('s3', 'u-jen'), date: '2026-11-20' }, { ...show('s4'), date: '2026-11-20' },    // coming up, no budget
    ],
  } as unknown as Client['tour']
  const items = buildInbox(c, TODAY, ALL)
  const owners = new Map<string, string | undefined>([...offers.map(o => [o.id, o.ownerId] as const), ['shA', 'u-sam'], ['shP', 'u-jen'], ['shS', 'u-sam'], ...c.tour.shows.map(x => [x.id, x.ownerId] as const)])
  const about = items.filter(i => ['offer_reply', 'offer_hold', 'sheet', 'no_settlement', 'no_budget'].includes(i.rule))
  // every kind of alert the rule list can raise about an offer or a show is exercised here (so a rule that forgets the owner cannot hide)
  assert.deepEqual([...new Set(about.map(i => i.rule))].sort(), ['no_budget', 'no_settlement', 'offer_hold', 'offer_reply', 'sheet'])
  assert.equal(about.filter(i => i.rule === 'offer_reply').length, 4)         // late, three, seven, nobody
  assert.equal(about.filter(i => i.rule === 'sheet').length, 3)               // approved, passed, waiting
  for (const i of about) {
    const expected = owners.get(i.entityId)
    if (expected) assert.equal(i.ownerId, expected, `${i.rule} ${i.entityId}`)
    else assert.equal('ownerId' in i, false, `${i.rule} ${i.entityId} has no owner, so no key either`)
  }
})

// ── the owner is saved on its own, never inside the save of the row ──
check('a save of a show or an offer never writes the owner (an old copy on screen must not overwrite a newer owner)', () => {
  assert.equal('owner_user' in showRow({ ...show('s1', 'u-jen') }, 'c1'), false)
  assert.equal('owner_user' in offerRow({ ...offer('o1', 'u-jen') }, 'c1'), false)
  // (and the rest of the row is still there)
  assert.equal(showRow(show('s1'), 'c1').venue, 'Vs1'); assert.equal(offerRow(offer('o1'), 'c1').venue, 'Vo1')
})
check('the owner is read back from the database rows, for shows and for offers', () => {
  const ctx = { anchor: '2026-11-10', clientId: 'zz-demo', ownerUserId: 'f7303cf1-f728-46a2-a861-dc7787c00d9c' }
  const rows = buildDemoRows(ctx)
  assert.ok(rows.shows.length > 1 && rows.tour_offers.length > 1)
  const withOwner = { ...rows, shows: rows.shows.map((r, i) => (i === 0 ? { ...r, owner_user: 'u-jen' } : r)), tour_offers: rows.tour_offers.map((r, i) => (i === 0 ? { ...r, owner_user: 'u-sam' } : r)) }
  const c = assembleWorkspace(toWorkspaceRows(ctx, withOwner)).clients[0]
  assert.equal(c.tour.shows.find(x => x.id === rows.shows[0].id)!.ownerId, 'u-jen')
  assert.equal(c.agentData.offers.find(x => x.id === rows.tour_offers[0].id)!.ownerId, 'u-sam')
  assert.equal(c.tour.shows.filter(x => x.ownerId).length, 1, 'only the one that has an owner')
  assert.equal(c.agentData.offers.filter(x => x.ownerId).length, 1)
  assert.equal(assembleWorkspace(toWorkspaceRows(ctx, rows)).clients[0].tour.shows.some(x => 'ownerId' in x && x.ownerId), false, 'none set, none read')
})

// ── an artist's own login never holds owners ──
check('what an artist login loads has no owners on any show or offer, and nothing else changes', () => {
  const data: AppData = { clients: [fullClient()] }
  const out = withoutOwners(data)
  assert.equal(out.clients[0].tour.shows[0].ownerId, undefined); assert.equal('ownerId' in out.clients[0].tour.shows[0], false)
  assert.equal(out.clients[0].agentData.offers[0].ownerId, undefined)
  assert.equal(out.clients[0].tour.shows[0].venue, data.clients[0].tour.shows[0].venue)
  assert.equal(data.clients[0].tour.shows[0].ownerId, 'u-jen', 'the original is not changed')
})

// ── what a form sends, and what a new show is given ──
check('a form that did not touch the owner sends nothing about it; one that did sends the person, or nobody', () => {
  assert.deepEqual(ownerPatch(null), {})
  assert.equal('ownerId' in ownerPatch(null), false)
  assert.deepEqual(ownerPatch('u-jen'), { ownerId: 'u-jen' })
  assert.equal('ownerId' in ownerPatch(''), true); assert.equal((ownerPatch('') as { ownerId?: string }).ownerId, undefined, 'nobody = clear it')
})
check('a show made from an offer is given the offer\'s owner unless we know they can no longer open the artist', () => {
  assert.deepEqual(ownerToCarry({ ownerId: 'u-jen' }, people, 'c1'), { ownerId: 'u-jen' })
  assert.deepEqual(ownerToCarry({ ownerId: 'u-jen' }, people, 'c2'), {}, 'Jen cannot open c2')
  assert.deepEqual(ownerToCarry({ ownerId: 'u-gone' }, people, 'c1'), {}, 'no longer on the team')
  assert.deepEqual(ownerToCarry({ ownerId: 'u-jen' }, [], 'c1'), { ownerId: 'u-jen' }, 'with no team loaded we cannot tell, so it is handed on')
  assert.deepEqual(ownerToCarry({}, people, 'c1'), {})
})

// ── saving owners: after the row, only what changed, undone when refused ──
async function savingOwners() {
  const loud = console.error; console.error = () => {}       // a refused save is logged; the log is expected here
  try { await savingOwnersInner() } finally { console.error = loud }
}
async function savingOwnersInner() {
  const calls: string[] = []; const told: string[] = []; const undone: string[] = []
  const restored: (string | undefined)[] = []
  const w = (id: string, ownerId: string | undefined, was?: string): OwnerWrite => ({ table: 'shows', id, ownerId, was, restore: o => { undone.push(id); restored.push(o) } })
  const deps = (refuse: string[] = []) => ({ write: async (t: string, id: string, o: string | null) => { calls.push(`${t}:${id}:${o}`); if (refuse.includes(id)) throw new Error('That person cannot open this artist, so they cannot be the owner') }, tell: (x: string) => told.push(x) })
  const reset = () => { calls.length = 0; told.length = 0; undone.length = 0; restored.length = 0 }

  await saveOwners(Promise.resolve(), [w('a', 'u-jen'), w('b', undefined)], deps())
  assert.deepEqual(calls, ['shows:a:u-jen', 'shows:b:null']); assert.deepEqual([told, undone], [[], []]); n++; console.log('  ok  owners are written one by one; "nobody" is written as null')
  reset()
  await saveOwners(Promise.reject(new Error('row failed')), [w('a', 'u-jen')], deps())
  assert.deepEqual([calls, told, undone], [[], [], []]); n++; console.log('  ok  if the row itself did not save, no owner is written (that failure is reported where the row is saved)')
  reset()
  await saveOwners(Promise.resolve(), [w('a', 'u-jen'), w('b', 'u-sam')], deps(['a']))
  assert.deepEqual(calls, ['shows:a:u-jen', 'shows:b:u-sam'], 'a refusal does not stop the next one')
  assert.deepEqual(undone, ['a']); assert.deepEqual(told, ['The owner was not saved. That person cannot open this artist, so they cannot be the owner.'])
  n++; console.log('  ok  a refused owner is put back on screen and the person is told why; the others still save')
  reset()
  const quiet = console.error; console.error = () => {}
  try {
    await saveOwners(Promise.resolve(), [w('a', 'u-jen')], { write: async () => { throw new Error('column "owner_user" does not exist') }, tell: x => told.push(x) })
  } finally { console.error = quiet }
  assert.deepEqual(told, ['The owner was not saved. Please try again.'], 'a technical error is not shown to the person'); assert.deepEqual(undone, ['a'])
  assert.equal(ownerRefusalText('weird'), 'The owner was not saved. Please try again.')
  n++; console.log('  ok  a technical failure says only "please try again", and still puts the old owner back')
  reset()
  await saveOwners(Promise.resolve(), [], deps()); assert.deepEqual(calls, []); n++; console.log('  ok  nothing to save, nothing attempted')

  // a refusal does not undo what is on screen when something newer has been picked since
  reset()
  await saveOwners(Promise.resolve(), [{ ...w('a', 'u-jen'), stillShown: () => false }], deps(['a']))
  assert.deepEqual(undone, [], 'a newer pick is left alone'); assert.equal(told.length, 1, 'but the person is still told')
  n++; console.log('  ok  a refusal never undoes a newer pick, but still says so')

  // writes for one item go one after another in the order they were made, even when the first is slow
  reset()
  let release!: () => void
  const slow = new Promise<void>(r => { release = r })
  const order: string[] = []
  const slowDeps = { write: async (_t: string, _id: string, o: string | null) => { if (o === 'first') await slow; order.push(String(o)) }, tell: () => {} }
  const p1 = saveOwners(Promise.resolve(), [w('x', 'first')], slowDeps)
  const p2 = saveOwners(Promise.resolve(), [w('x', 'second')], slowDeps)
  await new Promise(r => setTimeout(r, 5)); assert.deepEqual(order, [], 'the second waits for the first')
  release(); await Promise.all([p1, p2])
  assert.deepEqual(order, ['first', 'second']); n++; console.log('  ok  quick changes to one item are written in the order they were made')

  // two quick picks that BOTH fail must end on what is really saved, not on the previous pick (which never saved either)
  reset()
  const failing = { write: async () => { throw new Error('offline') }, tell: (x: string) => told.push(x) }
  await Promise.all([
    saveOwners(Promise.resolve(), [{ ...w('x', 'u-b', 'u-a'), stillShown: () => false }], failing),     // A -> B (by now the screen shows C)
    saveOwners(Promise.resolve(), [{ ...w('x', 'u-c', 'u-b'), stillShown: () => true }], failing),      // B -> C
  ])
  assert.deepEqual(restored, ['u-a'], 'back to what is saved (A), not to the previous pick (B)'); assert.equal(told.length, 2)
  reset()
  let calls2 = 0
  const failSecond = { write: async () => { if (++calls2 === 2) throw new Error('offline') }, tell: (x: string) => told.push(x) }
  await Promise.all([
    saveOwners(Promise.resolve(), [{ ...w('y', 'u-b', 'u-a'), stillShown: () => false }], failSecond),   // A -> B saves
    saveOwners(Promise.resolve(), [{ ...w('y', 'u-c', 'u-b'), stillShown: () => true }], failSecond),    // B -> C is refused
  ])
  assert.deepEqual(restored, ['u-b'], 'back to the last owner that really saved')
  n++; console.log('  ok  when quick picks fail, the screen goes back to the last owner that really saved')

  // a failure handler that itself fails must not stop the writes queued behind it
  reset()
  const order2: string[] = []
  const flaky = { write: async (_t: string, id: string, o: string | null) => { order2.push(`${id}:${o}`); if (o === 'bad') throw new Error('x') }, tell: () => { throw new Error('toast broke') } }
  await Promise.all([
    saveOwners(Promise.resolve(), [{ table: 'shows', id: 'z', ownerId: 'bad', was: undefined, restore: () => { throw new Error('restore broke') } }], flaky),
    saveOwners(Promise.resolve(), [{ table: 'shows', id: 'z', ownerId: 'next', was: undefined, restore: () => {} }], flaky),
  ])
  assert.deepEqual(order2, ['z:bad', 'z:next']); n++; console.log('  ok  a broken failure handler never stops the next write or escapes as an unhandled error')

  // writes keep the order they were PICKED in, even when the first one's row takes longer to save
  reset()
  let rowA!: () => void
  const slowRow = new Promise<void>(r => { rowA = r })
  const order3: string[] = []
  const plain = { write: async (_t: string, _id: string, o: string | null) => { order3.push(String(o)) }, tell: () => {} }
  const q1 = saveOwners(slowRow, [w('p', 'first')], plain)
  const q2 = saveOwners(Promise.resolve(), [w('p', 'second')], plain)
  await new Promise(r => setTimeout(r, 5)); assert.deepEqual(order3, [], 'the second does not jump ahead of the first')
  rowA(); await Promise.all([q1, q2]); assert.deepEqual(order3, ['first', 'second'])
  n++; console.log('  ok  owners are written in the order they were picked, whichever row finishes saving first')

  // an owner waits for its own row, and for nothing else
  reset()
  let rowDone!: () => void
  trackRow('shows', 'row-1', new Promise<void>(r => { rowDone = r }))
  const waited = saveOwners(rowSaved('shows', 'row-1'), [w('row-1', 'u-jen')], deps())
  await new Promise(r => setTimeout(r, 5)); assert.deepEqual(calls, [], 'not written while its row is still being saved')
  rowDone(); await waited; assert.deepEqual(calls, ['shows:row-1:u-jen'])
  assert.deepEqual(await rowSaved('shows', 'row-1').then(() => 'nothing to wait for'), 'nothing to wait for')
  n++; console.log('  ok  an owner is written after its own row is saved')
}

// ── Activity never shows the login id ──
const entry = (changes: Record<string, unknown>): ActivityEntry =>
  ({ id: 'e', created_at: '2026-11-10T10:00:00Z', client_id: 'c1', actor_id: 'u-sam', actor_label: 'Sam', section: 'tour', entity_type: 'show', entity_id: 's1', action: 'update', title: 'V · City', changes, count: 1, titles: [] }) as unknown as ActivityEntry
check('an owner change in Activity reads in words and never shows the login id', () => {
  const gave = describeEntry(entry({ owner_user: [null, 'aaaaaaaa-1111-2222-3333-444444444444'] })).details
  const changed = describeEntry(entry({ owner_user: ['aaaaaaaa-1111-2222-3333-444444444444', 'bbbbbbbb-1111-2222-3333-444444444444'] })).details
  const took = describeEntry(entry({ owner_user: ['aaaaaaaa-1111-2222-3333-444444444444', null] })).details
  assert.deepEqual(gave, ['gave it an owner']); assert.deepEqual(changed, ['changed the owner']); assert.deepEqual(took, ['took off the owner'])
  for (const d of [...gave, ...changed, ...took]) assert.equal(/[0-9a-f]{8}-/.test(d), false)
})

// ── in the app: giving, carrying and clearing an owner (the open artist's, and only theirs) ──
const artist = (id: string): Client => ({
  id, name: id, legal: { contracts: [] },
  tour: { shows: [], advances: [], travel: [], guestList: [], crew: [] }, finance: { budgets: [], invoices: [], expenses: [], settlements: [], crewRates: [], vendors: [] },
  songs: { albums: [] }, content: { posts: [] }, agentData: { offers: [] }, business: { banking: { deposits: [] } }, projects: [],
}) as unknown as Client
const st = () => useStore.getState()
const offersOf = (id: string) => st().data.clients.find(c => c.id === id)!.agentData.offers
const showsOf = (id: string) => st().data.clients.find(c => c.id === id)!.tour.shows

// The database, pretended: every request is recorded; rules (checked in order) may answer a request, slowly or not at all.
type Req = { method: string; url: string; body: string }
type Rule = (r: Req) => Response | undefined | Promise<Response | undefined>
const JSON_H = { 'content-type': 'application/json' }
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: JSON_H })
const refuseOwner: Rule = r => (r.method === 'PATCH' ? reply(400, { message: 'That person cannot open this artist, so they cannot be the owner', code: 'P0001' }) : undefined)
const changesNoRow: Rule = r => (r.method === 'PATCH' ? reply(200, []) : undefined)
const sawNotice: string[] = []
const sent: Req[] = []
let rules: Rule[] = []
const patches = (table?: string) => sent.filter(x => x.method === 'PATCH' && (!table || x.url.includes(`/rest/v1/${table}?`)))
const posts = (table: string) => sent.filter(x => x.method === 'POST' && x.url.includes(`/rest/v1/${table}`))

function pretendDatabase(): () => void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, realFetch = globalThis.fetch
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://database.test'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key'
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const target = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = init?.method ?? 'GET'
    const req: Req = { method, url: target, body: typeof init?.body === 'string' ? init.body : '' }
    sent.push(req)
    for (const rule of rules) { const r = await rule(req); if (r) return r }
    return method === 'PATCH' ? reply(200, [{ id: 'x' }]) : reply(method === 'POST' ? 201 : 200, [])
  }) as typeof fetch
  const put = (k: string, v: string | undefined) => { if (v === undefined) delete process.env[k]; else process.env[k] = v }   // (assigning undefined would store the text "undefined")
  return () => { globalThis.fetch = realFetch; put('NEXT_PUBLIC_SUPABASE_URL', url); put('NEXT_PUBLIC_SUPABASE_ANON_KEY', key) }
}
const fresh = () => { sent.length = 0; sawNotice.length = 0 }
const gate = () => { let open!: () => void; const wait = new Promise<void>(r => { open = r }); return { wait, open } }
const tick = (ms = 10) => new Promise(r => setTimeout(r, ms))

async function inTheApp() {
  const quiet = console.error; console.error = () => {}      // a refused save is logged; the log is expected here
  let restore: (() => void) | undefined
  const stop = onNotice((x: Notice) => sawNotice.push(x.text))
  try {
    // ── without a company open (nothing is saved to a database) ──
    useStore.setState({ data: { clients: [artist('c1'), artist('c2')] }, clientId: 'c1', workspaceId: null })
    st().addOffer({ venue: 'Fabric', city: 'London', country: 'UK', date: '2027-02-01', promoter: 'P', guarantee: 5000, ownerId: 'u-jen' })
    assert.equal(offersOf('c1')[0].ownerId, 'u-jen'); n++; console.log('  ok  a new offer can start with an owner')
    assert.equal(offersOf('c2').length, 0)

    // confirming the offer makes its show, which keeps the owner
    const offerId = offersOf('c1')[0].id
    st().updateOffer(offerId, { status: 'confirmed' })
    assert.equal(showsOf('c1').length, 1, 'confirming made a show')
    assert.equal(showsOf('c1')[0].ownerId, 'u-jen'); n++; console.log('  ok  the show made when an offer is confirmed keeps the offer\'s owner')

    // changing and clearing the owner on the offer; other edits leave it alone
    st().updateOffer(offerId, { notes: 'hello' })
    assert.equal(offersOf('c1')[0].ownerId, 'u-jen', 'an edit that does not mention the owner keeps it')
    st().updateOffer(offerId, { ownerId: 'u-sam' })
    assert.equal(offersOf('c1')[0].ownerId, 'u-sam')
    st().updateOffer(offerId, { ownerId: undefined })
    assert.equal(offersOf('c1')[0].ownerId, undefined); n++; console.log('  ok  an offer\'s owner can be changed or cleared, and other edits leave it alone')

    // ── with a company open: the owner is saved to the database, on its own ──
    await ownerSavesIdle()                                      // (the saves started above, which had no database, are over)
    restore = pretendDatabase()
    useStore.setState({ workspaceId: 'ws-test', clientId: 'c1', workspacePeople: people })
    const sId = showsOf('c1')[0].id
    const offId = offersOf('c1')[0].id
    const before = showsOf('c1')[0].ownerId                     // the show started with its offer's owner
    assert.equal(before, 'u-jen')

    // refused: it shows at once, then is put back to what it was, and the person is told in plain words
    fresh(); rules = [refuseOwner]
    st().setShowOwner(sId, 'u-sam')
    assert.equal(showsOf('c1')[0].ownerId, 'u-sam', 'it shows at once')
    await ownerSavesIdle()
    assert.equal(showsOf('c1')[0].ownerId, before, 'the refused change is put back to what it was')
    assert.deepEqual(sawNotice, ['The owner was not saved. That person cannot open this artist, so they cannot be the owner.'])
    assert.equal(patches().length, 1); assert.match(patches()[0].url, /\/rest\/v1\/shows\?id=eq\./); assert.equal(patches()[0].body, '{"owner_user":"u-sam"}', 'only the owner column is written')
    assert.match(patches()[0].url, /select=id/, 'asks for the row back, so a write that changed nothing can be seen')

    // choosing the owner it already has writes nothing at all
    fresh(); rules = []
    st().setShowOwner(sId, before!); await ownerSavesIdle()
    assert.equal(sent.length, 0); assert.equal(sawNotice.length, 0)

    // accepted: it stays
    st().setShowOwner(sId, 'u-eli'); await ownerSavesIdle()
    assert.equal(showsOf('c1')[0].ownerId, 'u-eli'); assert.equal(sawNotice.length, 0); assert.equal(patches().length, 1); assert.equal(patches()[0].body, '{"owner_user":"u-eli"}')
    n++; console.log('  ok  with the database pretended: the owner is saved on its own (one column), only when changed, and a refusal puts the old owner back and says why')

    // a write that changed no row (the row is not there, or no longer allowed) is a failure, not a quiet success
    fresh(); rules = [changesNoRow]
    st().setShowOwner(sId, 'u-sam'); await ownerSavesIdle()
    assert.equal(showsOf('c1')[0].ownerId, 'u-eli', 'put back'); assert.deepEqual(sawNotice, ['The owner was not saved. Please try again.'])
    n++; console.log('  ok  an owner write that changed no row is treated as not saved')

    // an offer: saving other fields writes the row WITHOUT the owner, and no owner write at all when the owner did not change
    fresh(); rules = []
    st().updateOffer(offId, { notes: 'x', ownerId: undefined }); await ownerSavesIdle()
    assert.ok(posts('tour_offers').length >= 1, 'the offer row was saved'); assert.ok(posts('tour_offers').every(x => !x.body.includes('owner_user')), 'the row save never carries the owner')
    assert.equal(patches().length, 0, 'an unchanged owner is not written')

    // a changed offer owner is written on its own, after the row; refused, it is put back
    fresh(); rules = [refuseOwner]
    st().updateOffer(offId, { ownerId: 'u-jen' }); await ownerSavesIdle()
    assert.equal(offersOf('c1')[0].ownerId, undefined, 'a refused offer owner is put back')
    assert.ok(sawNotice.some(t => t.startsWith('The owner was not saved')))
    const order = sent.map(x => x.method)
    assert.ok(order.indexOf('POST') >= 0 && order.indexOf('PATCH') > order.indexOf('POST'), 'the owner is written after the row')
    fresh(); rules = []
    st().updateOffer(offId, { ownerId: 'u-sam' }); await ownerSavesIdle()
    assert.equal(offersOf('c1')[0].ownerId, 'u-sam'); assert.equal(patches().length, 1); assert.equal(patches()[0].body, '{"owner_user":"u-sam"}'); assert.equal(sawNotice.length, 0)
    n++; console.log('  ok  an offer\'s owner is written after its row, only when changed; refused, it is put back')

    // an owner who lost access is NOT erased by an unrelated edit (the form sends nothing about the owner when it was not touched)
    useStore.setState({ data: { clients: st().data.clients.map(c => (c.id !== 'c1' ? c : { ...c, agentData: { ...c.agentData, offers: c.agentData.offers.map(o => (o.id === offId ? { ...o, ownerId: 'u-gone' } : o)) } })) } })
    fresh()
    st().updateOffer(offId, { notes: 'a typo fix', ...ownerPatch(null) }); await ownerSavesIdle()
    assert.equal(patches().length, 0, 'no owner write'); assert.equal(offersOf('c1')[0].ownerId, 'u-gone', 'still on file, reads as nobody on screen')
    st().updateOffer(offId, { ...ownerPatch('') }); await ownerSavesIdle()
    assert.equal(patches().length, 1, 'choosing "Nobody yet" on purpose does clear it'); assert.equal(patches()[0].body, '{"owner_user":null}')
    n++; console.log('  ok  editing an offer whose owner lost access does not erase them; choosing nobody on purpose does')

    // quick changes: written in order, and a refused earlier pick never undoes a later one
    fresh()
    const first = gate(); let seen = 0
    rules = [async r => { if (r.method !== 'PATCH') return undefined; seen++; if (seen === 1) { await first.wait; return reply(400, { message: 'That person cannot open this artist, so they cannot be the owner' }) } return undefined }]
    st().setShowOwner(sId, 'u-sam'); st().setShowOwner(sId, 'u-jen')
    await tick(); assert.equal(patches('shows').length, 1, 'the second waits for the first')
    first.open(); await ownerSavesIdle()
    assert.deepEqual(patches('shows').map(x => x.body), ['{"owner_user":"u-sam"}', '{"owner_user":"u-jen"}'], 'written in the order they were picked')
    assert.equal(showsOf('c1')[0].ownerId, 'u-jen', 'the later pick stays on screen')
    assert.equal(sawNotice.length, 1, 'the refusal is still reported')
    n++; console.log('  ok  two quick picks are written in order, and the refusal of the first does not undo the second')

    // two quick picks, both refused: the screen ends on the owner that is really saved
    fresh(); rules = [refuseOwner]
    const savedOwner = showsOf('c1')[0].ownerId
    st().setShowOwner(sId, 'u-sam'); st().setShowOwner(sId, 'u-eli'); await ownerSavesIdle()
    assert.equal(showsOf('c1')[0].ownerId, savedOwner, 'back to what is saved, not to the middle pick'); assert.equal(sawNotice.length, 2)
    n++; console.log('  ok  two refused picks in a row end on the owner that is really saved')

    // an offer whose owner can no longer open the artist: its show is made with no owner (nothing is handed on that the database would refuse)
    fresh(); rules = []
    st().addOffer({ venue: 'Gone', city: 'Lyon', country: 'FR', date: '2027-07-01', promoter: 'P', guarantee: 1800, ownerId: 'u-gone' }); await ownerSavesIdle()
    const goneId = offersOf('c1').find(o => o.venue === 'Gone')!.id
    fresh()
    st().updateOffer(goneId, { status: 'confirmed' }); await ownerSavesIdle()
    assert.equal(showsOf('c1').find(x => x.venue === 'Gone')!.ownerId, undefined, 'the new show has no owner'); assert.equal(patches('shows').length, 0, 'and none is written for it')
    n++; console.log('  ok  confirming an offer whose owner lost access makes a show with no owner')

    // confirming an offer with an owner: the show's owner is written only after the show itself is saved, even if you pick again at once
    fresh(); rules = []
    st().addOffer({ venue: 'Rex', city: 'Paris', country: 'FR', date: '2027-03-01', promoter: 'P', guarantee: 4000, ownerId: 'u-sam' }); await ownerSavesIdle()
    const rexId = offersOf('c1').find(o => o.venue === 'Rex')!.id
    fresh()
    const showRow = gate()
    rules = [async r => { if (r.method === 'POST' && /\/rest\/v1\/shows(\?|$)/.test(r.url)) await showRow.wait; return undefined }]
    st().updateOffer(rexId, { status: 'confirmed' })
    const rexShow = showsOf('c1').find(x => x.venue === 'Rex')!
    assert.equal(rexShow.ownerId, 'u-sam', 'the show starts with the offer\'s owner')
    st().setShowOwner(rexShow.id, 'u-eli')                         // picked a moment later, while the show is still being saved
    await tick(); assert.equal(patches().length, 0, 'nothing is written while the show row is still being saved')
    showRow.open(); await ownerSavesIdle()
    const methods = sent.map(x => `${x.method}${x.url.includes('/shows') ? ':shows' : ''}`)
    assert.ok(methods.indexOf('POST:shows') >= 0 && methods.indexOf('PATCH:shows') > methods.indexOf('POST:shows'), 'the owner is written after the show')
    assert.deepEqual(patches('shows').map(x => x.body), ['{"owner_user":"u-sam"}', '{"owner_user":"u-eli"}'])
    assert.equal(showsOf('c1').find(x => x.venue === 'Rex')!.ownerId, 'u-eli'); assert.deepEqual(sawNotice.filter(t => t.startsWith('The owner')), [], 'nothing refused (the "confirmed" message is not one)')
    n++; console.log('  ok  a show made by a confirm gets its owner only after it is saved, in order, even when you pick again at once')

    // the owner does not wait for (or depend on) the budget: someone who cannot save budgets can still give an offer an owner
    fresh()
    rules = [r => (r.method === 'POST' && r.url.includes('/rest/v1/budgets') ? reply(403, { message: 'new row violates row-level security policy for table "budgets"', code: '42501' }) : undefined)]
    st().addOffer({ venue: 'Sound', city: 'Rome', country: 'IT', date: '2027-04-01', promoter: 'P', guarantee: 3000, ownerId: 'u-jen' }); await ownerSavesIdle()
    const soundId = offersOf('c1').find(o => o.venue === 'Sound')!.id
    assert.equal(patches('tour_offers').length, 1, 'the owner was still written'); assert.equal(offersOf('c1').find(o => o.id === soundId)!.ownerId, 'u-jen'); assert.equal(sawNotice.length, 0)
    n++; console.log('  ok  a failed budget save does not stop the offer\'s owner being saved')

    // confirming an offer AND changing its owner at once: the owners are saved even though the budget lock cannot be (no Finance access)
    fresh(); rules = []
    st().addOffer({ venue: 'Lux', city: 'Oslo', country: 'NO', date: '2027-06-01', promoter: 'P', guarantee: 2500 }); await ownerSavesIdle()
    const luxId = offersOf('c1').find(o => o.venue === 'Lux')!.id
    fresh()
    rules = [r => (r.method === 'POST' && r.url.includes('/rest/v1/budgets') ? reply(403, { message: 'new row violates row-level security policy for table "budgets"', code: '42501' }) : undefined)]
    st().updateOffer(luxId, { status: 'confirmed', ownerId: 'u-jen' }); await ownerSavesIdle()
    assert.equal(patches('tour_offers').length, 1, 'the offer\'s owner was written'); assert.equal(patches('shows').length, 1, 'and so was the new show\'s')
    assert.deepEqual(sawNotice.filter(t => t.startsWith('The owner')), [])
    assert.equal(offersOf('c1').find(o => o.id === luxId)!.ownerId, 'u-jen'); assert.equal(showsOf('c1').find(x => x.venue === 'Lux')!.ownerId, 'u-jen')
    n++; console.log('  ok  confirming an offer with a new owner saves both owners even when the budget lock cannot be saved')

    // an artist login never holds owners, even after a reload of one artist
    fresh(); rules = []
    const ctx = { anchor: '2026-11-10', clientId: 'zz-demo', ownerUserId: 'f7303cf1-f728-46a2-a861-dc7787c00d9c' }
    const demo = buildDemoRows(ctx)
    const served = toWorkspaceRows(ctx, { ...demo, shows: demo.shows.map((r, i) => (i === 0 ? { ...r, owner_user: 'u-jen' } : r)) })
    const tableOf = (u: string) => /\/rest\/v1\/([a-z_]+)/.exec(u)?.[1] ?? ''
    const byTable: Record<string, unknown[]> = { clients: served.clientRows, shows: (served.shows.data ?? []) as unknown[] }
    rules = [r => (r.method === 'GET' && byTable[tableOf(r.url)] ? reply(200, byTable[tableOf(r.url)]) : undefined)]
    useStore.setState({ data: { clients: [artist('zz-demo')] }, clientId: 'zz-demo', workspaceId: 'ws-test', role: 'manager' })
    assert.equal(await st().reloadClient('zz-demo'), true)
    assert.ok(showsOf('zz-demo').some(x => x.ownerId === 'u-jen'), 'a manager gets the owner')
    useStore.setState({ data: { clients: [artist('zz-demo')] }, role: 'artist', authClientId: 'zz-demo' })
    assert.equal(await st().reloadClient('zz-demo'), true)
    assert.ok(showsOf('zz-demo').length > 0 && showsOf('zz-demo').every(x => x.ownerId === undefined), 'an artist login gets none')
    n++; console.log('  ok  reloading one artist gives a manager the owners and an artist login none')
    useStore.setState({ role: 'manager', authClientId: null })

    // the same rule when everything first loads
    const loaded = (role: 'manager' | 'artist') => loadCompany({ memberId: 'm1', workspaceId: 'ws-test', role, personId: null, clientId: role === 'artist' ? 'zz-demo' : null })
    const asManager = await loaded('manager'); const asArtist = await loaded('artist')
    assert.ok(asManager.data.clients[0].tour.shows.some(x => x.ownerId === 'u-jen'), 'a manager loads the owners')
    assert.ok(asArtist.data.clients[0].tour.shows.length > 0 && asArtist.data.clients[0].tour.shows.every(x => x.ownerId === undefined), 'an artist login loads none')
    n++; console.log('  ok  first load gives a manager the owners and an artist login none')

    // a show: give, change, clear; only the open artist's show
    restore(); restore = undefined
    useStore.setState({ data: { clients: [artist('c1'), artist('c2')] }, clientId: 'c1', workspaceId: null, workspacePeople: [] })
    st().addOffer({ venue: 'V', city: 'C', country: 'X', date: '2027-05-01', promoter: 'P', guarantee: 1000 })
    const oid = offersOf('c1')[0].id
    st().updateOffer(oid, { status: 'confirmed' })
    const showId = showsOf('c1')[0].id
    st().setShowOwner(showId, 'u-sam')
    assert.equal(showsOf('c1')[0].ownerId, 'u-sam')
    st().setShowOwner(showId, null)
    assert.equal(showsOf('c1')[0].ownerId, undefined)
    st().setShowOwner(showId, 'u-eli')
    st().updateShowStatus(showId, 'hold')
    assert.equal(showsOf('c1')[0].ownerId, 'u-eli', 'changing the status keeps the owner')
    useStore.setState({ clientId: 'c2' })
    st().setShowOwner(showId, 'u-jen')
    assert.equal(showsOf('c1')[0].ownerId, 'u-eli', 'another artist\'s open page cannot change this show')
    n++; console.log('  ok  a show\'s owner can be given, changed and cleared; only on the open artist')
  } finally { stop(); restore?.(); console.error = quiet }
}

savingOwners().then(inTheApp).then(() => { console.log(`item-owner: ${n} checks passed`) }, e => { console.error(e); process.exit(1) })
