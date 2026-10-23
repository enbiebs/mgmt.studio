'use client'
// The app's pages, in the order and grouping they appear in the sidebar
// (and, on a phone, in the strip under the top bar).
//   - "All artists": the roster pages (see lib/nav-map.ts), each shown when at least one artist can be opened there.
//   - One artist picked: Overview and Profile, then the same pages narrowed to that artist, then "More" (what only exists inside an artist), then Company.

import { useStore } from '@/lib/store'
import { analyticsHasData } from '@/lib/unfinished'
import { canOpenSection } from '@/lib/tour-tabs'
import { artistsForPage, visibleRosterPages, type RosterPage } from '@/lib/nav-map'
import type { Client, MainSection } from '@/types'
import type { IconName } from '@/components/ui/Icon'

export interface NavItem { key: MainSection; label: string; icon: IconName }
export interface NavGroup { label: string; items: NavItem[] }

/** The icon for each roster page (the same icon follows the page into an artist). */
export const ROSTER_PAGE_ICON: Record<RosterPage, IconName> = {
  today: 'check', calendar: 'calendar', tour: 'tour', music: 'music', finance: 'finance', legal: 'legal',
}

export const NAV_GROUPS: NavGroup[] = [
  { label: '', items: [
    { key: 'overview', label: 'Overview', icon: 'home' },
    { key: 'profile',  label: 'Profile',  icon: 'profile' },
  ] },
  { label: '', items: [
    { key: 'today',    label: 'Today',    icon: 'check' },
    { key: 'calendar', label: 'Calendar', icon: 'calendar' },
    { key: 'tour',     label: 'Tour',     icon: 'tour' },
    { key: 'songs',    label: 'Music',    icon: 'music' },
    { key: 'finance',  label: 'Finance',  icon: 'finance' },
    { key: 'legal',    label: 'Legal',    icon: 'legal' },
  ] },
  { label: 'More', items: [
    { key: 'content',   label: 'Content',   icon: 'content' },
    { key: 'projects',  label: 'Projects',  icon: 'projects' },
    { key: 'analytics', label: 'Analytics', icon: 'analytics' },
  ] },
  { label: 'Company', items: [
    { key: 'team',     label: 'Team',     icon: 'team' },
    { key: 'activity', label: 'Activity', icon: 'activity' },
  ] },
]

export function sectionLabel(section: MainSection): string {
  for (const g of NAV_GROUPS) for (const i of g.items) if (i.key === section) return i.label
  return section
}

/** Every artist this person can open, in roster order. */
export function useRosterClients(): Client[] {
  const data = useStore(s => s.data)
  const accessibleClientIds = useStore(s => s.accessibleClientIds)
  const grants = useStore(s => s.grants)
  void grants   // a change in what this person may open re-runs this
  const ids = accessibleClientIds()
  return ids === 'all' ? data.clients : data.clients.filter(c => ids.includes(c.id))
}

/** The artists a roster page can open (Tour, Music, Finance and Legal depend on what each artist has shared with this person). */
export function useArtistsFor(page: RosterPage): Client[] {
  const hasAccess = useStore(s => s.hasAccess)
  const roster = useRosterClients()
  return artistsForPage(page, roster, (section, id) => hasAccess(section, id))
}

/** The pages of "All artists" this person can open. Today and Calendar are always there; the rest need at least one artist to open. */
export function useVisibleRosterPages(): RosterPage[] {
  const hasAccess = useStore(s => s.hasAccess)
  const roster = useRosterClients()
  return visibleRosterPages(roster, (section, id) => hasAccess(section, id))
}

/** The groups this person can open for the current artist (empty groups are dropped). */
export function useVisibleNav(): NavGroup[] {
  const hasAccess = useStore(s => s.hasAccess)
  const clientId = useStore(s => s.clientId)
  const client = useStore(s => s.getClient())
  const showUnfinished = useStore(s => s.showUnfinished)
  const analyticsVisible = showUnfinished || analyticsHasData(client)
  return NAV_GROUPS
    .map(g => ({ ...g, items: g.items.filter(i => canOpenSection(i.key, s => hasAccess(s, clientId ?? undefined)) && (i.key !== 'analytics' || analyticsVisible)) }))
    .filter(g => g.items.length > 0)
}
