// ──────────────────────────────────────────────────────────
//  One login, several companies ("umbrellas"). A person can be an owner in one company and a freelancer in another, so
//  everything that depends on WHICH company (their role, their pages, the team list, the company name) is kept per company
//  and the app switches to an artist's company when that artist is opened. The database already decides every real
//  permission per company; this only decides what the screens show. Pure logic (no screen, no database), so it can be tested.
// ──────────────────────────────────────────────────────────
import type { AccessGrant } from '@/lib/db'
import type { LegalTemplate, UserRole, WorkspacePerson } from '@/types'

/** One row of "I belong to this company": the company, my role in it, and (for an artist login) the one artist it is tied to. */
export interface Membership { memberId: string; workspaceId: string; role: UserRole; personId: string | null; clientId: string | null }

/** Everything the app needs about ONE company for the person using it. */
export interface CompanyContext {
  workspaceId: string
  companyName: string
  ownerUserId: string | null
  role: UserRole
  memberId: string
  authClientId: string | null
  grants: AccessGrant[]
  workspacePeople: WorkspacePerson[]
  legalTemplates: LegalTemplate[]
}

/** The fields of the app's state that are set from a company context (so switching company is one assignment). */
export function contextFields(c: CompanyContext) {
  return {
    workspaceId: c.workspaceId, companyName: c.companyName, companyOwnerId: c.ownerUserId,
    role: c.role, authRole: c.role, myMemberId: c.memberId, authClientId: c.authClientId,
    grants: c.grants, workspacePeople: c.workspacePeople, legalTemplates: c.legalTemplates,
  }
}

/** Which company the app opens on: one they own, then one they manage, then any that is not an artist login, then the first. */
export function pickHomeWorkspace(contexts: CompanyContext[], userId: string | null): string | null {
  const best = (test: (c: CompanyContext) => boolean) => contexts.find(test)?.workspaceId
  return best(c => !!userId && c.ownerUserId === userId)
    ?? best(c => c.role === 'manager')
    ?? best(c => c.role !== 'artist')
    ?? contexts[0]?.workspaceId
    ?? null
}

/** The artists in one company this person can open: every one for a manager, their own for an artist login, otherwise their pages and shared items. */
export function openableClientIds(ctx: Pick<CompanyContext, 'role' | 'authClientId' | 'grants'>, companyClientIds: string[], sharedClientIds: string[] = []): string[] {
  if (ctx.role === 'manager') return companyClientIds
  if (ctx.role === 'artist') return ctx.authClientId ? [ctx.authClientId] : []
  if (ctx.grants.some(g => g.clientId === null)) return companyClientIds           // a company-wide page opens every artist
  const ids = new Set<string>()
  for (const g of ctx.grants) if (g.clientId) ids.add(g.clientId)
  for (const id of sharedClientIds) ids.add(id)
  return companyClientIds.filter(id => ids.has(id))
}

/** The artists that belong to one company. An artist with no recorded company (a brand-new one) counts as the open company's. */
export function clientsOfCompany<C extends { id: string }>(clients: C[], clientWorkspace: Record<string, string>, workspaceId: string | null): C[] {
  return clients.filter(c => !clientWorkspace[c.id] || clientWorkspace[c.id] === workspaceId)
}

export interface RosterGroup<C> { workspaceId: string; companyName: string; clients: C[] }

/** The roster grouped by company (in the order of `order`), skipping companies with nobody to show. */
export function groupRosterByCompany<C extends { id: string }>(
  clients: C[], clientWorkspace: Record<string, string>, names: Record<string, string>, order: string[],
): RosterGroup<C>[] {
  const known = new Set(order)
  const rest = [...new Set(clients.map(c => clientWorkspace[c.id]).filter((w): w is string => !!w && !known.has(w)))]
  return [...order, ...rest]
    .map(workspaceId => ({ workspaceId, companyName: names[workspaceId] ?? '', clients: clients.filter(c => clientWorkspace[c.id] === workspaceId) }))
    .filter(g => g.clients.length > 0)
}

/** Plain words for the role someone was invited as. */
export const INVITE_ROLE_LABEL: Record<string, string> = { team: 'team member', agent: 'agent', lawyer: 'lawyer', artist: 'artist' }
