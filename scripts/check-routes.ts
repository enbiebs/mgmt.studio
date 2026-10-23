// Checks that every screen has an address and every address opens the right screen.  Run with:  npx tsx scripts/check-routes.ts
import assert from 'node:assert/strict'
import { parsePath, pathFor, titleFor, type Nav } from '../src/lib/routes'
import { loginPathFor, safeNextPath } from '../src/lib/safe-redirect'
import type { MainSection } from '../src/types'

const BASE: Nav = {
  view: 'studio', rosterPage: 'today', clientId: 'nimino-x7k2', section: 'calendar',
  songsSub: 'tracks', contentSub: 'manage', bizSub: 'royalties', tourSub: 'tour', analyticsSub: 'overview', legalSub: 'pipeline',
  selectedShowId: null, selectedAlbumId: null, selectedBudgetId: null,
}
const nav = (o: Partial<Nav>): Nav => ({ ...BASE, ...o })

// Turns an address back into the same fields the store holds, to prove the trip there and back changes nothing that matters.
function applied(path: string): Nav {
  const r = parsePath(path)
  assert.ok(r, `${path} should be an address of ours`)
  if (r.view === 'dashboard') return { ...BASE, view: 'dashboard', rosterPage: r.page, clientId: null }
  if (r.view === 'company') return { ...BASE, view: 'company', clientId: null }
  return { ...BASE, clientId: r.clientId, section: r.section, ...r.subs, selectedShowId: r.selectedShowId ?? null, selectedAlbumId: r.selectedAlbumId ?? null, selectedBudgetId: r.selectedBudgetId ?? null }
}

// ── the screens that are not an artist's: the "All artists" pages and the company page ──
assert.equal(pathFor(nav({ view: 'dashboard', clientId: null })), '/today')
assert.equal(pathFor(nav({ view: 'company', clientId: null })), '/company')
assert.deepEqual(parsePath('/today'), { view: 'dashboard', page: 'today' })
assert.deepEqual(parsePath('/'), { view: 'dashboard', page: 'today' })       // the old address of the app is Today
assert.deepEqual(parsePath('/company'), { view: 'company' })
assert.equal(pathFor(nav({ view: 'studio', clientId: null })), '/today')       // nothing open: Today
for (const page of ['today', 'calendar', 'tour', 'music', 'finance', 'legal'] as const) {
  assert.equal(pathFor(nav({ view: 'dashboard', rosterPage: page, clientId: null })), `/${page}`, `${page} has an address`)
  assert.deepEqual(parsePath(`/${page}`), { view: 'dashboard', page }, `/${page} opens ${page}`)
  assert.equal(applied(`/${page}`).rosterPage, page)
}
assert.deepEqual(parsePath('/tour/'), { view: 'dashboard', page: 'tour' })    // a trailing slash is the same address

// ── an artist's Today, and the rename of Money to Finance (old links keep working) ──
assert.equal(pathFor(nav({ section: 'today' })), '/artists/nimino-x7k2/today')
assert.equal(applied('/artists/nimino-x7k2/today').section, 'today')
assert.equal(applied('/artists/nimino-x7k2/finance/invoices').section, 'finance')
assert.equal(applied('/artists/nimino-x7k2/money/invoices').section, 'finance', 'the old /money address still opens Finance')
assert.equal(applied('/artists/nimino-x7k2/money/invoices').bizSub, 'invoices')
assert.equal(applied('/artists/nimino-x7k2/money').section, 'finance')
assert.equal(pathFor(applied('/artists/nimino-x7k2/money/invoices')), '/artists/nimino-x7k2/finance/invoices', 'and the address bar is tidied to the new one')

// ── sections without tabs ──
for (const [section, slug] of [['calendar', 'calendar'], ['profile', 'profile'], ['projects', 'projects'], ['team', 'team'], ['activity', 'activity']] as const) {
  assert.equal(pathFor(nav({ section })), `/artists/nimino-x7k2/${slug}`)
  assert.equal(applied(`/artists/nimino-x7k2/${slug}`).section, section)
}
assert.equal(parsePath('/artists/nimino-x7k2')?.view === 'studio' && (parsePath('/artists/nimino-x7k2') as { section: string }).section, 'calendar')   // an artist's own address opens their calendar

// ── a real example from the brief: a show's advance ──
assert.equal(pathFor(nav({ section: 'tour', tourSub: 'advance', selectedShowId: 'show-123' })), '/artists/nimino-x7k2/tour/advance/show-123')
let n = applied('/artists/nimino-x7k2/tour/advance/show-123')
assert.deepEqual([n.section, n.tourSub, n.selectedShowId, n.clientId], ['tour', 'advance', 'show-123', 'nimino-x7k2'])

// ── every tab of every section makes the trip there and back ──
const SECTIONS: [MainSection, keyof Nav, string[]][] = [
  ['tour', 'tourSub', ['tour', 'advance', 'daysheet', 'crew', 'guests', 'travel', 'offers', 'budget', 'settlements']],
  ['songs', 'songsSub', ['tracks', 'labelcopy', 'checklist', 'status']],
  ['finance', 'bizSub', ['royalties', 'banking', 'catalog', 'pl', 'invoices', 'payments', 'forecast']],
  ['content', 'contentSub', ['manage', 'studio', 'lab']],
  ['analytics', 'analyticsSub', ['overview', 'streaming', 'playlists', 'social', 'tiktok', 'audience', 'charts']],
  ['legal', 'legalSub', ['pipeline', 'alerts', 'register', 'templates']],
]
for (const [section, field, subs] of SECTIONS) {
  const seen = new Set<string>()
  for (const sub of subs) {
    const start = nav({ section, [field]: sub } as Partial<Nav>)
    const path = pathFor(start)
    assert.ok(!seen.has(path), `${path} is used by two tabs`)
    seen.add(path)
    const back = applied(path)
    assert.equal(back.section, section)
    assert.equal(back[field], sub, `${section}/${sub} comes back as ${String(back[field])}`)
  }
}

// ── records: a show on the tabs about shows, a budget on Budget, a release on the music tabs ──
for (const sub of ['tour', 'advance', 'daysheet', 'travel', 'guests'] as const) {
  n = applied(pathFor(nav({ section: 'tour', tourSub: sub, selectedShowId: 's-9' })))
  assert.equal(n.selectedShowId, 's-9', `${sub} keeps the show`)
}
n = applied(pathFor(nav({ section: 'tour', tourSub: 'budget', selectedBudgetId: 'bud-7' })))
assert.deepEqual([n.tourSub, n.selectedBudgetId, n.selectedShowId], ['budget', 'bud-7', null])
assert.equal(pathFor(nav({ section: 'tour', tourSub: 'offers', selectedShowId: 's-9' })), '/artists/nimino-x7k2/tour/offers')     // a show selected elsewhere does not leak into this tab's address
assert.equal(pathFor(nav({ section: 'finance', bizSub: 'pl', selectedShowId: 's-9' })), '/artists/nimino-x7k2/finance/pl')
n = applied(pathFor(nav({ section: 'songs', songsSub: 'labelcopy', selectedAlbumId: 'alb-3' })))
assert.deepEqual([n.songsSub, n.selectedAlbumId], ['labelcopy', 'alb-3'])
assert.equal(pathFor(nav({ section: 'songs', songsSub: 'status', selectedAlbumId: 'alb-3' })), '/artists/nimino-x7k2/music/status/alb-3')

// ── the offers section of an older link, and shows on the stage-plot tab, land somewhere real ──
assert.equal(pathFor(nav({ section: 'deals' })), '/artists/nimino-x7k2/tour/offers')
assert.equal(pathFor(nav({ section: 'tour', tourSub: 'stage-plot' })), '/artists/nimino-x7k2/tour/shows')

// ── ids with odd characters survive the trip ──
for (const id of ['plain', 'with space', 'a/b', 'ünï-cødé', 'x?y#z', '100%']) {
  const path = pathFor(nav({ clientId: id, section: 'tour', tourSub: 'advance', selectedShowId: `show ${id}` }))
  assert.ok(!path.slice(1).includes('//') && !/[?# ]/.test(path), `${path} is a clean address`)
  n = applied(path)
  assert.deepEqual([n.clientId, n.selectedShowId], [id, `show ${id}`])
}

// ── addresses that are not ours, or are damaged, are not guessed at ──
for (const bad of ['/login', '/auth/callback', '/api/fx', '/artists', '/artists/x/nonsense', '/artists/x/tour/nonsense', '/artists/x/finance/nonsense', '/artists/x/money/nonsense', '/artists/x/calendar/extra', '/artists/x/today/extra', '/calendar/x', '/music/x',
  '/artists/x/tour/advance/s1/extra', '/other', '/company/x', '/today/x', '/artists/%E0%A4%A']) {
  assert.equal(parsePath(bad), null, `${bad} should not be read as one of ours`)
}
assert.deepEqual(parsePath('/artists/x/tour/'), parsePath('/artists/x/tour'))      // a trailing slash is the same address
assert.deepEqual(parsePath('/artists/x/tour/advance')?.view, 'studio')

// ── page titles ──
const t = (view: Nav['view'], section: MainSection, rosterPage: Nav['rosterPage'] = 'today') => ({ view, section, rosterPage })
assert.equal(titleFor(t('dashboard', 'calendar')), 'Today')
assert.equal(titleFor(t('dashboard', 'calendar', 'finance')), 'Finance')
assert.equal(titleFor(t('dashboard', 'calendar', 'music')), 'Music')
assert.equal(titleFor(t('company', 'calendar')), 'Company')
assert.equal(titleFor(t('studio', 'tour'), 'nimino'), 'Tour · nimino')
assert.equal(titleFor(t('studio', 'songs'), 'nimino'), 'Music · nimino')
assert.equal(titleFor(t('studio', 'finance')), 'Finance')
assert.equal(titleFor(t('studio', 'today'), 'nimino'), 'Today · nimino')
assert.equal(titleFor(t('studio', 'deals'), 'nimino'), 'Tour · nimino')

// ── signing in returns you to the page you were headed to ──
assert.deepEqual(loginPathFor('/'), { pathname: '/login', search: '' })                                  // Home is not worth remembering
assert.deepEqual(loginPathFor('/artists/nimino-x7k2/tour/advance/show-123'), { pathname: '/login', search: '?next=%2Fartists%2Fnimino-x7k2%2Ftour%2Fadvance%2Fshow-123' })
assert.deepEqual(loginPathFor('/today', '?x=1'), { pathname: '/login', search: '?next=%2Ftoday%3Fx%3D1' })
assert.deepEqual(loginPathFor('//evil.com/x'), { pathname: '/login', search: '' })                        // an address that points off the site is dropped
// what comes back out of the link is checked again before anyone is sent there
assert.equal(safeNextPath('/artists/nimino-x7k2/tour/advance/show-123'), '/artists/nimino-x7k2/tour/advance/show-123')
assert.equal(safeNextPath(decodeURIComponent('%2Fartists%2Fa%3Fx%3D1')), '/artists/a?x=1')
assert.equal(safeNextPath('//evil.com'), '/')
assert.equal(safeNextPath('https://evil.com'), '/')
assert.equal(safeNextPath(null), '/')

console.log('routes checks passed')
