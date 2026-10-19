// ──────────────────────────────────────────────────────────
//  Keeps the address bar and the screen in step, in both directions:
//    - what is open (artist, page, tab, show...) becomes the web address, so a link can be sent, bookmarked or opened in a new tab;
//    - an address typed, pasted or reached with Back / Forward opens that screen.
//  The address rules live in lib/routes.ts. This connects them to the store and the browser (which it is handed, so a test can
//  give it a pretend one). Started by components/layout/UrlSync.tsx.
// ──────────────────────────────────────────────────────────

import { useStore } from '@/lib/store'
import { canOpenSection } from '@/lib/tour-tabs'
import { parsePath, pathFor, titleFor, type Nav, type Route } from '@/lib/routes'
import { PRODUCT_NAME } from '@/lib/brand'

type State = ReturnType<typeof useStore.getState>

/** The parts of the browser this needs. */
export interface BrowserLike {
  location: { pathname: string; search: string }
  history: { pushState(data: unknown, unused: string, url: string): void; replaceState(data: unknown, unused: string, url: string): void }
  document: { title: string }
  addEventListener(type: 'popstate', listener: () => void): void
  removeEventListener(type: 'popstate', listener: () => void): void
  setTimeout(fn: () => void, ms: number): number
  clearTimeout(id: number): void
}

const navOf = (s: State): Nav => ({
  view: s.view, clientId: s.clientId, section: s.section,
  songsSub: s.songsSub, contentSub: s.contentSub, bizSub: s.bizSub, tourSub: s.tourSub, analyticsSub: s.analyticsSub, legalSub: s.legalSub,
  selectedShowId: s.selectedShowId, selectedAlbumId: s.selectedAlbumId, selectedBudgetId: s.selectedBudgetId,
})

/** Opens what an address says. An artist that does not exist (or this person may not open), or a page they may not open, falls back to something that does. */
export function applyRoute(route: Route): void {
  const s = useStore.getState()
  if (route.view === 'dashboard') return s.goToDashboard()
  if (route.view === 'company') return s.role === 'manager' ? s.goToCompany() : s.goToDashboard()

  const ids = s.accessibleClientIds()
  const client = s.data.clients.find(c => c.id === route.clientId)
  if (!client || (ids !== 'all' && !ids.includes(client.id))) return s.goToDashboard()

  s.openClient(client.id)                                   // also switches to that artist's company when it is another one
  const opened = useStore.getState()
  const section = canOpenSection(route.section, sec => opened.hasAccess(sec)) ? route.section : 'calendar'
  useStore.setState({
    section,
    ...route.subs,
    selectedShowId: route.selectedShowId && client.tour.shows.some(x => x.id === route.selectedShowId) ? route.selectedShowId : null,
    selectedAlbumId: route.selectedAlbumId && client.songs.albums.some(a => a.id === route.selectedAlbumId) ? route.selectedAlbumId : null,
    selectedBudgetId: route.selectedBudgetId && (client.finance.budgets ?? []).some(b => b.id === route.selectedBudgetId) ? route.selectedBudgetId : null,
  })
}

/** Google sends someone back to "/?google_calendar_connected=<artist>" after they connect: take them to that artist's calendar, message intact. */
function googleReturn(win: BrowserLike): string | null {
  if (win.location.pathname !== '/') return null
  const id = new URLSearchParams(win.location.search).get('google_calendar_connected')
  return id ? `/artists/${encodeURIComponent(id)}/calendar` : null
}

/** Starts keeping the address and the screen in step. Returns a function that stops it. */
export function startUrlSync(win: BrowserLike): () => void {
  let applying = false
  let timer: number | undefined
  let keepSearch = ''                        // the one-time ?google_calendar_... message, until the first normalising of the address

  function setTitle() {
    const s = useStore.getState()
    const name = s.data.clients.find(c => c.id === s.clientId)?.name
    win.document.title = `${titleFor(navOf(s), name)} · ${PRODUCT_NAME}`
  }

  function writeUrl(mode: 'push' | 'replace') {
    const target = pathFor(navOf(useStore.getState()))
    if (win.location.pathname !== target) {
      if (mode === 'push') win.history.pushState(null, '', target)
      else win.history.replaceState(null, '', target + keepSearch)
    }
    keepSearch = ''
    setTitle()
  }

  function openAddress(path: string) {
    applying = true
    try { applyRoute(parsePath(path) ?? { view: 'dashboard' }) } finally { applying = false }
  }

  // On arrival: open the address we were given, then tidy the address bar to match what actually opened.
  const returned = googleReturn(win)
  if (returned) keepSearch = win.location.search
  openAddress(returned ?? win.location.pathname)
  writeUrl('replace')

  // From then on: whatever gets opened in the app becomes a new address. A burst of changes (page, tab, show) is one step in Back.
  const off = useStore.subscribe(() => {
    if (applying) return
    win.clearTimeout(timer as number)
    timer = win.setTimeout(() => writeUrl('push'), 0)
  })
  const onPop = () => { openAddress(win.location.pathname); writeUrl('replace') }
  win.addEventListener('popstate', onPop)

  return () => { off(); win.removeEventListener('popstate', onPop); win.clearTimeout(timer as number) }
}
