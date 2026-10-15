// ──────────────────────────────────────────────────────────
//  What an invitation carries: the role, level and pages chosen for each artist. Pure logic (no screen, no database),
//  shared by the invite form, the invite route and the tests. The server re-checks every word of it: nothing here is
//  trusted just because the browser built it (and the database checks it a third time when the login is created).
// ──────────────────────────────────────────────────────────
import { ADMIN_KEY, SECTIONS, type SectionKey } from '@/lib/access-presets'

/** One artist's access in an invite: a Point Person for it, or a view / edit choice per page. */
export interface InviteArtistAccess {
  clientId: string
  pointPerson?: boolean
  levels?: Partial<Record<SectionKey, 'view' | 'edit'>>
}

/** One row the database will create. Always for one artist; a Point Person is a single 'admin' row. */
export interface InviteGrantRow { section: SectionKey | typeof ADMIN_KEY; client_id: string; can_edit: boolean }

/** The ordinary pages an invite can grant. Never the vault, and a Point Person is the `pointPerson` flag, not a page. */
export const INVITE_SECTION_KEYS: string[] = SECTIONS.map(s => s.key)
export const MAX_INVITE_ARTISTS = 25

export type LoginType = 'team' | 'agent' | 'lawyer'

/** Agents and lawyers keep their own login type; every other role is a plain teammate login. */
export function loginTypeFor(roleKey: string): LoginType {
  return roleKey === 'agent' || roleKey === 'lawyer' ? roleKey : 'team'
}

/** The rows an invite becomes. Repeated artists count once; anything that is not view or edit is dropped. */
export function inviteGrantRows(access: InviteArtistAccess[]): InviteGrantRow[] {
  const out: InviteGrantRow[] = []
  const seen = new Set<string>()
  for (const a of access) {
    if (seen.has(a.clientId)) continue
    seen.add(a.clientId)
    if (a.pointPerson) { out.push({ section: ADMIN_KEY, client_id: a.clientId, can_edit: true }); continue }
    for (const s of SECTIONS) {
      const level = a.levels?.[s.key]
      if (level === 'view' || level === 'edit') out.push({ section: s.key, client_id: a.clientId, can_edit: level === 'edit' })
    }
  }
  return out
}

/** True when the invite would give the person nothing at all (the form should not let that be sent). */
export const inviteIsEmpty = (access: InviteArtistAccess[]) => inviteGrantRows(access).length === 0
