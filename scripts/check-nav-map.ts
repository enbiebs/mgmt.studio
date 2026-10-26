// Checks how the artist switcher keeps you on the same page when you move between "All artists" and one artist (and between artists).
// Run with:  npx tsx scripts/check-nav-map.ts
import assert from 'node:assert/strict'
import { ROSTER_PAGES, ROSTER_PAGE_LABEL, SECTION_OF_PAGE, artistsForPage, isRosterPage, pageForSection, pickerNote, scopeTarget, visibleRosterPages, type RosterPage } from '../src/lib/nav-map'
import type { MainSection } from '../src/types'

const SECTIONS: MainSection[] = ['overview', 'today', 'calendar', 'profile', 'songs', 'tour', 'deals', 'content', 'finance', 'projects', 'analytics', 'team', 'legal', 'activity']

// ── the pages, and what they are called (Eli's names: Tour, Music, Finance, Legal) ──
assert.deepEqual(ROSTER_PAGES, ['today', 'calendar', 'tour', 'music', 'finance', 'legal'])
assert.deepEqual(ROSTER_PAGES.map(p => ROSTER_PAGE_LABEL[p]), ['Today', 'Calendar', 'Tour', 'Music', 'Finance', 'Legal'])
assert.ok(isRosterPage('finance') && !isRosterPage('money') && !isRosterPage('songs') && !isRosterPage(undefined))

// ── every page has an artist section, and every page survives the trip into an artist and back ──
assert.deepEqual(ROSTER_PAGES.map(p => SECTION_OF_PAGE[p]), ['today', 'calendar', 'tour', 'songs', 'finance', 'legal'], 'inside an artist, Music is the songs section')
for (const p of ROSTER_PAGES) assert.equal(pageForSection(SECTION_OF_PAGE[p]), p, `${p} comes back as ${p}`)

// ── sections that only exist inside an artist fall back to Today when you go to "All artists"; none is lost or unmapped ──
for (const s of SECTIONS) assert.ok(isRosterPage(pageForSection(s)), `${s} maps to a page`)
for (const s of ['overview', 'profile', 'content', 'projects', 'analytics', 'team', 'activity'] as MainSection[]) assert.equal(pageForSection(s), 'today', `${s} has no all-artists page`)
assert.equal(pageForSection('deals'), 'tour', 'Deals & fees lives on the Tour page')

// ── the switcher ──
const dash = (rosterPage: RosterPage) => ({ view: 'dashboard' as const, section: 'calendar' as MainSection, rosterPage })
const inArtist = (section: MainSection) => ({ view: 'studio' as const, section, rosterPage: 'today' as RosterPage })
// from "All artists" to an artist: the same page, as that artist's section
for (const p of ROSTER_PAGES) assert.deepEqual(scopeTarget('nova', dash(p)), { kind: 'artist', clientId: 'nova', section: SECTION_OF_PAGE[p] }, `All artists / ${p} -> artist`)
// from an artist to "All artists": the same page, where there is one
assert.deepEqual(scopeTarget('all', inArtist('tour')), { kind: 'all', page: 'tour' })
assert.deepEqual(scopeTarget('all', inArtist('songs')), { kind: 'all', page: 'music' })
assert.deepEqual(scopeTarget('all', inArtist('finance')), { kind: 'all', page: 'finance' })
assert.deepEqual(scopeTarget('all', inArtist('deals')), { kind: 'all', page: 'tour' })
assert.deepEqual(scopeTarget('all', inArtist('content')), { kind: 'all', page: 'today' }, 'Content only exists inside an artist')
assert.deepEqual(scopeTarget('all', inArtist('overview')), { kind: 'all', page: 'today' }, 'the Overview is one artist')
assert.deepEqual(scopeTarget('other', inArtist('overview')), { kind: 'artist', clientId: 'other', section: 'overview' }, 'moving between artists keeps you on the Overview')
assert.deepEqual(scopeTarget('all', inArtist('team')), { kind: 'all', page: 'today' })
// from one artist to another: the section stays
assert.deepEqual(scopeTarget('other', inArtist('finance')), { kind: 'artist', clientId: 'other', section: 'finance' })
assert.deepEqual(scopeTarget('other', inArtist('profile')), { kind: 'artist', clientId: 'other', section: 'profile' })
// picking "All artists" while already there changes nothing
assert.deepEqual(scopeTarget('all', dash('legal')), { kind: 'all', page: 'legal' })
// from the company page: Today either way
assert.deepEqual(scopeTarget('all', { view: 'company', section: 'calendar', rosterPage: 'finance' }), { kind: 'all', page: 'today' })
assert.deepEqual(scopeTarget('nova', { view: 'company', section: 'calendar', rosterPage: 'finance' }), { kind: 'artist', clientId: 'nova', section: 'today' })

// ── who sees which artists on each page ──
const roster = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
const grants = (g: Record<string, string[]>) => (section: MainSection, id: string) => (g[id] ?? []).includes(section)
const ids = (xs: { id: string }[]) => xs.map(x => x.id)
const team = grants({ a: ['tour', 'finance'], b: ['songs'], c: [] })
assert.deepEqual(ids(artistsForPage('tour', roster, team)), ['a'])
assert.deepEqual(ids(artistsForPage('finance', roster, team)), ['a'])
assert.deepEqual(ids(artistsForPage('music', roster, team)), ['b'], 'Music is the songs section')
assert.deepEqual(ids(artistsForPage('legal', roster, team)), [], 'nobody shared Legal')
assert.deepEqual(visibleRosterPages(roster, team), ['today', 'calendar', 'tour', 'music', 'finance'], 'a page nobody opens is not in the list')
assert.deepEqual(visibleRosterPages([], team), ['today', 'calendar'], 'with no artists only Today and Calendar are left')
const dealsOnly = grants({ a: ['deals'] })
assert.deepEqual(ids(artistsForPage('tour', roster, dealsOnly)), ['a'], 'Deals & fees alone opens the Tour page')
assert.deepEqual(visibleRosterPages(roster, dealsOnly), ['today', 'calendar', 'tour'])
assert.deepEqual(ids(artistsForPage('finance', roster, dealsOnly)), [])

// ── rows that must not show a number ──
const none = () => false
assert.equal(pickerNote('legal', 'a', { shareOnly: grants({ a: ['legal'] }) }), 'Shared with you', 'only sent one item')
assert.equal(pickerNote('legal', 'a', { shareOnly: none }), null, 'a real Legal grant shows the number')
assert.equal(pickerNote('music', 'a', { shareOnly: grants({ a: ['legal'] }) }), null, 'a shared contract says nothing about Music')

console.log('nav-map checks passed')
