// Checks the glue between the address bar and the screen: arriving on an address, clicking around, Back, and the cases that must fall back.
// Runs the real store against a pretend browser.  Run with:  npx tsx scripts/check-url-sync.ts
import assert from 'node:assert/strict'
import { useStore } from '../src/lib/store'
import { startUrlSync, type BrowserLike } from '../src/lib/url-sync'
import { PRODUCT_NAME } from '../src/lib/brand'
import { artistsForPage, pickerNote, type RosterPage } from '../src/lib/nav-map'
import type { Client } from '../src/types'

// ── a pretend browser with a real history ──
function browser(url: string) {
  const entries: string[] = [url]
  let at = 0
  let popListeners: (() => void)[] = []
  let pending: { id: number; fn: () => void }[] = []
  let nextTimer = 1
  const here = () => entries[at]
  const win: BrowserLike & { entries: string[]; flush(): void; back(): void; forward(): void; title(): string } = {
    get location() { const [p, q] = here().split('?'); return { pathname: p, search: q ? `?${q}` : '' } },
    history: {
      pushState: (_d, _u, u) => { entries.splice(at + 1); entries.push(u); at = entries.length - 1 },
      replaceState: (_d, _u, u) => { entries[at] = u },
    },
    document: { title: '' },
    addEventListener: (_t, l) => { popListeners.push(l) },
    removeEventListener: (_t, l) => { popListeners = popListeners.filter(x => x !== l) },
    setTimeout: fn => { const id = nextTimer++; pending.push({ id, fn }); return id },
    clearTimeout: id => { pending = pending.filter(p => p.id !== id) },
    entries,
    flush: () => { const run = pending; pending = []; run.forEach(p => p.fn()) },
    back: () => { at = Math.max(0, at - 1); popListeners.forEach(l => l()) },
    forward: () => { at = Math.min(entries.length - 1, at + 1); popListeners.forEach(l => l()) },
    title: () => win.document.title,
  }
  return win
}

const artist = (id: string, name: string): Client => ({
  id, name,
  tour: { shows: [{ id: `${id}-s1`, date: '2026-11-01', venue: 'V', city: 'C', time: '20:00', status: 'confirmed' }], advances: [], travel: [], guestList: [] },
  songs: { albums: [{ id: `${id}-a1`, title: 'EP', tracks: [] }] },
  finance: { budgets: [{ id: `${id}-b1`, showId: `${id}-s1` }], invoices: [], expenses: [], settlements: [] },
  agentData: { offers: [] }, business: { banking: { deposits: [] } }, legal: { contracts: [] }, projects: [],
}) as unknown as Client

const fresh = (over: Record<string, unknown> = {}) => useStore.setState({
  data: { clients: [artist('c1', 'Alpha'), artist('c2', 'Beta')] },
  role: 'manager', grants: [], authClientId: null,
  view: 'dashboard', rosterPage: 'today', clientId: null, section: 'calendar',
  songsSub: 'tracks', contentSub: 'manage', bizSub: 'royalties', tourSub: 'tour', analyticsSub: 'overview', legalSub: 'pipeline',
  selectedShowId: null, selectedAlbumId: null, selectedBudgetId: null,
  ...over,
})
const nav = () => { const s = useStore.getState(); return [s.view, s.clientId, s.section, s.tourSub, s.selectedShowId] }

// ── arriving at the old address of the app: Home, and the address bar says so ──
fresh()
let win = browser('/')
let stop = startUrlSync(win)
assert.deepEqual(nav(), ['dashboard', null, 'calendar', 'tour', null])
assert.deepEqual(win.entries, ['/today'])                                    // replaced, not added: Back does not return to "/"
assert.equal(win.title(), `Today · ${PRODUCT_NAME}`)
stop()

// ── arriving on a link to a show's advance (someone sent it in Slack) ──
fresh()
win = browser('/artists/c1/tour/advance/c1-s1')
stop = startUrlSync(win)
assert.deepEqual(nav(), ['studio', 'c1', 'tour', 'advance', 'c1-s1'])
assert.deepEqual(win.entries, ['/artists/c1/tour/advance/c1-s1'])            // already right: untouched
assert.equal(win.title(), `Tour · Alpha · ${PRODUCT_NAME}`)

// ── clicking around: each place is a step in Back, and a burst of changes is ONE step ──
useStore.getState().openClient('c2')
win.flush()
assert.deepEqual(win.entries.slice(-1), ['/artists/c2/calendar'])
assert.equal(win.title(), `Calendar · Beta · ${PRODUCT_NAME}`)
useStore.getState().setSection('tour')                                       // three changes in a row, as a click on a link does...
useStore.getState().setTourSub('advance')
useStore.getState().setSelectedShow('c2-s1')
assert.equal(win.entries.length, 2)                                          // ...nothing is written until the burst is over
win.flush()
assert.equal(win.entries.length, 3)                                          // ...and then it is one new address, not three
assert.deepEqual(win.entries.slice(-1), ['/artists/c2/tour/advance/c2-s1'])
useStore.getState().setSection('tour')
win.flush()
assert.deepEqual(win.entries.slice(-1), ['/artists/c2/tour/advance'])        // selecting nothing drops the show from the address
useStore.getState().setBizSub('pl')
useStore.getState().setSection('finance')
win.flush()
assert.deepEqual(win.entries.slice(-1), ['/artists/c2/finance/pl'])       // the page is called Finance in the address, as everywhere else
win.flush()
assert.equal(win.entries.length, 5)                                          // nothing changed, nothing added

// ── Back and Forward open the earlier screens, without adding to history ──
const before = win.entries.length
win.back()
assert.deepEqual(nav().slice(0, 3), ['studio', 'c2', 'tour'])
win.back()
assert.deepEqual(nav(), ['studio', 'c2', 'tour', 'advance', 'c2-s1'])        // the show that was open is open again
win.back()
assert.deepEqual(nav().slice(0, 3), ['studio', 'c2', 'calendar'])
win.back()
assert.deepEqual(nav(), ['studio', 'c1', 'tour', 'advance', 'c1-s1'])        // all the way back to the first artist
win.flush()
assert.equal(win.entries.length, before)                                     // going back never wrote anything
win.forward()
assert.deepEqual(nav().slice(0, 2), ['studio', 'c2'])
stop()

// ── the old Finance address (bookmarks) still opens Finance, and the address bar is corrected ──
fresh(); win = browser('/artists/c2/money/pl'); stop = startUrlSync(win)
assert.deepEqual(nav().slice(0, 3), ['studio', 'c2', 'finance']); assert.deepEqual(win.entries, ['/artists/c2/finance/pl']); stop()

// ── "All artists" pages have their own addresses, and the artist switcher keeps you on the same page ──
fresh(); win = browser('/tour'); stop = startUrlSync(win)
assert.equal(useStore.getState().view, 'dashboard'); assert.equal(useStore.getState().rosterPage, 'tour'); assert.deepEqual(win.entries, ['/tour'])
assert.equal(win.title(), `Tour · ${PRODUCT_NAME}`)
useStore.getState().switchScope('c1'); win.flush()
assert.deepEqual(nav().slice(0, 3), ['studio', 'c1', 'tour']); assert.deepEqual(win.entries.slice(-1), ['/artists/c1/tour/shows'])
useStore.getState().switchScope('all'); win.flush()
assert.equal(useStore.getState().view, 'dashboard'); assert.equal(useStore.getState().rosterPage, 'tour'); assert.deepEqual(win.entries.slice(-1), ['/tour'])
useStore.getState().goToRoster('finance'); win.flush()
assert.deepEqual(win.entries.slice(-1), ['/finance'])
useStore.getState().switchScope('c2'); win.flush()
assert.deepEqual(nav().slice(0, 3), ['studio', 'c2', 'finance'])
stop()
fresh(); win = browser('/artists/c1/today'); stop = startUrlSync(win)                  // Today inside an artist
assert.deepEqual(nav().slice(0, 3), ['studio', 'c1', 'today']); assert.deepEqual(win.entries, ['/artists/c1/today']); stop()

// ── the switcher never lands on a page the person cannot open ──
fresh({ role: 'team', grants: [{ section: 'tour', clientId: 'c1', canEdit: false }, { section: 'finance', clientId: 'c2', canEdit: false }] })
useStore.getState().goToRoster('tour')
useStore.getState().switchScope('c1')
assert.deepEqual(nav().slice(0, 3), ['studio', 'c1', 'tour'])                // they can open Tour for Alpha
useStore.getState().switchScope('c2')
assert.deepEqual(nav().slice(0, 3), ['studio', 'c2', 'finance'])             // not for Beta: they land on what Beta has shared with them

// ── moving to another artist starts fresh; picking the artist you are already on changes nothing ──
fresh()
useStore.getState().openClient('c1'); useStore.getState().setSection('tour'); useStore.getState().setSelectedShow('c1-s1'); useStore.getState().setSelectedBudget('c1-b1')
useStore.getState().switchScope('c1')
assert.equal(useStore.getState().selectedShowId, 'c1-s1'); assert.equal(useStore.getState().selectedBudgetId, 'c1-b1')   // same artist: untouched
useStore.getState().switchScope('c2')
assert.deepEqual(nav().slice(0, 3), ['studio', 'c2', 'tour'])
assert.equal(useStore.getState().selectedShowId, null); assert.equal(useStore.getState().selectedBudgetId, null)           // another artist: nothing carried over
useStore.getState().setSelectedBudget('c2-b1'); useStore.getState().openClient('c1')
assert.equal(useStore.getState().selectedBudgetId, null, 'opening an artist never inherits a selected budget')

// ── Today is read and acted on, never edited like a page ──
fresh()
useStore.getState().openClient('c1')
assert.equal(useStore.getState().hasAccess('today'), true); assert.equal(useStore.getState().hasAccess('today', 'c1', true), false)

// ── who the pick-an-artist pages list, from the real access rules ──
const listed = (page: RosterPage) => artistsForPage(page, useStore.getState().data.clients, (sec, id) => useStore.getState().hasAccess(sec, id)).map(c => c.id)
fresh()
assert.deepEqual(listed('finance'), ['c1', 'c2'])                                             // a manager opens everyone's
fresh({ role: 'team', grants: [{ section: 'tour', clientId: 'c1', canEdit: false }, { section: 'finance', clientId: 'c2', canEdit: false }] })
assert.deepEqual(listed('tour'), ['c1']); assert.deepEqual(listed('finance'), ['c2']); assert.deepEqual(listed('legal'), [])
fresh({ role: 'team', grants: [{ section: 'deals', clientId: 'c1', canEdit: false }] })
assert.deepEqual(listed('tour'), ['c1'])                                                      // Deals & fees opens the Tour page ...
{ const st = useStore.getState(); assert.equal(pickerNote('tour', 'c1', { has: (s, i) => st.hasAccess(s, i), shareOnly: (s, i) => st.isShareOnly(s, i) }), 'Offers only') }   // ... but shows no shows
fresh({ role: 'team', grants: [], data: { clients: [{ ...artist('c1', 'Alpha'), itemSections: ['finance'] }, artist('c2', 'Beta')] } })
assert.deepEqual(listed('finance'), ['c1'])                                                   // one shared invoice opens Finance for viewing ...
{ const st = useStore.getState(); assert.equal(pickerNote('finance', 'c1', { has: (s, i) => st.hasAccess(s, i), shareOnly: (s, i) => st.isShareOnly(s, i) }), 'Shared with you') }   // ... but no totals

// ── things that must fall back, never break ──
fresh(); win = browser('/artists/nobody/tour'); stop = startUrlSync(win)     // an artist that does not exist
assert.deepEqual(nav(), ['dashboard', null, 'calendar', 'tour', null]); assert.deepEqual(win.entries, ['/today']); stop()

fresh(); win = browser('/artists/c1/tour/advance/not-a-show'); stop = startUrlSync(win)   // a show that does not exist: the tab opens, no show selected
assert.deepEqual(nav(), ['studio', 'c1', 'tour', 'advance', null]); assert.deepEqual(win.entries, ['/artists/c1/tour/advance']); stop()

fresh(); win = browser('/artists/c1/music/label-copy/not-a-release'); stop = startUrlSync(win)
assert.equal(useStore.getState().selectedAlbumId, null); assert.deepEqual(win.entries, ['/artists/c1/music/label-copy']); stop()

fresh(); win = browser('/artists/c1/tour/budget/c1-b1'); stop = startUrlSync(win)
assert.equal(useStore.getState().selectedBudgetId, 'c1-b1'); stop()

fresh(); win = browser('/artists/c1/nonsense'); stop = startUrlSync(win)        // an address that is not one of ours
assert.deepEqual(nav().slice(0, 1), ['dashboard']); assert.deepEqual(win.entries, ['/today']); stop()

fresh(); win = browser('/login'); stop = startUrlSync(win)
assert.deepEqual(win.entries, ['/today']); stop()

// ── the company page is for managers ──
fresh(); win = browser('/company'); stop = startUrlSync(win)
assert.equal(useStore.getState().view, 'company'); assert.deepEqual(win.entries, ['/company']); stop()
fresh({ role: 'team', grants: [{ section: 'tour', clientId: 'c1', canEdit: false }] }); win = browser('/company'); stop = startUrlSync(win)
assert.equal(useStore.getState().view, 'dashboard'); assert.deepEqual(win.entries, ['/today']); stop()

// ── someone who may only open some things: other artists and other pages fall back ──
fresh({ role: 'team', grants: [{ section: 'tour', clientId: 'c1', canEdit: false }] })
win = browser('/artists/c2/tour'); stop = startUrlSync(win)                   // an artist they cannot open
assert.equal(useStore.getState().view, 'dashboard'); stop()
fresh({ role: 'team', grants: [{ section: 'tour', clientId: 'c1', canEdit: false }] })
win = browser('/artists/c1/legal'); stop = startUrlSync(win)                  // an artist they can open, a page they cannot
assert.deepEqual(nav().slice(0, 3), ['studio', 'c1', 'calendar']); assert.deepEqual(win.entries, ['/artists/c1/calendar']); stop()
fresh({ role: 'team', grants: [{ section: 'tour', clientId: 'c1', canEdit: false }] })
win = browser('/artists/c1/tour/advance/c1-s1'); stop = startUrlSync(win)     // and what they may open opens
assert.deepEqual(nav(), ['studio', 'c1', 'tour', 'advance', 'c1-s1']); stop()

// ── coming back from connecting Google Calendar: that artist's calendar, with the message still on the address ──
fresh(); win = browser('/?google_calendar_connected=c1'); stop = startUrlSync(win)
assert.deepEqual(nav().slice(0, 3), ['studio', 'c1', 'calendar'])
assert.deepEqual(win.entries, ['/artists/c1/calendar?google_calendar_connected=c1'])
assert.equal(win.location.search, '?google_calendar_connected=c1')
useStore.getState().setSection('tour'); win.flush()
assert.deepEqual(win.entries.slice(-1), ['/artists/c1/tour/shows'])             // the message is only kept for the first tidy-up
stop()

// ── stopped means stopped ──
fresh(); win = browser('/artists/c1/calendar'); stop = startUrlSync(win); stop()
useStore.getState().openClient('c2'); win.flush()
assert.deepEqual(win.entries, ['/artists/c1/calendar'])

console.log('url-sync checks passed')
