// ──────────────────────────────────────────────────────────
//  The address of every screen, and the screen for every address. The app keeps what is open in one store (which artist,
//  which section and tab, which show or budget); this turns that into a web address and back, so Back, bookmarks, opening
//  in a new tab and links in Slack all work:
//
//    /today  /calendar  /tour  /music  /finance  /legal      the "All artists" pages
//    /company                                 the company page
//    /artists/{artist}                        an artist's Overview (also /artists/{artist}/overview)
//    /artists/{artist}/today                  an artist's Today
//    /artists/{artist}/calendar               an artist's calendar
//    /artists/{artist}/tour/advance/{show}    a show's advance
//    /artists/{artist}/finance/invoices       the invoices   (this used to be .../money/..., which still opens)
//    /artists/{artist}/music/label-copy/{release}
//
//  Pure logic (no store, no screen), covered by scripts/check-routes.ts.
// ──────────────────────────────────────────────────────────

import type { AnalyticsSub, BizSub, ContentSub, LegalSub, MainSection, SongsSub, TourSub } from '@/types'
import { ROSTER_PAGE_LABEL, isRosterPage, type RosterPage } from '@/lib/nav-map'

export interface Nav {
  view: 'dashboard' | 'studio' | 'company'
  /** Which "All artists" page is open (only meaningful when no artist is). */
  rosterPage: RosterPage
  clientId: string | null
  section: MainSection
  songsSub: SongsSub
  contentSub: ContentSub
  bizSub: BizSub
  tourSub: TourSub
  analyticsSub: AnalyticsSub
  legalSub: LegalSub
  selectedShowId: string | null
  selectedAlbumId: string | null
  selectedBudgetId: string | null
}

type Subs = Pick<Nav, 'songsSub' | 'contentSub' | 'bizSub' | 'tourSub' | 'analyticsSub' | 'legalSub'>

export type Route =
  | { view: 'dashboard'; page: RosterPage }
  | { view: 'company' }
  | { view: 'studio'; clientId: string; section: MainSection; subs: Partial<Subs>; selectedShowId?: string; selectedAlbumId?: string; selectedBudgetId?: string }

// Section names as they appear in a web address.
const SECTION_SLUG: Record<MainSection, string> = {
  overview: 'overview', today: 'today', calendar: 'calendar', profile: 'profile', songs: 'music', tour: 'tour', deals: 'tour', content: 'content', finance: 'finance',
  projects: 'projects', analytics: 'analytics', team: 'team', legal: 'legal', activity: 'activity',
}
const SLUG_SECTION: Record<string, MainSection> = {
  ...Object.fromEntries((Object.entries(SECTION_SLUG) as [MainSection, string][]).filter(([k]) => k !== 'deals').map(([k, v]) => [v, k])),
  money: 'finance',                      // the old address of Finance: links and bookmarks made before the rename keep working
}

// Tab names, where the address says it differently from the store.
const TOUR_SLUG: Record<TourSub, string> = {
  tour: 'shows', 'stage-plot': 'shows', advance: 'advance', daysheet: 'day-sheet', crew: 'crew', guests: 'guests',
  travel: 'travel', offers: 'offers', budget: 'budget', settlements: 'settlements',
}
const SONGS_SLUG: Record<SongsSub, string> = { tracks: 'tracks', labelcopy: 'label-copy', checklist: 'checklist', status: 'status' }
const reverse = <T extends string>(m: Record<T, string>) => Object.fromEntries((Object.entries(m) as [T, string][]).filter(([k]) => k !== 'stage-plot').map(([k, v]) => [v, k])) as Record<string, T>
/** A lookup that only finds the table's own entries, so an address word like "constructor" or "toString" is just not a page. */
const own = <T>(table: Record<string, T>, key: string): T | undefined => (Object.hasOwn(table, key) ? table[key] : undefined)
const SLUG_TOUR = reverse(TOUR_SLUG)
const SLUG_SONGS = reverse(SONGS_SLUG)
const BIZ: BizSub[] = ['royalties', 'banking', 'catalog', 'pl', 'invoices', 'payments', 'forecast']
const CONTENT: ContentSub[] = ['manage', 'studio', 'lab']
const ANALYTICS: AnalyticsSub[] = ['overview', 'streaming', 'playlists', 'social', 'tiktok', 'audience', 'charts']
const LEGAL: LegalSub[] = ['pipeline', 'alerts', 'register', 'templates']

// Tour tabs that are about one particular show, and the one that is about one budget.
const SHOW_TABS: TourSub[] = ['tour', 'advance', 'daysheet', 'travel', 'guests']

const join = (...parts: (string | null | undefined)[]) => '/' + parts.filter((p): p is string => !!p).map(encodeURIComponent).join('/')

/** The address for what is open. */
export function pathFor(nav: Nav): string {
  if (nav.view === 'dashboard' || (nav.view === 'studio' && !nav.clientId)) return `/${nav.view === 'dashboard' ? nav.rosterPage : 'today'}`
  if (nav.view === 'company') return '/company'
  const artist = nav.clientId!
  const section: MainSection = nav.section === 'deals' ? 'tour' : nav.section
  const slug = SECTION_SLUG[section]
  switch (section) {
    case 'tour': {
      const sub: TourSub = nav.section === 'deals' ? 'offers' : nav.tourSub
      const record = SHOW_TABS.includes(sub) ? nav.selectedShowId : sub === 'budget' ? nav.selectedBudgetId : null
      return join('artists', artist, slug, TOUR_SLUG[sub], record)
    }
    case 'songs': return join('artists', artist, slug, SONGS_SLUG[nav.songsSub], nav.selectedAlbumId)
    case 'finance': return join('artists', artist, slug, nav.bizSub)
    case 'content': return join('artists', artist, slug, nav.contentSub)
    case 'analytics': return join('artists', artist, slug, nav.analyticsSub)
    case 'legal': return join('artists', artist, slug, nav.legalSub)
    default: return join('artists', artist, slug)
  }
}

/** What an address means, or null when it is not one of ours (the caller then leaves things as they are). */
export function parsePath(pathname: string): Route | null {
  let parts: string[]
  try { parts = pathname.split('/').filter(Boolean).map(decodeURIComponent) } catch { return null }
  if (parts.length === 0) return { view: 'dashboard', page: 'today' }
  if (parts.length === 1 && isRosterPage(parts[0])) return { view: 'dashboard', page: parts[0] }
  if (parts.length === 1 && parts[0] === 'company') return { view: 'company' }
  if (parts[0] !== 'artists' || parts.length < 2 || parts.length > 5) return null

  const [, clientId, sectionSlug, subSlug, record] = parts
  const section = sectionSlug ? own(SLUG_SECTION, sectionSlug) : 'overview'
  if (!section) return null
  const route: Extract<Route, { view: 'studio' }> = { view: 'studio', clientId, section, subs: {} }
  switch (section) {
    case 'tour': {
      const sub = subSlug ? own(SLUG_TOUR, subSlug) : 'tour'
      if (!sub) return null
      route.subs.tourSub = sub
      if (record) { if (SHOW_TABS.includes(sub)) route.selectedShowId = record; else if (sub === 'budget') route.selectedBudgetId = record }
      break
    }
    case 'songs': {
      const sub = subSlug ? own(SLUG_SONGS, subSlug) : 'tracks'
      if (!sub) return null
      route.subs.songsSub = sub
      if (record) route.selectedAlbumId = record
      break
    }
    case 'finance': { const sub = subSlug ? BIZ.find(s => s === subSlug) : 'royalties'; if (!sub) return null; route.subs.bizSub = sub; break }
    case 'content': { const sub = subSlug ? CONTENT.find(s => s === subSlug) : 'manage'; if (!sub) return null; route.subs.contentSub = sub; break }
    case 'analytics': { const sub = subSlug ? ANALYTICS.find(s => s === subSlug) : 'overview'; if (!sub) return null; route.subs.analyticsSub = sub; break }
    case 'legal': { const sub = subSlug ? LEGAL.find(s => s === subSlug) : 'pipeline'; if (!sub) return null; route.subs.legalSub = sub; break }
    default: if (subSlug) return null
  }
  return route
}

const SECTION_TITLE: Record<MainSection, string> = {
  overview: 'Overview', today: 'Today', calendar: 'Calendar', profile: 'Profile', songs: 'Music', tour: 'Tour', deals: 'Tour', content: 'Content', finance: 'Finance',
  projects: 'Projects', analytics: 'Analytics', team: 'Team', legal: 'Legal', activity: 'Activity',
}

/** The page title (browser tab, history): "Tour · nimino", "Today", "Company". */
export function titleFor(nav: Pick<Nav, 'view' | 'section' | 'rosterPage'>, artistName?: string): string {
  if (nav.view === 'dashboard') return ROSTER_PAGE_LABEL[nav.rosterPage]
  if (nav.view === 'company') return 'Company'
  return artistName ? `${SECTION_TITLE[nav.section]} · ${artistName}` : SECTION_TITLE[nav.section]
}
