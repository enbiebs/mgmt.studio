// ──────────────────────────────────────────────────────────
//  The Company page: everyone in the company down the side, every artist across the top, and each person's role for each
//  artist in the cell. Built from the same pieces as an artist's Team page (the login list and that artist's access rows),
//  so a change made in one place is what the other shows. Pure logic (no screen, no database), so it can be tested.
// ──────────────────────────────────────────────────────────
import type { WorkspacePerson } from '@/types'
import { ADMIN_KEY, matchPreset, type GrantRow } from '@/lib/access-presets'
import type { SharingGrant } from '@/lib/sharing'

/** What one person can do for one artist: a role's key (or 'admin', 'custom', 'none') and the rows behind it. */
export interface CompanyCell { levelKey: string; grants: GrantRow[] }
export interface CompanyRow {
  person: WorkspacePerson
  cells: Record<string, CompanyCell>
  /** Has company-wide access (every artist) on top of any per-artist roles, set by a manager. */
  companyWide: boolean
  /** How many artists they can open through a per-artist role. */
  artistCount: number
}
export interface CompanyGrid {
  /** Managers: they run the company and can open every artist. */
  admins: WorkspacePerson[]
  rows: CompanyRow[]
}

const toGrantRow = (g: SharingGrant): GrantRow => ({ id: g.id, section: g.section, client_id: g.clientId, can_edit: g.canEdit })

/** The grid: one row per login that is not a manager or an artist, one cell per artist. */
export function buildCompanyGrid(people: WorkspacePerson[], grantsByClient: Record<string, SharingGrant[]>, clientIds: string[]): CompanyGrid {
  const admins = people.filter(p => p.role === 'manager').sort((a, b) => a.label.localeCompare(b.label))
  const rows = people
    .filter(p => p.role !== 'manager' && p.role !== 'artist')
    .map(person => {
      const cells: Record<string, CompanyCell> = {}
      let artistCount = 0
      for (const id of clientIds) {
        const grants = (grantsByClient[id] ?? []).filter(g => g.memberId === person.memberId && g.clientId === id).map(toGrantRow)
        cells[id] = { levelKey: grants.length ? matchPreset(grants, id) : 'none', grants }
        if (grants.length) artistCount++
      }
      return { person, cells, companyWide: person.allClients, artistCount }
    })
    .sort((a, b) => a.person.label.localeCompare(b.person.label))
  return { admins, rows }
}

/** A saved list of people ("Booking team"): only who is in it. What each person can open stays their own. */
export interface CompanyGroup { id: string; name: string; memberIds: string[] }

/** The groups a person is in (names, A to Z), for the little tags on their row. */
export function groupNamesOf(groups: CompanyGroup[], memberId: string): string[] {
  return groups.filter(g => g.memberIds.includes(memberId)).map(g => g.name).sort((a, b) => a.localeCompare(b))
}

/**
 * Giving a whole group a role on one artist: who would change, who already has it, and who is not in the grid any more
 * (an admin, or someone who left). Nothing is saved here; the screen saves each person's own access.
 */
export function planGroupApply(group: CompanyGroup, grid: CompanyGrid, clientId: string, key: string): { change: CompanyRow[]; same: CompanyRow[]; missing: number } {
  const change: CompanyRow[] = [], same: CompanyRow[] = []
  let missing = 0
  for (const id of group.memberIds) {
    const row = grid.rows.find(r => r.person.memberId === id)
    if (!row) { missing++; continue }
    const current = row.cells[clientId]?.levelKey ?? 'none'
    if (current === key) same.push(row)
    else change.push(row)
  }
  return { change, same, missing }
}

/** True when someone has a login but cannot open anything yet (nudge: they would sign in to an empty app). */
export const hasNothing = (row: CompanyRow) => row.artistCount === 0 && !row.companyWide

/** How a cell reads in its menu when it is not one of the ready-made roles. */
export const isPointPerson = (cell: CompanyCell) => cell.levelKey === ADMIN_KEY
