// ──────────────────────────────────────────────────────────
//  Sharing: the list of who can open ONE artist, built from the team list and that artist's access rows.
//  Pure logic (no screen, no database), so it can be tested.
//
//  Three kinds of row:
//    manager   sees every artist; nobody but another manager changes that
//    company   has a company-wide grant (every artist), set by a manager; shown so the list never lies about who can open this
//    person    has rows for THIS artist: a Point Person or a role, and the one kind a Point Person can change
// ──────────────────────────────────────────────────────────
import type { WorkspacePerson } from '@/types'
import { ADMIN_KEY, matchPreset, levelsOf, presetByKey, summarize, type GrantRow } from '@/lib/access-presets'

export interface SharingGrant { id: string; memberId: string; section: string; clientId: string | null; canEdit: boolean }

export type SharingRow =
  | { kind: 'manager'; person: WorkspacePerson }
  | { kind: 'company'; person: WorkspacePerson }
  | { kind: 'person'; person: WorkspacePerson; grants: GrantRow[]; levelKey: string; alsoCompanyWide: boolean }

const toGrantRow = (g: SharingGrant): GrantRow => ({ id: g.id, section: g.section, client_id: g.clientId, can_edit: g.canEdit })

const RANK = (r: SharingRow) => r.kind === 'person' ? (r.levelKey === ADMIN_KEY ? 0 : 1) : r.kind === 'company' ? 2 : 3

/** Everyone who can open this artist, Point People first, then everyone else, then company-wide people and managers. */
export function buildSharingRows(people: WorkspacePerson[], grants: SharingGrant[], clientId: string): SharingRow[] {
  const rows: SharingRow[] = []
  for (const person of people) {
    if (person.role === 'artist') continue
    if (person.role === 'manager') { rows.push({ kind: 'manager', person }); continue }
    const mine = grants.filter(g => g.memberId === person.memberId && g.clientId === clientId).map(toGrantRow)
    if (mine.length) rows.push({ kind: 'person', person, grants: mine, levelKey: matchPreset(mine, clientId), alsoCompanyWide: person.allClients })
    else if (person.allClients) rows.push({ kind: 'company', person })
  }
  return rows.sort((a, b) => RANK(a) - RANK(b) || a.person.label.localeCompare(b.person.label))
}

/** Teammates who could be added to this artist: not a manager, not already in the list. */
export function addablePeople(people: WorkspacePerson[], rows: SharingRow[]): WorkspacePerson[] {
  const listed = new Set(rows.map(r => r.person.memberId))
  return people
    .filter(p => p.role !== 'manager' && p.role !== 'artist' && !listed.has(p.memberId))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/** What to call a person's current level: a role's name, "Point Person", "Custom pages" or "No pages yet". */
export function levelLabel(levelKey: string): string {
  if (levelKey === 'custom') return 'Custom pages'
  if (levelKey === 'none') return 'No pages yet'
  return presetByKey(levelKey)?.label ?? 'Custom pages'
}

/** One plain sentence about what the person can do for this artist. */
export function describeRow(row: Extract<SharingRow, { kind: 'person' }>, clientId: string): string {
  if (row.levelKey === ADMIN_KEY) return 'Everything for this artist, and can manage who else has access.'
  return summarize(levelsOf(row.grants, clientId))
}

/** How many Point People the list has (for the "no Point Person yet" nudge). */
export const pointPeopleCount = (rows: SharingRow[]) => rows.filter(r => r.kind === 'person' && r.levelKey === ADMIN_KEY).length

export const POINT_PERSON_WARNING = 'A Point Person can see and change everything for this artist, including money, contracts and private details, and can decide who else has access.'

/** What to tell the person before a level change goes through (null = nothing to warn about). */
export function levelChangeWarning(from: string, to: string, ctx: { isMe: boolean; isManager: boolean }): string | null {
  if (to === from || to === 'custom') return null
  if (to === ADMIN_KEY) return POINT_PERSON_WARNING
  if (from === ADMIN_KEY) {
    return ctx.isMe && !ctx.isManager
      ? 'You are a Point Person for this artist. If you step down you can no longer manage who has access.'
      : 'They will no longer be able to manage who has access to this artist.'
  }
  if (from === 'custom') return 'This replaces the pages you picked for them.'
  return null
}

/** What to tell the person before someone is taken off an artist. Honest about company-wide access, which stays. */
export function removalWarning(o: { label: string; artist: string; isMe: boolean; isManager: boolean; alsoCompanyWide: boolean }): string {
  const self = o.isMe && !o.isManager
  if (o.alsoCompanyWide) {
    return self
      ? 'You will lose the access to this artist you were given here, including managing sharing. You keep the company-wide access a manager gave you.'
      : `${o.label} loses the access set up for ${o.artist}. They can still open every artist through the company-wide access a manager gave them.`
  }
  return self
    ? 'You will lose all access to this artist, including the ability to manage sharing.'
    : `${o.label} will no longer be able to open ${o.artist}.`
}

export type PersonStatus = 'no-login' | 'waiting' | 'has-access' | 'not-shared'

/** Where a person from the Team page stands for this artist: no login yet, invited and waiting, has access, or has a login that is not shared with this artist. */
export function personStatus(personId: string, logins: WorkspacePerson[], clientId: string): PersonStatus {
  const login = logins.find(l => l.personId === personId)
  if (!login) return 'no-login'
  if (login.invited) return 'waiting'
  return login.role === 'manager' || login.allClients || login.clientIds.includes(clientId) ? 'has-access' : 'not-shared'
}

export const STATUS_LABEL: Record<PersonStatus, string> = {
  'no-login': 'No login yet',
  waiting: 'Invited, waiting to accept',
  'has-access': 'Has access',
  'not-shared': 'Has a login, not shared with this artist',
}
