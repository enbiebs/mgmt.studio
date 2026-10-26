// Checks the glue between the address bar and the screen: arriving on an address, clicking around, Back, and the cases that must fall back.
// Runs the real store against a pretend browser.  Run with:  npx tsx scripts/check-url-sync.ts
import assert from 'node:assert/strict'
import { useStore } from '../src/lib/store'
import { startUrlSync, type BrowserLike } from '../src/lib/url-sync'
import { PRODUCT_NAME } from '../src/lib/brand'
import { artistsForPage, type RosterPage } from '../src/lib/nav-map'
import { tourAccessFor } from '../src/lib/roster-tour'
import { financeAccessFor } from '../src/lib/roster-finance'
import { legalAccessFor } from '../src/lib/roster-legal'
import { overviewAccessFor } from '../src/lib/artist-overview'
import { inboxAccessFor } from '../src/lib/inbox'
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
  role: 'manager', grants: [], authClientId: null, workspaceId: null, contexts: {}, clientWorkspace: {}, homeWorkspaceId: null,
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
assert.deepEqual(win.entries.slice(-1), ['/artists/c2/overview'])               // a manager opening an artist lands on their Overview
assert.equal(win.title(), `Overview · Beta · ${PRODUCT_NAME}`)
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
assert.deepEqual(nav().slice(0, 3), ['studio', 'c2', 'overview'])
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

// ── Today and the Overview are read and acted on, never edited like a page ──
fresh()
useStore.getState().openClient('c1')
for (const sec of ['today', 'overview'] as const) { assert.equal(useStore.getState().hasAccess(sec), true); assert.equal(useStore.getState().hasAccess(sec, 'c1', true), false); assert.equal(useStore.getState().isShareOnly(sec, 'c1'), false) }

fresh({ role: 'team', grants: [], data: { clients: [{ ...artist('c1', 'Alpha'), itemSections: ['finance'] }, artist('c2', 'Beta')] } })
assert.equal(useStore.getState().isShareOnly('overview', 'c1'), false, 'a person sent one invoice is never "share-only" on the Overview itself')
// ── what each kind of person gets on the Overview and in their alerts: whole sections only, never a single shared item ──
const NO = { tour: false, offers: false, music: false, finance: false, legal: false }
const forPerson = (over: Record<string, unknown>) => {
  fresh(over)
  const st = useStore.getState()
  const has = (s: Parameters<typeof st.hasAccess>[0], id: string) => st.hasAccess(s, id)
  const shareOnly = (s: Parameters<typeof st.hasAccess>[0], id: string) => st.isShareOnly(s, id)
  return { overview: overviewAccessFor(has, shareOnly, 'c1'), inbox: inboxAccessFor(has, shareOnly, 'c1') }
}
const sharedInvoice = { data: { clients: [{ ...artist('c1', 'Alpha'), itemSections: ['finance'] }, artist('c2', 'Beta')] } }
const sharedShow = { data: { clients: [{ ...artist('c1', 'Alpha'), itemSections: ['tour'] }, artist('c2', 'Beta')] } }
let p = forPerson({})                                                                                 // a manager
assert.deepEqual(p.overview, { tour: true, offers: true, music: true, finance: true, legal: true }); assert.deepEqual(p.inbox, { finance: true, tour: true, deals: true, legal: true, projects: true })
p = forPerson({ role: 'team', grants: [{ section: 'admin', clientId: 'c1', canEdit: true }] })        // a Point Person for this artist
assert.deepEqual(p.overview, { tour: true, offers: true, music: true, finance: true, legal: true })
p = forPerson({ role: 'team', grants: [{ section: 'deals', clientId: 'c1', canEdit: false }] })       // Deals & fees only: offers, never shows
assert.deepEqual(p.overview, { ...NO, offers: true }); assert.deepEqual(p.inbox, { finance: false, tour: false, deals: true, legal: false, projects: false })
p = forPerson({ role: 'team', grants: [{ section: 'finance', clientId: 'c1', canEdit: false }] })     // Finance only
assert.deepEqual(p.overview, { ...NO, finance: true }); assert.equal(p.inbox.finance, true); assert.equal(p.inbox.tour, false)
p = forPerson({ role: 'team', grants: [{ section: 'tour', clientId: 'c1', canEdit: false }], ...sharedInvoice })   // Tour, plus one invoice sent to them
assert.deepEqual(p.overview, { ...NO, tour: true }); assert.deepEqual(p.inbox, { finance: false, tour: true, deals: false, legal: false, projects: false })   // no settlement alerts: those need all of Finance
p = forPerson({ role: 'team', grants: [], ...sharedInvoice })                                         // one invoice sent to them, nothing else
assert.deepEqual(p.overview, NO); assert.deepEqual(p.inbox, { finance: false, tour: false, deals: false, legal: false, projects: false })   // not even an "overdue" alert worked out without the deposits
p = forPerson({ role: 'team', grants: [], ...sharedShow })                                            // one show sent to them
assert.deepEqual(p.overview, NO)

// ── the All-artists Tour page: what each person gets for an artist, from the real access rules ──
const tourFlags = (over: Record<string, unknown>, id = 'c1') => {
  fresh(over)
  const st = useStore.getState()
  return tourAccessFor((s, i) => st.hasAccess(s, i), (s, i) => st.isShareOnly(s, i), id, st.roleFor(id))
}
const ALLOWED = { shows: true, showsFully: true, deals: true, dealsFully: true, finance: true }
assert.deepEqual(tourFlags({}), ALLOWED)                                                                              // a manager
assert.deepEqual(tourFlags({ role: 'team', grants: [{ section: 'admin', clientId: 'c1', canEdit: true }] }), ALLOWED)  // a Point Person for the artist
assert.deepEqual(tourFlags({ role: 'team', grants: [{ section: 'deals', clientId: 'c1', canEdit: false }] }), { shows: false, showsFully: false, deals: true, dealsFully: true, finance: false })   // Deals & fees: offers, no shows
assert.deepEqual(tourFlags({ role: 'team', grants: [{ section: 'tour', clientId: 'c1', canEdit: false }] }), { shows: true, showsFully: true, deals: false, dealsFully: false, finance: false })    // Tour: shows, no fees or offers
assert.deepEqual(tourFlags({ role: 'team', grants: [], ...sharedShow }), { shows: true, showsFully: false, deals: false, dealsFully: false, finance: false })                                         // one show sent to them
assert.deepEqual(tourFlags({ role: 'team', grants: [{ section: 'tour', clientId: 'c1', canEdit: false }], ...sharedInvoice }), { shows: true, showsFully: true, deals: false, dealsFully: false, finance: false })   // one invoice sent is not Finance
// a login that manages one company and is an artist in another: the artist's schedule, and nothing management works out from it
const twoCompanies = { role: 'manager', workspaceId: 'w1', clientWorkspace: { c1: 'w1', c2: 'w2' }, contexts: { w1: { role: 'manager', authClientId: null, grants: [] }, w2: { role: 'artist', authClientId: 'c2', grants: [] } } }
assert.deepEqual(tourFlags(twoCompanies, 'c1'), ALLOWED)
assert.deepEqual(tourFlags(twoCompanies, 'c2'), { shows: true, showsFully: false, deals: false, dealsFully: false, finance: false })

// ── the All-artists Finance page: what each person gets for an artist, from the real access rules ──
function financeOf(id = 'c1') {
  const st = useStore.getState()
  return financeAccessFor((s, i) => st.hasAccess(s, i), (s, i) => st.isShareOnly(s, i), id, st.roleFor(id))
}
const financeFlags = (over: Record<string, unknown>, id = 'c1') => { fresh(over); return financeOf(id) }
const FULL = { finance: true, showMoney: true, limited: false }
const NO_SHOWS = { finance: true, showMoney: false, limited: false }
const grant = (section: string) => ({ section, clientId: 'c1', canEdit: false })
assert.deepEqual(financeFlags({}), FULL)                                                                              // a manager
assert.deepEqual(financeFlags({ role: 'team', grants: [{ section: 'admin', clientId: 'c1', canEdit: true }] }), FULL)  // a Point Person for the artist
assert.deepEqual(financeFlags({ role: 'team', grants: [grant('finance'), grant('tour'), grant('deals')] }), FULL)
assert.deepEqual(financeFlags({ role: 'team', grants: [grant('finance')] }), NO_SHOWS)                                  // Finance alone: invoices and bills, no settlements or show fees
assert.deepEqual(financeFlags({ role: 'team', grants: [grant('finance'), grant('deals')] }), NO_SHOWS)                  // the Business Manager preset: no Tour, so no shows loaded
assert.deepEqual(financeFlags({ role: 'team', grants: [grant('finance'), grant('tour')] }), NO_SHOWS)                  // no Deals & fees: fees and invoice links not loaded
assert.deepEqual(financeFlags({ role: 'team', grants: [grant('finance'), grant('deals')], ...sharedShow }), NO_SHOWS)  // Finance and fees, but only one show sent to them
assert.deepEqual(financeFlags({ role: 'team', grants: [grant('tour'), grant('deals')] }), { finance: false, showMoney: false, limited: false })   // no money at all
assert.deepEqual(financeFlags({ role: 'team', grants: [], ...sharedInvoice }), { finance: false, showMoney: false, limited: true })                 // one invoice sent to them: not worked out
assert.deepEqual(financeFlags({ role: 'team', grants: [grant('finance')], ...sharedInvoice }), NO_SHOWS)               // a real Finance grant wins over a shared item
assert.deepEqual(financeFlags({ role: 'artist', authClientId: 'c1' }), { finance: false, showMoney: false, limited: false })   // an artist's own login never sees management money
assert.deepEqual(financeFlags(twoCompanies, 'c1'), FULL)                                                              // manager of one company ...
assert.deepEqual(financeFlags(twoCompanies, 'c2'), { finance: false, showMoney: false, limited: false })              // ... and an artist in another: no management money there

// ── the All-artists Legal page: what each person gets for an artist, from the real access rules ──
function legalFlags(over: Record<string, unknown>, id = 'c1') {
  fresh(over)
  const st = useStore.getState()
  return legalAccessFor((s, i) => st.hasAccess(s, i), (s, i) => st.isShareOnly(s, i), id, st.roleFor(id))
}
const sharedContract = { data: { clients: [{ ...artist('c1', 'Alpha'), itemSections: ['legal'] }, artist('c2', 'Beta')] } }
assert.deepEqual(legalFlags({}), { open: true, full: true })                                                          // a manager
assert.deepEqual(legalFlags({ role: 'team', grants: [{ section: 'admin', clientId: 'c1', canEdit: true }] }), { open: true, full: true })   // a Point Person for the artist
assert.deepEqual(legalFlags({ role: 'team', grants: [grant('legal')] }), { open: true, full: true })
assert.deepEqual(legalFlags({ role: 'team', grants: [grant('finance'), grant('tour')] }), { open: false, full: false })                    // no Legal
assert.deepEqual(legalFlags({ role: 'team', grants: [], ...sharedContract }), { open: true, full: false })                                // one contract sent to them: listed, not counted
assert.deepEqual(legalFlags({ role: 'team', grants: [grant('legal')], ...sharedContract }), { open: true, full: true })                   // a real Legal grant wins over a shared item
assert.deepEqual(legalFlags({ role: 'team', grants: [], ...sharedInvoice }), { open: false, full: false })                                // a shared invoice says nothing about Legal
assert.deepEqual(legalFlags({ role: 'artist', authClientId: 'c1' }), { open: false, full: false })                                        // an artist's own login does not get the management view
assert.deepEqual(legalFlags(twoCompanies, 'c1'), { open: true, full: true })                                                              // manager of one company ...
assert.deepEqual(legalFlags(twoCompanies, 'c2'), { open: false, full: false })                                                            // ... and an artist in another

// ── an artist's own login keeps landing where it did (their portal ignores the page, but the address does not change) ──
fresh({ role: 'artist', authClientId: 'c1' }); useStore.getState().openClient('c1'); assert.equal(useStore.getState().section, 'calendar')

// ── the Overview is an artist's home: a manager lands there, other roles still land on the first page they have ──
fresh(); useStore.getState().openClient('c1'); assert.deepEqual(nav().slice(0, 3), ['studio', 'c1', 'overview'])
fresh({ role: 'team', grants: [{ section: 'finance', clientId: 'c1', canEdit: false }] }); useStore.getState().openClient('c1'); assert.deepEqual(nav().slice(0, 3), ['studio', 'c1', 'finance'])
fresh(); win = browser('/artists/c1'); stop = startUrlSync(win)                  // the bare address of an artist is their Overview
assert.deepEqual(nav().slice(0, 3), ['studio', 'c1', 'overview']); assert.deepEqual(win.entries, ['/artists/c1/overview']); stop()
fresh({ role: 'manager' }); useStore.getState().openClient('c1'); useStore.getState().switchScope('c2')
assert.deepEqual(nav().slice(0, 3), ['studio', 'c2', 'overview'])               // moving to another artist keeps the Overview
useStore.getState().switchScope('all'); assert.deepEqual([useStore.getState().view, useStore.getState().rosterPage], ['dashboard', 'today'])

// ── who the pick-an-artist pages list, from the real access rules ──
const listed = (page: RosterPage) => artistsForPage(page, useStore.getState().data.clients, (sec, id) => useStore.getState().hasAccess(sec, id)).map(c => c.id)
fresh()
assert.deepEqual(listed('finance'), ['c1', 'c2'])                                             // a manager opens everyone's
fresh({ role: 'team', grants: [{ section: 'tour', clientId: 'c1', canEdit: false }, { section: 'finance', clientId: 'c2', canEdit: false }] })
assert.deepEqual(listed('tour'), ['c1']); assert.deepEqual(listed('finance'), ['c2']); assert.deepEqual(listed('legal'), [])
fresh({ role: 'team', grants: [{ section: 'deals', clientId: 'c1', canEdit: false }] })
assert.deepEqual(listed('tour'), ['c1'])                                                      // Deals & fees opens the Tour page
fresh({ role: 'team', grants: [], data: { clients: [{ ...artist('c1', 'Alpha'), itemSections: ['finance'] }, artist('c2', 'Beta')] } })
assert.deepEqual(listed('finance'), ['c1'])                                                   // one shared invoice opens Finance for viewing ...
assert.deepEqual(financeOf(), { finance: false, showMoney: false, limited: true })                // ... but the All-artists Finance page adds up nothing from it

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
