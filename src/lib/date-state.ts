// ──────────────────────────────────────────────────────────
//  Where a dated thing stands relative to today, worked out in ONE place so every screen agrees:
//    upcoming  - comfortably ahead
//    soon      - inside the next week (including today)
//    overdue   - a deadline that has passed and is not finished
//    done      - finished, or an event that has already happened
//  Also how shows are ordered and which one a screen opens on. Never stored, always worked out from the date.
//  Pure logic (no store, no screen).
// ──────────────────────────────────────────────────────────

import type { ShowStatus } from '@/types'

export type DateState = 'upcoming' | 'soon' | 'overdue' | 'done'

/** "Due soon" means today or within this many days. */
export const SOON_DAYS = 7

const DAY = 86_400_000

/** Whole days from `today` to `date` (both "YYYY-MM-DD"). Negative once the date has passed. */
export function daysUntil(date: string, today: string): number {
  return Math.round((Date.parse(date.slice(0, 10) + 'T00:00:00Z') - Date.parse(today.slice(0, 10) + 'T00:00:00Z')) / DAY)
}

/** A deadline (an invoice or bill due date, a project due date, a contract expiry): overdue once it has passed unfinished. */
export function dueState(due: string, today: string, opts: { done?: boolean; soonDays?: number } = {}): DateState {
  if (opts.done) return 'done'
  const d = daysUntil(due, today)
  if (d < 0) return 'overdue'
  return d <= (opts.soonDays ?? SOON_DAYS) ? 'soon' : 'upcoming'
}

/** An event (a show, a release, a post): it is not "overdue" once played, it is simply done. */
export function eventState(date: string, today: string, opts: { soonDays?: number } = {}): DateState {
  const d = daysUntil(date, today)
  if (d < 0) return 'done'
  return d <= (opts.soonDays ?? SOON_DAYS) ? 'soon' : 'upcoming'
}

/** The plain words every screen uses for a state, so "overdue" is never worded two ways. */
export const DATE_STATE_LABEL: Record<DateState, string> = { upcoming: 'Upcoming', soon: 'Due soon', overdue: 'Overdue', done: 'Done' }

// ── Shows ───────────────────────────────────────────────────
export interface DatedShow { id: string; date: string; status: ShowStatus; historyOnly?: boolean; time?: string; venue?: string }

const byDateAsc = (a: DatedShow, b: DatedShow) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '') || (a.venue ?? '').localeCompare(b.venue ?? '')

/**
 * A show that is still to come and still going to happen. A cancelled show is never "upcoming", and a show kept only as history
 * never is either, so every count on every screen means the same thing.
 */
export function isUpcomingShow(s: DatedShow, today: string): boolean {
  return s.date >= today && s.status !== 'cancelled' && !s.historyOnly
}

/** Shows that are still ahead, soonest first, and shows already played, most recent first. Cancelled shows keep their place in the list. */
export function splitShows<T extends DatedShow>(shows: T[], today: string): { upcoming: T[]; past: T[] } {
  const ahead = shows.filter(s => s.date >= today).sort(byDateAsc)
  const behind = shows.filter(s => s.date < today).sort((a, b) => byDateAsc(b, a))
  return { upcoming: ahead, past: behind }
}

/** One list for a picker: shows still ahead (soonest first), then shows already played (most recent first). */
export function orderShows<T extends DatedShow>(shows: T[], today: string): T[] {
  const { upcoming, past } = splitShows(shows, today)
  return [...upcoming, ...past]
}

/** The next show that is going to happen, or undefined when there is none. */
export function nextShow<T extends DatedShow>(shows: T[], today: string): T | undefined {
  return shows.filter(s => isUpcomingShow(s, today)).sort(byDateAsc)[0]
}

/**
 * The show a per-show screen (Advance, Day Sheet, Travel, Guests) opens on when none was picked: the next one that is going to
 * happen, else the one played most recently, else nothing. It is never "the first in the list", which was usually a show from months ago.
 */
export function defaultShow<T extends DatedShow>(shows: T[], today: string): T | undefined {
  const next = nextShow(shows, today)
  if (next) return next
  const played = shows.filter(s => s.date < today).sort((a, b) => byDateAsc(b, a))
  return played.find(s => s.status !== 'cancelled') ?? played[0] ?? shows.slice().sort(byDateAsc)[0]
}

/**
 * The four numbers at the top of an artist's Tour page. The first three are about what is still ahead and going to happen (a
 * cancelled show is never counted); "past" is every show whose date has gone by, played or not, the same group the list calls Past.
 * A show kept only as history is left out of all four.
 */
export function showCounts(shows: readonly DatedShow[], today: string): { comingUp: number; confirmed: number; onHold: number; past: number } {
  const live = shows.filter(s => !s.historyOnly)
  const ahead = live.filter(s => isUpcomingShow(s, today))
  return {
    comingUp: ahead.length,
    confirmed: ahead.filter(s => s.status === 'confirmed').length,
    onHold: ahead.filter(s => s.status === 'hold').length,
    past: live.filter(s => s.date < today).length,
  }
}
