// Agenda: the ordered talking points / steps around one to-do or project. Pure logic (no store, no screen).
import type { AgendaItemType, AgendaPoint, Client } from '@/types'

export const MAX_AGENDA_POINTS = 60      // the database refuses more
export const MAX_AGENDA_TEXT = 300

/** The points for one item, in order (position, then the order they were added). */
export function pointsFor(client: Pick<Client, 'agenda'> | undefined, itemType: AgendaItemType, itemId: string): AgendaPoint[] {
  return (client?.agenda ?? [])
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.itemType === itemType && p.itemId === itemId)
    .sort((a, b) => a.p.position - b.p.position || a.i - b.i)
    .map(({ p }) => p)
}

export const nextPosition = (points: AgendaPoint[]) => points.reduce((m, p) => Math.max(m, p.position), -1) + 1

/** "2 of 5 covered" for the little label next to the Agenda button. */
export function progressOf(points: AgendaPoint[]): { done: number; total: number } {
  return { done: points.filter(p => p.done).length, total: points.length }
}

/** What a typed line becomes: trimmed, capped, or nothing if it is empty. A leading bullet or number is dropped, so a pasted list works. */
export function cleanPoint(raw: string): string {
  return raw.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim().slice(0, MAX_AGENDA_TEXT)
}

/** Several lines pasted at once become several points (blank lines dropped, never more than there is room for). */
export function splitPoints(raw: string, room = MAX_AGENDA_POINTS): string[] {
  return raw.split(/\r?\n/).map(cleanPoint).filter(Boolean).slice(0, Math.max(0, room))
}
