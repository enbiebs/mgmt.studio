// ──────────────────────────────────────────────────────────
//  Studio · Per-item "who sees what"
//
//  The database (supabase/migrations/021_item_access.sql) is what actually
//  enforces this: managers see everything; everyone else follows their area
//  access, plus per-item exceptions - 'hide' (disappears completely) or
//  'share' (view-only, even with no access to the area).
//
//  These pure helpers mirror that logic client-side for the three things the
//  database can't do for us: showing a manager each person's current state,
//  previewing the app as someone else (a manager's own session sees all rows),
//  and deciding which section tabs someone with only a shared item should get.
// ──────────────────────────────────────────────────────────

import type { Client, MainSection, UserRole } from '@/types'
import type { AccessGrant } from '@/lib/db'

export type ItemType = 'show' | 'album' | 'post' | 'project' | 'invoice' | 'contract' | 'expense'
export type ItemEffect = 'hide' | 'share'

export interface ItemException {
  id: string
  clientId: string
  itemType: ItemType
  itemId: string
  memberId: string
  effect: ItemEffect
}

// What the person sees: a manager-style member (any login with a section grant)
// or an artist login (tied to one client).
export interface Viewer {
  memberId: string
  role: UserRole
  clientId: string | null   // the artist's own client; null for team logins
  grants: AccessGrant[]
}

export const ITEM_TYPES: ItemType[] = ['show', 'album', 'post', 'project', 'invoice', 'contract', 'expense']

export const ITEM_SECTION: Record<ItemType, MainSection> = {
  show: 'tour', album: 'songs', post: 'content', project: 'projects',
  invoice: 'finance', contract: 'legal', expense: 'finance',
}

// The artist logs into a simplified portal (src/components/artist/ArtistView.tsx):
// shows, posts, their requests, royalties. It has no screen for the rest, so
// those item types aren't offered in the sharing control for the artist.
export const ARTIST_PORTAL_ITEM_TYPES: ItemType[] = ['show', 'album', 'post', 'project']

// access_grants.section uses 'music' where the app's MainSection uses 'songs'.
export const SECTION_TO_GRANT_KEY: Record<MainSection, string> = {
  calendar: 'calendar', songs: 'music', tour: 'tour', content: 'content', finance: 'finance',
  team: 'team', projects: 'projects', analytics: 'analytics', fandom: 'fandom', legal: 'legal',
}

// Which section holds each kind of item - for "does this person have anything
// to see in this section?" when they have no grant for it.
export const SECTION_ITEM_TYPES: Partial<Record<MainSection, ItemType[]>> = {
  tour: ['show'], songs: ['album'], content: ['post'], projects: ['project'],
  finance: ['invoice', 'expense'], legal: ['contract'],
}

// Sub-tabs a person with only shared items (no grant for the section) gets:
// just the ones that show a kind of item that can be shared, and only when
// there is actually something of that kind for them to see.
const SHARE_ONLY_TABS: Partial<Record<MainSection, { tab: string; has?: (c: Client) => boolean }[]>> = {
  songs: ['tracks', 'labelcopy', 'checklist', 'status'].map(tab => ({ tab })),
  tour: ['tour', 'advance', 'daysheet', 'travel', 'guests'].map(tab => ({ tab })),
  content: [{ tab: 'manage' }],
  finance: [
    { tab: 'invoices', has: c => c.finance.invoices.length > 0 },
    { tab: 'payments', has: c => c.finance.expenses.length > 0 },
  ],
  legal: [{ tab: 'pipeline' }],
}

export function shareOnlyTabs(section: MainSection, c: Client | undefined): string[] | undefined {
  const tabs = SHARE_ONLY_TABS[section]
  if (!tabs || !c) return undefined
  const out = tabs.filter(t => !t.has || t.has(c)).map(t => t.tab)
  return out.length > 0 ? out : undefined
}

// The tab to show: someone with only shared items can't land on a tab that
// holds nothing they can see, so a stale selection falls back to their first.
export function effectiveSub(sub: string, allowed: string[] | undefined): string {
  return allowed && !allowed.includes(sub) ? allowed[0] : sub
}

export function hasSectionGrant(v: Viewer, section: MainSection, clientId: string): boolean {
  if (v.role === 'manager') return true
  if (v.role === 'artist') return v.clientId === clientId
  const key = SECTION_TO_GRANT_KEY[section]
  return v.grants.some(g => g.section === key && (g.clientId === null || g.clientId === clientId))
}

// What the person sees with no exceptions: their normal area access, except
// bills/expenses, which are management-side only (never the artist login).
export function baselineSees(v: Viewer, type: ItemType, clientId: string): boolean {
  if (type === 'expense' && v.role === 'artist') return false
  return hasSectionGrant(v, ITEM_SECTION[type], clientId)
}

export function findException(exceptions: ItemException[], memberId: string, type: ItemType, itemId: string) {
  return exceptions.find(e => e.memberId === memberId && e.itemType === type && e.itemId === itemId)
}

export function effectiveSees(v: Viewer, type: ItemType, itemId: string, clientId: string, exceptions: ItemException[]): boolean {
  if (v.role === 'manager') return true
  const ex = findException(exceptions, v.memberId, type, itemId)
  if (ex) return ex.effect === 'share'
  return baselineSees(v, type, clientId)
}

// Sections where this client has at least one item - used for people with no
// grant for the section, where any item they can load must have been shared.
// (An empty client gets a placeholder album 'alb-default' that isn't a real
// shared item, so it doesn't count.)
export function sectionsWithItems(c: Client): MainSection[] {
  const out: MainSection[] = []
  if (c.tour.shows.length > 0) out.push('tour')
  if (c.songs.albums.some(a => !(a.id === 'alb-default' && a.tracks.length === 0))) out.push('songs')
  if (c.content.posts.length > 0) out.push('content')
  if (c.projects.length > 0) out.push('projects')
  if (c.finance.invoices.length > 0 || c.finance.expenses.length > 0) out.push('finance')
  if (c.legal.contracts.length > 0) out.push('legal')
  return out
}

// A copy of the client holding only what this person may see. Used for the
// manager's "preview as" (the database does the same job for a real login).
// Mirrors the database rules, including: details follow their show/release/
// invoice, and travel follows its shows (visible if any linked show is; travel
// tied to no show follows plain Tour access).
export function filterClientForViewer(c: Client, v: Viewer, exceptions: ItemException[]): Client {
  const sees = (type: ItemType, id: string) => effectiveSees(v, type, id, c.id, exceptions)

  const shows = c.tour.shows.filter(s => sees('show', s.id))
  const showIds = new Set(shows.map(s => s.id))
  const tourAccess = hasSectionGrant(v, 'tour', c.id)

  const albums = c.songs.albums.filter(a => sees('album', a.id))
  // Vendors have no per-item sharing: management side only, with Finance access.
  const vendorsVisible = v.role !== 'artist' && hasSectionGrant(v, 'finance', c.id)

  const filtered: Client = {
    ...c,
    tour: {
      ...c.tour,
      shows,
      advances: c.tour.advances.filter(a => showIds.has(a.showId)),
      guestList: c.tour.guestList.filter(g => showIds.has(g.showId)),
      travel: c.tour.travel.filter(t => {
        const links = t.showIds ?? []
        return links.length === 0 ? tourAccess : links.some(id => showIds.has(id))
      }),
    },
    songs: { ...c.songs, albums },
    content: { ...c.content, posts: c.content.posts.filter(p => sees('post', p.id)) },
    projects: c.projects.filter(p => sees('project', p.id)),
    legal: { ...c.legal, contracts: c.legal.contracts.filter(x => sees('contract', x.id)) },
    finance: {
      ...c.finance,
      invoices: c.finance.invoices.filter(i => sees('invoice', i.id)),
      expenses: c.finance.expenses.filter(e => sees('expense', e.id)),
      vendors: vendorsVisible ? c.finance.vendors : [],
    },
  }
  return { ...filtered, itemSections: sectionsWithItems(filtered) }
}
