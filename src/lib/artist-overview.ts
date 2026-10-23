// ──────────────────────────────────────────────────────────
//  What the artist Overview page shows: the next shows, the next release, money owed, and the contracts that need a look.
//  A block is left out entirely when the person may not open that part for this artist, so the page can never hint at
//  numbers they could not see on the page itself. Every figure reuses the helper the artist's own page uses.
//  Pure logic (no store, no screen), covered by scripts/check-artist-overview.ts.
// ──────────────────────────────────────────────────────────

import type { Album, MainSection, ShowStatus } from '@/types'
import { defaultChecklist } from '@/lib/utils'
import { mayOpenFully } from '@/lib/section-access'
import { daysUntil, isUpcomingShow, splitShows } from '@/lib/date-state'
import { contractAlerts, expiryLine } from '@/lib/contract-status'
import { nextRelease, owedFigures, unfinishedSongs, type SummaryClient } from '@/lib/roster-summary'

/** What this person may see for this artist. `offers` is Deals & fees, which can be held without Tour. */
export interface OverviewAccess { tour: boolean; offers: boolean; music: boolean; finance: boolean; legal: boolean }

/** What the Overview may show: only the parts this person may open in full, never a total worked out from a single shared item. `offers` is Deals & fees, which can be held without Tour. */
export const overviewAccessFor = (
  has: (section: MainSection, clientId: string) => boolean,
  shareOnly: (section: MainSection, clientId: string) => boolean,
  clientId: string,
): OverviewAccess => {
  const may = mayOpenFully(has, shareOnly, clientId)
  return { tour: may('tour'), offers: may('deals'), music: may('songs'), finance: may('finance'), legal: may('legal') }
}

export interface OverviewShow { id: string; date: string; city: string; venue: string; status: ShowStatus; days: number }
export interface OverviewRelease { id: string; title: string; date: string; days: number; songsDone: number; songsTotal: number; stepsDone: number; stepsTotal: number }
export interface OverviewContract { id: string; title: string; line: string; tone: 'late' | 'todo' }

export interface OverviewData {
  tour?: { shows: OverviewShow[]; more: number; openOffers?: number }
  music?: { release: OverviewRelease | null; unfinished: number }
  finance?: { owed: string; open: number; overdue: number }
  legal?: { total: number; needing: number; items: OverviewContract[] }
}

/** The artist's own pieces the Overview reads (the same shape the roster lines use, plus the offers). */
export type OverviewClient = SummaryClient & { agentData?: { offers: readonly { status: string }[] } }

const SHOWS_SHOWN = 3
const CONTRACTS_SHOWN = 3

const releaseOf = (a: Album, today: string): OverviewRelease => {
  // A release nobody has ticked yet has no saved checklist: it shows the full list, all undone, like its Checklist page does.
  const steps = a.checklist && a.checklist.length ? a.checklist : defaultChecklist()
  return {
    id: a.id, title: a.title || 'Untitled', date: a.releaseDate!, days: daysUntil(a.releaseDate!, today),
    songsDone: a.tracks.filter(t => t.stage === 'done').length, songsTotal: a.tracks.length,
    stepsDone: steps.filter(s => s.done).length, stepsTotal: steps.length,
  }
}

export function buildOverview(c: OverviewClient, today: string, can: OverviewAccess): OverviewData {
  const out: OverviewData = {}

  if (can.tour || can.offers) {
    const ahead = splitShows(c.tour.shows, today).upcoming.filter(s => isUpcomingShow(s, today))
    out.tour = { shows: [], more: 0 }
    if (can.tour) {
      out.tour.shows = ahead.slice(0, SHOWS_SHOWN).map(s => ({ id: s.id, date: s.date, city: s.city, venue: s.venue, status: s.status, days: daysUntil(s.date, today) }))
      out.tour.more = Math.max(0, ahead.length - SHOWS_SHOWN)
    }
    if (can.offers) out.tour.openOffers = (c.agentData?.offers ?? []).filter(o => o.status === 'inquiry' || o.status === 'hold').length
  }

  if (can.music) {
    const next = nextRelease(c.songs.albums, today)
    out.music = { release: next ? releaseOf(next, today) : null, unfinished: unfinishedSongs(c.songs.albums) }
  }

  if (can.finance) out.finance = owedFigures(c, today)

  if (can.legal) {
    const alerts = contractAlerts(c.legal.contracts, today)
    // Worst first: ended, then ending soon, then flagged for review; a contract that is both flagged and ending shows once.
    const ordered = [...alerts.expired, ...alerts.expiring, ...alerts.flagged].filter((x, i, all) => all.findIndex(y => y.id === x.id) === i)
    out.legal = {
      total: c.legal.contracts.length,
      needing: alerts.count,
      items: ordered.slice(0, CONTRACTS_SHOWN).map(x => ({
        id: x.id, title: x.title, line: expiryLine(x, today) ?? 'Flagged for review',
        tone: alerts.expired.some(e => e.id === x.id) ? 'late' : 'todo',
      })),
    }
  }

  return out
}
