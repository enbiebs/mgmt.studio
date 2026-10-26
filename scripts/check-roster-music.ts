// Checks the "All artists" Music page: which releases are listed and when they come out, the checklist progress and next step, who sees them, the filters and the numbers on top.
// Run with:  npx tsx scripts/check-roster-music.ts
import assert from 'node:assert/strict'
import { buildRosterMusic, defaultMusicFilter, filterReleases, musicAccessFor, musicCapabilities, musicStats, type MusicAccess, type RosterMusicInput } from '../src/lib/roster-music'
import { defaultChecklist } from '../src/lib/utils'
import { unfinishedSongs } from '../src/lib/roster-summary'
import type { Album, ChecklistItem, Client, MainSection, Track, UserRole } from '../src/types'

const TODAY = '2026-10-21'
const FULL: MusicAccess = { open: true, full: true }
const SHARED: MusicAccess = { open: true, full: false }   // sent single releases
const NONE: MusicAccess = { open: false, full: false }

const track = (id: string, stage: Track['stage']): Track => ({ id, num: 1, title: id, stage, version: 1, touched: 'now' })
const album = (o: Partial<Album> & { id: string }): Album => ({ title: `Album ${o.id}`, tracks: [], ...o })
const artist = (id: string, name: string, albums: Album[], isDemo?: boolean): Client => ({ id, name, color: `#${id}`, isDemo, songs: { albums } }) as unknown as Client
const input = (client: Client, access: MusicAccess = FULL): RosterMusicInput => ({ client, access })
const ids = (rows: { albumId: string }[]) => rows.map(r => r.albumId)
const STEPS = defaultChecklist().length
const ticked = (n: number): ChecklistItem[] => defaultChecklist().map((s, i) => ({ ...s, done: i < n }))

// ── every release, when it comes out, how far along it is ──
const alpha = artist('a', 'Alpha', [
  album({ id: 'far', title: 'Later', releaseDate: '2027-02-01', tracks: [track('t1', 'done')] }),
  album({ id: 'soon', title: 'Night Shift EP', type: 'ep', releaseDate: '2026-11-14', tracks: [track('t2', 'mix'), track('t3', 'done'), track('t4', 'track')], checklist: ticked(5) }),
  album({ id: 'today', title: 'Today', releaseDate: TODAY, tracks: [track('t5', 'done')] }),
  album({ id: 'old', title: 'Old', releaseDate: '2026-01-01', tracks: [track('t6', 'done'), track('t7', 'mix')] }),
  album({ id: 'nodate', title: '', tracks: [track('t8', 'master')] }),
  album({ id: 'nodate2', title: 'Also undated' }),
])
const rows = buildRosterMusic([input(alpha)], TODAY)
const row = (id: string) => rows.find(r => r.albumId === id)!
assert.deepEqual(rows.map(r => [r.albumId, r.when]), [
  ['today', 'ahead'], ['soon', 'ahead'], ['far', 'ahead'], ['nodate2', 'undated'], ['nodate', 'undated'], ['old', 'out'],
], 'coming up soonest first (releasing today is still ahead), then no date, then what is out')
assert.deepEqual([row('soon').days, row('today').days, row('old').days, row('nodate').days], [24, 0, -293, null])
assert.deepEqual([row('soon').title, row('nodate').title, row('soon').type, row('far').type], ['Night Shift EP', 'Untitled', 'ep', 'album'], 'no title: Untitled; no type: album')
assert.deepEqual([row('soon').songsDone, row('soon').songsTotal, row('nodate2').songsTotal], [1, 3, 0])
assert.deepEqual([row('soon').clientName, row('soon').clientColor, row('soon').date], ['Alpha', '#a', '2026-11-14'])
assert.equal('date' in row('nodate'), false)

// ── the release checklist: the saved one, or the full default list when nobody has ticked anything ──
assert.deepEqual([row('soon').stepsDone, row('soon').stepsTotal], [5, STEPS])
assert.deepEqual([row('far').stepsDone, row('far').stepsTotal], [0, STEPS], 'never ticked: the whole default list, all undone')
assert.equal(row('far').nextStep, defaultChecklist()[0].label, 'the first step')
assert.equal(row('soon').nextStep, defaultChecklist()[5].label, 'the first step not done yet')
const allDone = buildRosterMusic([input(artist('d', 'Done', [album({ id: 'dd', releaseDate: '2026-12-01', checklist: ticked(STEPS) })]))], TODAY)[0]
assert.deepEqual([allDone.stepsDone, allDone.nextStep], [STEPS, null], 'everything ticked: no next step')
assert.equal(row('old').nextStep, null, 'a release that is out has no next step')
assert.equal(row('nodate').nextStep, defaultChecklist()[0].label, 'an undated release still has one')
// a saved checklist that skips a middle step names the first one that is still open, in list order
const gap = ticked(STEPS); gap[2] = { ...gap[2], done: false }
assert.equal(buildRosterMusic([input(artist('g', 'Gap', [album({ id: 'gg', releaseDate: '2026-12-01', checklist: gap })]))], TODAY)[0].nextStep, defaultChecklist()[2].label)

// ── ties: the same day goes by artist name, then release title ──
const tie = buildRosterMusic([
  input(artist('b', 'Beta', [album({ id: 'b1', title: 'Abe', releaseDate: '2027-03-01' })])),
  input(artist('a', 'Alpha', [album({ id: 'a1', title: 'Zed', releaseDate: '2027-03-01' }), album({ id: 'a2', title: 'Mid', releaseDate: '2027-03-01' })])),
], TODAY)
assert.deepEqual(ids(tie), ['a2', 'a1', 'b1'], 'artist name before release title')
// what is out: the most recent first, across artists
const outs = buildRosterMusic([
  input(artist('a', 'Alpha', [album({ id: 'o1', releaseDate: '2026-01-01' }), album({ id: 'o3', releaseDate: '2026-09-01' })])),
  input(artist('b', 'Beta', [album({ id: 'o2', releaseDate: '2026-05-01' })])),
], TODAY)
assert.deepEqual(ids(outs), ['o3', 'o2', 'o1'])

// ── who is listed: only artists whose Music page the person may open ──
const beta = artist('b', 'Beta', [album({ id: 'b-rel', releaseDate: '2027-01-01', tracks: [track('x', 'mix')] })])
const gamma = artist('g', 'Gamma', [album({ id: 'g-rel', releaseDate: '2027-01-01' })])
assert.deepEqual(ids(buildRosterMusic([input(beta), input(gamma, NONE)], TODAY)), ['b-rel'], 'no Music page, no releases')
assert.deepEqual(buildRosterMusic([], TODAY), [])
assert.deepEqual(buildRosterMusic([input(artist('e', 'Empty', []))], TODAY), [], 'an artist with no releases')
// an artist with no albums is given a placeholder album named after them: not a release
const placeholder = artist('p', 'Placeholder', [album({ id: 'alb-default', title: 'Placeholder' })])
assert.deepEqual(buildRosterMusic([input(placeholder)], TODAY), [])
assert.equal(musicStats(buildRosterMusic([input(placeholder)], TODAY)).undated, 0, 'and it never asks for a release date')
assert.deepEqual(ids(buildRosterMusic([input(artist('p', 'Placeholder', [album({ id: 'alb-default', title: 'Real', tracks: [track('x', 'mix')] })]))], TODAY)), ['alb-default'], 'unless it has songs: then it is real')
assert.deepEqual(ids(buildRosterMusic([input(artist('p', 'Placeholder', [album({ id: 'alb-default' }), album({ id: 'other' })]))], TODAY)), ['other'], 'a real release beside it still shows')
assert.deepEqual(buildRosterMusic([input({ id: 'x', name: 'X', color: '#x' } as unknown as Client)], TODAY), [], 'an artist with no music data at all')
const mixedAccess = buildRosterMusic([input(alpha, FULL), input(beta, SHARED)], TODAY)
assert.deepEqual(mixedAccess.filter(r => r.clientId === 'b').map(r => r.full), [false])
assert.equal(mixedAccess.filter(r => r.clientId === 'a').every(r => r.full), true)

// ── the access rule, from the real flags ──
const grants = (map: Record<string, MainSection[]>, shareOnly: Record<string, MainSection[]> = {}) => ({
  has: (s: MainSection, id: string) => (map[id] ?? []).includes(s) || (shareOnly[id] ?? []).includes(s),
  shareOnly: (s: MainSection, id: string) => (shareOnly[id] ?? []).includes(s),
})
const acc = (g: ReturnType<typeof grants>, role: UserRole = 'manager') => musicAccessFor(g.has, g.shareOnly, 'x', role)
assert.deepEqual(acc(grants({ x: ['songs'] })), { open: true, full: true })
assert.deepEqual(acc(grants({}, { x: ['songs'] })), { open: true, full: false }, 'one release sent to them')
assert.deepEqual(acc(grants({ x: ['finance', 'legal'] })), { open: false, full: false }, 'no Music at all')
assert.deepEqual(acc(grants({ y: ['songs'] })), { open: false, full: false }, 'another artist')
assert.deepEqual(acc(grants({ x: ['songs'] }), 'artist'), { open: false, full: false }, "an artist's own login gets the simplified portal, not this page")
assert.deepEqual(acc(grants({ x: ['songs'] }), 'team'), { open: true, full: true })

// ── filters ──
const f = (o: { filter: 'ahead' | 'undated' | 'out' | 'all'; clientId?: string }) => ids(filterReleases(rows, o))
assert.deepEqual(f({ filter: 'ahead' }), ['today', 'soon', 'far'])
assert.deepEqual(f({ filter: 'undated' }), ['nodate2', 'nodate'])
assert.deepEqual(f({ filter: 'out' }), ['old'])
assert.deepEqual(f({ filter: 'all' }), ids(rows))
assert.deepEqual(f({ filter: 'all', clientId: 'nobody' }), [])
const two = buildRosterMusic([input(alpha), input(beta)], TODAY)
assert.deepEqual(ids(filterReleases(two, { filter: 'all', clientId: 'b' })), ['b-rel'], 'one artist')
assert.equal(filterReleases(two, { filter: 'all' }).length, 7)
assert.equal(defaultMusicFilter(rows), 'ahead')
assert.equal(defaultMusicFilter(outs), 'all', 'nothing coming up: show everything')
assert.equal(defaultMusicFilter([]), 'all')
assert.equal(defaultMusicFilter(rows.filter(r => r.when === 'undated')), 'all', 'only undated: nothing coming up')

// ── the numbers on top: only whole-Music artists, never a practice artist ──
assert.deepEqual(musicStats(rows), { ahead: 3, soon: 2, unfinished: 4, undated: 2 }, 'songs not finished: 2 on Night Shift EP, 1 on the old release, 1 on the undated one')
assert.equal(musicStats(rows).unfinished, unfinishedSongs(alpha.songs.albums), 'the same figure the artist Overview shows')
assert.deepEqual(musicStats(mixedAccess), musicStats(rows), 'only the fully open artist is counted')
assert.deepEqual(musicStats(buildRosterMusic([input(alpha, SHARED)], TODAY)), { ahead: 0, soon: 0, unfinished: 0, undated: 0 }, 'a few shared releases say nothing about the whole catalogue')
// "soon" is exactly 30 days: day 30 is in, day 31 is out
const edge = buildRosterMusic([input(artist('e', 'Edge', [album({ id: 'e30', releaseDate: '2026-11-20' }), album({ id: 'e31', releaseDate: '2026-11-21' })]))], TODAY)
assert.deepEqual([musicStats(edge).ahead, musicStats(edge).soon], [2, 1])
const demoArtist = artist('p', 'Practice', [album({ id: 'd1', releaseDate: '2026-11-01', tracks: [track('z', 'mix')] }), album({ id: 'd2' })], true)
const withDemo = buildRosterMusic([input(alpha), input(demoArtist)], TODAY)
assert.equal(withDemo.find(r => r.albumId === 'd1')!.demo, true, 'a practice artist is listed, marked')
assert.equal(withDemo.length, rows.length + 2)
assert.deepEqual(musicStats(withDemo), musicStats(rows), 'but the numbers are the same with or without it')
assert.deepEqual(musicStats([]), { ahead: 0, soon: 0, unfinished: 0, undated: 0 })

// ── what the page offers this person ──
assert.deepEqual(musicCapabilities([FULL, NONE]), { list: true, counts: true })
assert.deepEqual(musicCapabilities([SHARED, NONE]), { list: true, counts: false }, 'only shared releases: a list, no numbers')
assert.deepEqual(musicCapabilities([NONE]), { list: false, counts: false })
assert.deepEqual(musicCapabilities([]), { list: false, counts: false })

console.log('roster-music checks passed')
