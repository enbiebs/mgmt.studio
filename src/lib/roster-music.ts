// ──────────────────────────────────────────────────────────
//  "All artists" → Music: every release across the artists a person can open, on one timeline: when it comes out, how many of
//  its songs are finished, how far its release checklist is and the next step on it. The checklist is the same one the artist's
//  own Checklist page shows (a release nobody has ticked yet shows the full default list, all undone).
//  What this adds is who may see it: someone sent a single release sees that release and nothing worked out from it (a count
//  would look like the artist's whole catalogue), and an artist's own login gets nothing from this page (their Music is the
//  simplified artist portal, which has no Status or checklist pages to open). A practice (demo) artist is listed but never counted.
//  Pure logic (no store, no screen), covered by scripts/check-roster-music.ts.
// ──────────────────────────────────────────────────────────

import type { Client, MainSection, ReleaseType, UserRole } from '@/types'
import { daysUntil } from '@/lib/date-state'
import { defaultChecklist } from '@/lib/utils'

/** What this person may do with ONE artist's music. */
export interface MusicAccess {
  open: boolean   // may open the Music page at all (a single shared release is enough)
  full: boolean   // may open the WHOLE Music page: only then is anything counted from this artist's releases
}

export function musicAccessFor(
  has: (section: MainSection, clientId: string) => boolean,
  shareOnly: (section: MainSection, clientId: string) => boolean,
  clientId: string,
  role: UserRole,
): MusicAccess {
  if (role === 'artist') return { open: false, full: false }
  const open = has('songs', clientId)
  return { open, full: open && !shareOnly('songs', clientId) }
}

/** ahead = comes out today or later; out = already released; undated = no release date yet. */
export type ReleaseWhen = 'ahead' | 'undated' | 'out'

export interface ReleaseRow {
  clientId: string; clientName: string; clientColor: string
  demo: boolean                          // a practice artist: listed, but never counted
  full: boolean                          // the artist's whole Music page is open to this person
  albumId: string; title: string; type: ReleaseType
  date?: string
  days: number | null                    // days until it comes out (negative once it has), null with no date
  when: ReleaseWhen
  songsDone: number; songsTotal: number
  stepsDone: number; stepsTotal: number
  nextStep: string | null                // the first release-checklist step not done yet; null when everything is done or it is already out
}

export interface RosterMusicInput { client: Client; access: MusicAccess }

const WHEN_RANK: Record<ReleaseWhen, number> = { ahead: 0, undated: 1, out: 2 }

/** Coming up first (soonest first), then the ones with no date, then what is out (most recent first). */
function order(a: ReleaseRow, b: ReleaseRow): number {
  const byDate = a.when === 'out' ? (b.date ?? '').localeCompare(a.date ?? '') : (a.date ?? '').localeCompare(b.date ?? '')
  return WHEN_RANK[a.when] - WHEN_RANK[b.when] || byDate || a.clientName.localeCompare(b.clientName) || a.title.localeCompare(b.title) || a.albumId.localeCompare(b.albumId)
}

export function buildRosterMusic(inputs: readonly RosterMusicInput[], today: string): ReleaseRow[] {
  const rows: ReleaseRow[] = []
  for (const { client, access } of inputs) {
    if (!access.open) continue
    for (const a of client.songs?.albums ?? []) {
      if (a.id === 'alb-default' && a.tracks.length === 0) continue   // the placeholder an artist with no releases gets (db.ts), not a real release
      const when: ReleaseWhen = !a.releaseDate ? 'undated' : a.releaseDate >= today ? 'ahead' : 'out'
      // A release nobody has ticked yet has no saved checklist: it shows the full list, all undone, like its Checklist page does.
      const steps = a.checklist && a.checklist.length ? a.checklist : defaultChecklist()
      rows.push({
        clientId: client.id, clientName: client.name, clientColor: client.color, demo: !!client.isDemo, full: access.full,
        albumId: a.id, title: a.title || 'Untitled', type: a.type ?? 'album',
        ...(a.releaseDate ? { date: a.releaseDate } : {}),
        days: a.releaseDate ? daysUntil(a.releaseDate, today) : null, when,
        songsDone: a.tracks.filter(t => t.stage === 'done').length, songsTotal: a.tracks.length,
        stepsDone: steps.filter(s => s.done).length, stepsTotal: steps.length,
        nextStep: when === 'out' ? null : (steps.find(s => !s.done)?.label ?? null),
      })
    }
  }
  return rows.sort(order)
}

export type MusicFilter = 'ahead' | 'undated' | 'out' | 'all'

/** One kind of release, for one artist or all. */
export function filterReleases(rows: readonly ReleaseRow[], opts: { filter: MusicFilter; clientId?: string }): ReleaseRow[] {
  return rows.filter(r => (!opts.clientId || r.clientId === opts.clientId) && (opts.filter === 'all' || r.when === opts.filter))
}

/** Where the page opens: on what is coming up when there is something, otherwise on everything. */
export function defaultMusicFilter(rows: readonly ReleaseRow[]): MusicFilter {
  return rows.some(r => r.when === 'ahead') ? 'ahead' : 'all'
}

export interface MusicStats {
  ahead: number        // releases still to come out
  soon: number         // of those, coming out within 30 days (today counts)
  unfinished: number   // songs not finished, across all of an artist's releases (the same figure the artist's Overview shows)
  undated: number      // releases with no date yet
}

/** "Coming up soon" window, in days. */
export const SOON_DAYS = 30

/** The numbers at the top. Counted only from artists whose whole Music page is open to this person, and never from a practice artist. */
export function musicStats(rows: readonly ReleaseRow[]): MusicStats {
  const counted = rows.filter(r => r.full && !r.demo)
  return {
    ahead: counted.filter(r => r.when === 'ahead').length,
    soon: counted.filter(r => r.when === 'ahead' && r.days !== null && r.days <= SOON_DAYS).length,
    unfinished: counted.reduce((n, r) => n + (r.songsTotal - r.songsDone), 0),
    undated: counted.filter(r => r.when === 'undated').length,
  }
}

/** What the page can offer this person across all their artists: the list, and the numbers on top. */
export function musicCapabilities(access: readonly MusicAccess[]): { list: boolean; counts: boolean } {
  return { list: access.some(a => a.open), counts: access.some(a => a.full) }
}
