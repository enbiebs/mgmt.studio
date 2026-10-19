// ──────────────────────────────────────────────────────────
//  One artist's people never repeat an email. A person is recognised by email (capital letters and stray spaces ignored);
//  people without an email are never "the same". The same email on a different artist is fine: a tour manager can work
//  with several artists. The database enforces the same rule (the unique index on people), so these helpers decide, in
//  plain words and before anything is saved, what to do when an email is already taken:
//    adding someone   -> use the person who is already there instead of making a second copy
//    editing an email -> keep every other change, leave the email as it was, and say why
//  Pure logic (no network, no store). Checked by scripts/check-people-dedupe.ts.
// ──────────────────────────────────────────────────────────

import type { Person } from '@/types'

export type PersonPatch = Partial<Omit<Person, 'id'>>

/** The email as the rule sees it: trimmed and lower case. Empty when there is no email. */
export function emailKey(email?: string | null): string {
  return (email ?? '').trim().toLowerCase()
}

/** Someone in this list who already has this email (ignoring `exceptId`, the person being edited). */
export function findSameEmail(people: Person[], email?: string | null, exceptId?: string): Person | undefined {
  const key = emailKey(email)
  if (!key) return undefined
  return people.find(p => p.id !== exceptId && emailKey(p.email) === key)
}

/** Groups of two or more people who share an email, in list order. Empty for a clean list. */
export function duplicateGroups(people: Person[]): Person[][] {
  const byEmail = new Map<string, Person[]>()
  for (const p of people) {
    const key = emailKey(p.email)
    if (!key) continue
    byEmail.set(key, [...(byEmail.get(key) ?? []), p])
  }
  return [...byEmail.values()].filter(g => g.length > 1)
}

export function emailTakenMessage(holder: string, email: string): string {
  return `${holder} already has the email ${email.trim()} on this artist's team.`
}

export interface AddResult {
  people: Person[]
  id: string
  /** Set when the email already belonged to someone, so that person was used and nothing new was made. */
  reused?: Person
}

/** Adds a person, unless this artist already has someone with that email: then that person is used. */
export function addOrReuse(people: Person[], patch: PersonPatch & { name: string }, makeId: () => string): AddResult {
  const same = findSameEmail(people, patch.email)
  if (same) return { people, id: same.id, reused: same }
  const id = makeId()
  return { people: [...people, { ...patch, id }], id }
}

export interface EditResult {
  people: Person[]
  /** The person after the edit (undefined when nobody has that id). */
  person?: Person
  /** Set when the new email already belongs to someone else: every other change was kept, the email was not changed. */
  blockedBy?: Person
}

/** Changes a person. An email that someone else on this artist already has is left alone; everything else in the patch is kept. */
export function applyPersonPatch(people: Person[], personId: string, patch: PersonPatch): EditResult {
  const current = people.find(p => p.id === personId)
  if (!current) return { people }
  // Only an email that is really changing can clash. Saving a card with the same email it already has is never refused, even
  // when two people already share it (old data), so the person can still fix their other details.
  const changing = 'email' in patch && emailKey(patch.email) !== emailKey(current.email)
  const blockedBy = changing ? findSameEmail(people, patch.email, personId) : undefined
  const safe: PersonPatch = { ...patch }
  if (blockedBy) delete safe.email
  const person: Person = { ...current, ...safe }
  return { people: people.map(p => p.id === personId ? person : p), person, blockedBy }
}

/** What to tell someone when the database refused to save a person. `code` is the database's error code. */
export function saveFailureMessage(person: Pick<Person, 'name' | 'email'>, code?: string): string {
  if (code === '23505') {
    return `${person.name} could not be saved: another person on this artist already has the email ${(person.email ?? '').trim()}. Refresh to see the latest list.`
  }
  if (code === '42501') return `${person.name} could not be saved: you don't have permission to add or change people here.`
  return `${person.name} could not be saved. Please try again.`
}
