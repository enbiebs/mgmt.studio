// ──────────────────────────────────────────────────────────
//  Owners on offers and shows: one named teammate who is handling it. Pure logic (no store, no screen), covered by
//  scripts/check-item-owner.ts.
//
//  An owner is a teammate's LOGIN (a WorkspacePerson.userId), the same people a to-do can be given to. Only someone who can open
//  the artist can own an artist's offer or show (the database enforces the same rule). If an owner later loses access to the
//  artist, the item simply reads as having no owner: nobody silently owns something they can't open.
//  The artist's own login never sees owners, and an owner is never put on an offer sheet.
// ──────────────────────────────────────────────────────────

import type { AppData, Show, TourOffer, WorkspacePerson } from '@/types'

/** Anything that can have an owner: an offer or a show. */
export interface Ownable { ownerId?: string }

export type OwnerInfo =
  | { state: 'none' }                                   // nobody set
  | { state: 'lost' }                                   // someone was set, but they can no longer open this artist (or are gone): reads as nobody
  | { state: 'set'; person: WorkspacePerson }

/** May this person own things for this artist? A manager or anyone granted all artists or this one; never an artist login. */
export function canOwn(person: WorkspacePerson, clientId: string): boolean {
  return person.role !== 'artist' && (person.allClients || person.clientIds.includes(clientId))
}

/** Who an item's owner is right now. */
export function resolveOwner(ownerId: string | undefined, people: readonly WorkspacePerson[], clientId: string): OwnerInfo {
  if (!ownerId) return { state: 'none' }
  const person = people.find(p => p.userId === ownerId)
  return person && canOwn(person, clientId) ? { state: 'set', person } : { state: 'lost' }
}

/** The teammates an item can be given to, you first, then by name. */
export function ownerChoices(people: readonly WorkspacePerson[], clientId: string, me: string | null): WorkspacePerson[] {
  return people
    .filter(p => canOwn(p, clientId))
    .sort((a, b) => Number(b.userId === me) - Number(a.userId === me) || a.label.localeCompare(b.label))
}

/** A short name for a chip: "Jen Park" stays as written, a login known only by email shows what is before the @. */
export function ownerName(person: WorkspacePerson): string {
  const l = person.label.trim()
  return l.includes('@') ? l.split('@')[0] : l
}

/** "You" when it is you, otherwise the short name. */
export function ownerWords(person: WorkspacePerson, me: string | null): string {
  return me && person.userId === me ? 'You' : ownerName(person)
}

/** Does this item belong to me? Only an owner who can still open the artist counts. */
export function isOwnedBy(item: Ownable, me: string | null, people: readonly WorkspacePerson[], clientId: string): boolean {
  if (!me) return false
  const o = resolveOwner(item.ownerId, people, clientId)
  return o.state === 'set' && o.person.userId === me
}

/** The "Just mine" view: only what I own. */
export function justMine<T extends Ownable>(items: readonly T[], me: string | null, people: readonly WorkspacePerson[], clientId: string): T[] {
  return items.filter(i => isOwnedBy(i, me, people, clientId))
}

/** An offer worth asking for an owner: still being negotiated or confirmed, not settled or cancelled. */
export function offerNeedsOwner(o: Pick<TourOffer, 'status'>): boolean {
  return o.status === 'inquiry' || o.status === 'hold' || o.status === 'confirmed'
}

/** A show worth asking for an owner: still to come (or today), not cancelled and not kept only as history. */
export function showNeedsOwner(s: Pick<Show, 'status' | 'date' | 'historyOnly'>, today: string): boolean {
  return s.status !== 'cancelled' && !s.historyOnly && s.date >= today
}

/** The owner as a piece to spread into a new record (a show made from an offer, an alert about one): empty when there is none, so no `ownerId: undefined` sneaks in. */
export function ownerField(item: Ownable): { ownerId?: string } {
  return item.ownerId ? { ownerId: item.ownerId } : {}
}

/** The artist's own login never sees who owns what. */
export function withoutOwner<T extends Ownable>(item: T): T {
  if (item.ownerId === undefined) return item
  const copy = { ...item }
  delete copy.ownerId
  return copy
}

/** What an artist's own login is given to hold: every show and offer without its owner. (The database still sends the owner's id with the row; the app drops it on arrival, so it is never kept or shown.) */
export function withoutOwners(data: AppData): AppData {
  return {
    ...data,
    clients: data.clients.map(c => ({
      ...c,
      tour: { ...c.tour, shows: c.tour.shows.map(withoutOwner) },
      agentData: c.agentData ? { ...c.agentData, offers: c.agentData.offers.map(withoutOwner) } : c.agentData,
    })),
  }
}

/**
 * What a form sends about the owner. Untouched = nothing at all, so saving a typo fix never changes who owns it (an owner who lost
 * access reads as "Nobody yet" on the form, and saving without touching the box must not erase them). Touched = the person chosen,
 * or nobody ('').
 */
export function ownerPatch(choice: string | null): { ownerId?: string } | Record<string, never> {
  if (choice === null) return {}
  return { ownerId: choice || undefined }
}

/**
 * The owner to hand on to something made from an offer (its show): the offer's owner, unless we know they can no longer open the
 * artist (the database would refuse them, and the person would be told "not saved" for something they did not choose). With no
 * teammates loaded we cannot tell, so the owner is handed on.
 */
export function ownerToCarry(item: Ownable, people: readonly WorkspacePerson[], clientId: string): { ownerId?: string } {
  if (!item.ownerId) return {}
  if (people.length > 0 && resolveOwner(item.ownerId, people, clientId).state !== 'set') return {}
  return { ownerId: item.ownerId }
}
