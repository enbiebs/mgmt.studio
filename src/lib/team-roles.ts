// ──────────────────────────────────────────────────────────
//  Titles on the Team page. Every person has a free-text title ("Tour Manager", "Stylist", anything typed by hand);
//  these are only SUGGESTIONS. The six key roles are the ones an artist's team should always have covered: the Team
//  page shows who holds each, and offers a one-click add for any nobody holds. Pure logic (no screen), so it can be tested.
// ──────────────────────────────────────────────────────────
import type { Person } from '@/types'

export const KEY_ROLES = ['Agent', 'Business manager', 'Lawyer', 'Label', 'Publicist', 'Tour manager'] as const

export const TITLE_SUGGESTIONS: string[] = [
  ...KEY_ROLES, 'Publisher', 'Production manager', 'Booking assistant', 'Artwork / design', 'Website developer',
  'Stylist', 'Photographer', 'Videographer', 'Assistant', 'Accountant', 'Merch manager', 'Social media manager',
  'Front of house', 'Monitor engineer', 'Lighting', 'Backline',
]

export const MAX_TITLE_CHARS = 80

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Does a free-text title cover this role? Whole words only: "Tour Manager / Stylist" covers "Tour manager"; "Label manager" covers "Label". */
export function titleCovers(title: string | undefined, role: string): boolean {
  if (!title) return false
  return ` ${norm(title)} `.includes(` ${norm(role)} `)
}

/**
 * Who holds a role: people whose title covers it, or whose extra titles do (the Team page passes each person's crew
 * role, so a Tour Manager added on the Crew page counts without typing it twice).
 */
export function holdersOf(people: Person[], role: string, extraTitles: (p: Person) => string[] = () => []): Person[] {
  return people.filter(p => titleCovers(p.title, role) || extraTitles(p).some(t => titleCovers(t, role)))
}

/** The key roles nobody holds yet, in the usual order. */
export function missingKeyRoles(people: Person[], extraTitles?: (p: Person) => string[]): string[] {
  return KEY_ROLES.filter(r => holdersOf(people, r, extraTitles).length === 0)
}

/** What the title box saves: trimmed, collapsed spaces, cut to the limit; empty means "no title". */
export function cleanTitle(raw: string | undefined): string | undefined {
  const t = (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_CHARS)
  return t || undefined
}
