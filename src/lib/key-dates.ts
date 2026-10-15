// ──────────────────────────────────────────────────────────
//  Key dates: the things a show needs by a certain day (the advance, the travel, the day sheet), worked
//  out from the show's date and what has already been done (see lib/show-progress.ts). Like the
//  automatic alerts they are never stored, so they can't go stale when a date moves. They are "up for
//  grabs": anyone with Tour access sees them and can take one, which turns it into a real to-do given to
//  that person (carrying a `autoKey`, so it never comes back as a second copy).
//  Pure logic (no store, no screen).
// ──────────────────────────────────────────────────────────

import type { Client, Task, TourSub } from '@/types'
import { progressForShow } from '@/lib/show-progress'
import { addDays } from '@/lib/utils'

export type KeyDateRule = 'advance' | 'travel' | 'daysheet'

export interface KeyDate {
  key: string                  // the autoKey a to-do made from it carries: "advance:<showId>"
  rule: KeyDateRule
  clientId: string
  clientName: string
  showId: string
  title: string
  detail?: string
  due: string                  // YYYY-MM-DD
  go: { section: 'tour'; sub: TourSub }
}

// How many days before the show each thing is due, and how far ahead it starts to appear.
const RULES: Record<KeyDateRule, { before: number; lead: number }> = {
  advance:  { before: 14, lead: 7 },    // due 14 days before the show; shows from 21 days out
  travel:   { before: 21, lead: 7 },    // due 21 days before; shows from 28 days out
  daysheet: { before: 2,  lead: 5 },    // due 2 days before; shows from a week out
}

export const keyDateKey = (rule: KeyDateRule, showId: string) => `${rule}:${showId}`

export function buildKeyDates(client: Client, today: string, existing: Task[] = client.tasks ?? []): KeyDate[] {
  // A demo artist's sample shows never raise real reminders.
  if (client.isDemo) return []
  const taken = new Set(existing.map(t => t.autoKey).filter(Boolean))
  const out: KeyDate[] = []
  for (const show of client.tour?.shows ?? []) {
    if (show.status !== 'confirmed' || show.historyOnly || show.date < today) continue
    const next = progressForShow(client, show, today).next
    const rule = next && next.go.section === 'tour' ? (['advance', 'travel', 'daysheet'] as const).find(r => r === next.go.sub) : undefined
    if (!next || !rule) continue
    const due = addDays(show.date, -RULES[rule].before)
    if (today < addDays(due, -RULES[rule].lead)) continue          // not time to think about it yet
    const key = keyDateKey(rule, show.id)
    if (taken.has(key)) continue                                    // someone already took it
    const place = [show.venue, show.city].filter(Boolean).join(' · ') || 'the show'
    out.push({
      key, rule, clientId: client.id, clientName: client.name, showId: show.id,
      title: `${next.label} · ${place}`, detail: next.detail, due, go: { section: 'tour', sub: rule },
    })
  }
  return out.sort((a, b) => a.due.localeCompare(b.due))
}
