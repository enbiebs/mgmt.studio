// ──────────────────────────────────────────────────────────
//  A release's timeline: the release date decides when each step of the checklist is due. Pure logic (no store, no screen), covered by
//  scripts/check-release-plan.ts.
//
//  The lead times are the usual ones for an independent release, not a rule: delivery to the platforms is wanted about four weeks ahead (so
//  the release can be pitched and is not rejected for being late), rights are cleared well before that, and the marketing steps follow
//  the audio. Nothing is stored: change the release date and every due date moves with it.
// ──────────────────────────────────────────────────────────

import type { Album, ChecklistItem, ChecklistItemKey } from '@/types'
import { daysUntil } from '@/lib/date-state'
import { addDays, defaultChecklist } from '@/lib/utils'

/** How many days before the release date each step is due. */
export const LEAD_DAYS: Record<ChecklistItemKey, number> = {
  splits: 56, samples: 56, labelcopy: 42,
  masters: 35, stems: 35, extended: 28, archived: 7, metadata: 28,
  isrc: 35, upc: 35, artwork: 35, releasedate: 35, copyright: 0,
  officialsound: 14, cml: 14, dsppitch: 28, lyrics: 21, presave: 21,
}

/** A checklist counts as "in use" once this many steps are ticked or have a note. */
export const ENGAGED_STEPS = 3

/** Steps whose lateness matters most: the final master and the delivery to the platforms, and the pitch to them. */
export const CRITICAL_STEPS: ChecklistItemKey[] = ['masters', 'metadata', 'dsppitch']

/** The day a step is due, for a release on `releaseDate`. */
export const dueDateFor = (key: ChecklistItemKey, releaseDate: string): string => addDays(releaseDate.slice(0, 10), -LEAD_DAYS[key])

export interface PlannedItem { item: ChecklistItem; due: string | null; daysLeft: number | null; late: boolean }

/** Each step with its due date (none until the release has a date), how far away it is, and whether it is late. A finished step is never late. */
export function planItems(items: ChecklistItem[], releaseDate: string | undefined, today: string): PlannedItem[] {
  return items.map(item => {
    if (!releaseDate) return { item, due: null, daysLeft: null, late: false }
    const due = dueDateFor(item.key, releaseDate)
    const daysLeft = daysUntil(due, today)
    return { item, due, daysLeft, late: !item.done && daysLeft < 0 }
  })
}

/** The steps of a release (the standard ones when none have been saved yet). */
export const checklistOf = (album: Pick<Album, 'checklist'>): ChecklistItem[] => (album.checklist && album.checklist.length > 0 ? album.checklist : defaultChecklist())

export interface ReleaseStatus {
  daysToRelease: number
  late: PlannedItem[]            // not done and past their due date, the most overdue first
  engaged: boolean               // someone is really using the checklist (at least three steps ticked or noted), not just once
}

/**
 * Where an upcoming release stands, or null when there is nothing to say: no release date, a release that has already happened, an empty
 * placeholder release, or one too far away to matter yet (more than `horizonDays` out).
 */
export function releaseStatus(album: Album, today: string, horizonDays = 90): ReleaseStatus | null {
  if (!album.releaseDate || (album.id === 'alb-default' && album.tracks.length === 0)) return null
  const daysToRelease = daysUntil(album.releaseDate, today)
  if (daysToRelease < 0 || daysToRelease > horizonDays) return null
  const items = checklistOf(album)
  const late = planItems(items, album.releaseDate, today).filter(p => p.late).sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0))
  return { daysToRelease, late, engaged: items.filter(i => i.done || !!i.note?.trim()).length >= ENGAGED_STEPS }
}
