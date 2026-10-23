// ──────────────────────────────────────────────────────────
//  The sidebar's two modes, and how they line up.
//    - "All artists": the pages that span the whole roster (Today, Calendar, Tour, Music, Finance, Legal).
//    - One artist picked: the same pages narrowed to that artist (plus Profile, Team, Activity and the rest of what only exists
//      inside an artist). The artist switcher at the top moves between the two and keeps you on the same page.
//  This file is the single place that says which roster page is which artist section, so switching can never land somewhere odd.
//  Pure logic (no store, no screen), covered by scripts/check-nav-map.ts.
// ──────────────────────────────────────────────────────────

import { canOpenSection } from '@/lib/tour-tabs'
import type { MainSection } from '@/types'

/** A page of the "All artists" view. Its address is /<page>. */
export type RosterPage = 'today' | 'calendar' | 'tour' | 'music' | 'finance' | 'legal'

export const ROSTER_PAGES: RosterPage[] = ['today', 'calendar', 'tour', 'music', 'finance', 'legal']

export const ROSTER_PAGE_LABEL: Record<RosterPage, string> = {
  today: 'Today', calendar: 'Calendar', tour: 'Tour', music: 'Music', finance: 'Finance', legal: 'Legal',
}

/** The artist section a roster page becomes once an artist is picked (inside an artist, Music is called "songs"). */
export const SECTION_OF_PAGE: Record<RosterPage, MainSection> = {
  today: 'today', calendar: 'calendar', tour: 'tour', music: 'songs', finance: 'finance', legal: 'legal',
}

/** The roster page an artist section turns into when "All artists" is picked. What only exists inside an artist falls back to Today. */
export function pageForSection(section: MainSection): RosterPage {
  switch (section) {
    case 'today': return 'today'
    case 'calendar': return 'calendar'
    case 'tour': case 'deals': return 'tour'
    case 'songs': return 'music'
    case 'finance': return 'finance'
    case 'legal': return 'legal'
    default: return 'today'
  }
}

export const isRosterPage = (v: unknown): v is RosterPage => typeof v === 'string' && (ROSTER_PAGES as string[]).includes(v)

/** Where the artist switcher should land. `to` is 'all' or an artist id; `from` is what is open now. */
export type ScopeTarget =
  | { kind: 'all'; page: RosterPage }
  | { kind: 'artist'; clientId: string; section: MainSection }

export function scopeTarget(
  to: 'all' | string,
  from: { view: 'dashboard' | 'studio' | 'company'; section: MainSection; rosterPage: RosterPage },
): ScopeTarget {
  if (to === 'all') return { kind: 'all', page: from.view === 'studio' ? pageForSection(from.section) : from.view === 'dashboard' ? from.rosterPage : 'today' }
  // Moving between artists keeps the section; coming from "All artists" the roster page becomes its section.
  const section = from.view === 'studio' ? from.section : from.view === 'dashboard' ? SECTION_OF_PAGE[from.rosterPage] : 'today'
  return { kind: 'artist', clientId: to, section }
}

/** Can this person open this roster page for this artist? (The Tour page also opens for Deals & fees alone.) */
type Has = (section: MainSection, clientId: string) => boolean

/** The artists a roster page can open for this person, in roster order. */
export function artistsForPage<C extends { id: string }>(page: RosterPage, clients: readonly C[], has: Has): C[] {
  return clients.filter(c => canOpenSection(SECTION_OF_PAGE[page], sec => has(sec, c.id)))
}

/** The roster pages this person gets: Today and Calendar always, the rest when at least one artist can be opened there. */
export function visibleRosterPages(clients: readonly { id: string }[], has: Has): RosterPage[] {
  return ROSTER_PAGES.filter(p => p === 'today' || p === 'calendar' || artistsForPage(p, clients, has).length > 0)
}

/**
 * Why a pick-an-artist row shows no numbers, or null when it can. Someone sent a single item sees only that item, and someone with
 * Deals & fees but not Tour gets no shows from the database, so a total worked out from what they can load would mislead.
 */
export function pickerNote(page: RosterPage, clientId: string, access: { has: Has; shareOnly: Has }): string | null {
  const section = SECTION_OF_PAGE[page]
  if (access.shareOnly(section, clientId)) return 'Shared with you'
  if (page === 'tour' && !access.has('tour', clientId)) return 'Offers only'
  return null
}
