// Checks the release rollout: post titles name the real weekday, and moving the release date rebuilds only the posts nobody has touched.
// Run with:  npx tsx scripts/check-rollout.ts
import assert from 'node:assert/strict'
import { useStore } from '../src/lib/store'
import { noteAuthorName, releaseDayWords, rolloutPosts, ROLLOUT_TEMPLATE } from '../src/lib/utils'
import type { Client, Post } from '../src/types'

// The store pings Google Calendar after a post changes; there is no network (or server) here.
globalThis.fetch = (async () => new Response('{}')) as typeof fetch
console.error = () => {}   // the store also tries the database after an edit (no database here); that failure is expected and caught

// ── titles say the right day, whatever weekday the release falls on ──
assert.deepEqual(releaseDayWords('2026-11-06'), { weekday: 'Friday', full: 'Friday, Nov 6' })
assert.deepEqual(releaseDayWords('2026-11-11'), { weekday: 'Wednesday', full: 'Wednesday, Nov 11' })
const fri = rolloutPosts('EP', '2026-11-06')
const wed = rolloutPosts('EP', '2026-11-11')
assert.equal(fri.length, ROLLOUT_TEMPLATE.length)
const titleAt = (posts: ReturnType<typeof rolloutPosts>, date: string, startsWith: string) => posts.find(p => p.date === date && p.title.startsWith(startsWith))?.title
assert.equal(titleAt(fri, '2026-10-21', 'Pre-save'), 'Pre-save "EP" — out Friday, Nov 6', 'the pre-save post, 16 days ahead, names the date')
assert.equal(titleAt(fri, '2026-11-02', '"EP" is out'), '"EP" is out Friday')
assert.equal(titleAt(wed, '2026-10-26', 'Pre-save'), 'Pre-save "EP" — out Wednesday, Nov 11')
assert.equal(titleAt(wed, '2026-11-07', '"EP" is out'), '"EP" is out Wednesday', 'no more "out this Friday" on a Wednesday release')
assert.equal(wed.some(p => p.title.includes('Friday')), false)
assert.deepEqual(fri.map(p => p.date).slice(0, 3), ['2026-10-21', '2026-10-23', '2026-10-30'], 'dates count back from the release day')
assert.equal(fri.filter(p => p.date === '2026-11-06').length, 3, 'three posts on release day')

// ── who an audio note is from: the signed-in person's own name, else their role ──
assert.equal(noteAuthorName('Dana Wells', 'manager'), 'Dana Wells')
assert.equal(noteAuthorName('  Sam  ', 'team'), 'Sam', 'surrounding spaces are dropped')
assert.equal(noteAuthorName(undefined, 'manager'), 'Manager', 'no name known: the role word')
assert.equal(noteAuthorName('', 'team'), 'Team')
assert.equal(noteAuthorName('Someone', 'agent'), 'Agent', '"Someone" is the people list\'s stand-in for no name, not a name')
assert.equal(noteAuthorName('sam@example.com', 'lawyer'), 'Lawyer', 'a login with no name shows its email in the people list: that is not a name to sign with')
assert.equal(noteAuthorName('Sam O\'Neil', 'lawyer'), 'Sam O\'Neil')

// ── moving the release date: edited posts survive, untouched ones move ──
const artist = (): Client => ({
  id: 'c1', name: 'Alpha',
  songs: { albums: [{ id: 'a1', title: 'EP', tracks: [] }, { id: 'a2', title: 'Other', tracks: [] }] },
  content: { posts: [{ id: 'manual', date: '2026-10-30', title: 'Hand-made post', time: '10:00am', type: 'post' } as Post] },
  tour: { shows: [], advances: [], travel: [], guestList: [] }, finance: { budgets: [], invoices: [], expenses: [], settlements: [] },
  agentData: { offers: [] }, business: { banking: { deposits: [] } }, legal: { contracts: [] }, projects: [],
}) as unknown as Client
useStore.setState({ data: { clients: [artist()] }, clientId: 'c1', workspaceId: null })
const posts = (): Post[] => useStore.getState().data.clients[0].content.posts
const st = () => useStore.getState()

st().scheduleRelease('a1', '2026-11-06')
assert.equal(posts().filter(p => p.releaseId === 'a1').length, ROLLOUT_TEMPLATE.length)
assert.equal(posts().filter(p => p.releaseId === 'a1').every(p => p.auto), true, 'rollout posts start out automatic')
assert.equal(posts().some(p => p.id === 'manual'), true, 'a hand-made post is never touched')

// saving a rollout post without changing anything leaves it automatic: it keeps moving with the release
const untouched = posts().find(p => p.releaseId === 'a1' && p.title.startsWith('Gearing up'))!
st().updatePost(untouched.id, { date: untouched.date, title: untouched.title, time: untouched.time, type: untouched.type })
assert.equal(posts().find(p => p.id === untouched.id)!.auto, true, 'a Save with nothing changed does not pin the post')
st().updatePost(untouched.id, { date: untouched.date, title: untouched.title, time: '3:00pm', type: untouched.type })
assert.equal(posts().find(p => p.id === untouched.id)!.auto, false, 'changing only the time does pin it')
for (const [field, patch] of [['date', { date: '2026-11-03' }], ['title', { title: 'New title' }], ['type', { type: 'tiktok' }]] as const) {
  st().scheduleRelease('a1', '2026-11-06')                                // a fresh rollout each time
  const fresh = posts().find(p => p.releaseId === 'a1' && p.auto && p.title.startsWith('Gearing up'))!   // (an automatic one: pinned posts from earlier rounds are still in the list)
  const same = { date: fresh.date, title: fresh.title, time: fresh.time, type: fresh.type }
  st().updatePost(fresh.id, { ...same, ...patch })
  assert.equal(posts().find(p => p.id === fresh.id)!.auto, false, `changing only the ${field} pins the post`)
}
st().scheduleRelease('a1', '2026-11-06')                                  // put the rollout back so the rest of the check starts from a known state
assert.equal(posts().filter(p => p.releaseId === 'a1' && p.auto).length, ROLLOUT_TEMPLATE.length)
for (const p of posts().filter(p => p.releaseId === 'a1' && !p.auto)) st().deletePost(p.id)

// someone edits the "one week until" post: new words, new day
const edited = posts().find(p => p.releaseId === 'a1' && p.title.startsWith('One week until'))!
st().updatePost(edited.id, { date: '2026-11-01', title: 'Our own caption', time: '2:00pm', type: 'reel' })
const after = posts().find(p => p.id === edited.id)!
assert.deepEqual([after.title, after.date, after.auto], ['Our own caption', '2026-11-01', false], 'an edited post is no longer automatic')
assert.equal(after.releaseId, 'a1', 'but it is still linked to its release')

st().scheduleRelease('a1', '2026-11-20')                         // the release moves two weeks
const kept = posts().find(p => p.id === edited.id)
assert.deepEqual([kept?.title, kept?.date], ['Our own caption', '2026-11-01'], 'the edited post is exactly as the person left it')
const rollout = posts().filter(p => p.releaseId === 'a1' && p.auto)
assert.equal(rollout.length, ROLLOUT_TEMPLATE.length, 'every untouched step was rebuilt for the new date')
assert.equal(rollout.some(p => p.id === edited.id), false)
assert.equal(rollout.find(p => p.title.startsWith('Pre-save'))?.date, '2026-11-04', 'the pre-save post moved with the release')
assert.equal(rollout.find(p => p.title.startsWith('Pre-save'))?.title, 'Pre-save "EP" — out Friday, Nov 20')
assert.equal(posts().length, 1 + 1 + ROLLOUT_TEMPLATE.length, 'one hand-made post, one edited, and a fresh rollout: nothing lost, nothing doubled')
assert.equal(posts().some(p => p.id === 'manual'), true)

// another release's rollout is left alone
st().scheduleRelease('a2', '2027-01-15')
const a2Before = posts().filter(p => p.releaseId === 'a2').map(p => p.id).sort()
st().scheduleRelease('a1', '2026-12-04')
assert.deepEqual(posts().filter(p => p.releaseId === 'a2').map(p => p.id).sort(), a2Before, 'moving one release never rebuilds another one\'s posts')
assert.equal(st().data.clients[0].songs.albums.find(a => a.id === 'a1')?.releaseDate, '2026-12-04')

console.log('rollout checks passed')
