// ──────────────────────────────────────────────────────────
//  Access levels: ready-made bundles of what a teammate can see and change for ONE artist. Choosing a level
//  just fills in the same per-section view / edit choices the Access panel already had (nothing new is
//  trusted: the database still checks every one of them), so a level can always be fine-tuned afterwards.
//  Pure logic (no screen, no database), so it can be tested.
//
//  Two kinds of level live here:
//    • ready-made roles (below): bundles of per-section view / edit, tweakable afterwards
//    • Point Person: the admin of ONE artist. It is stored as a single 'admin' row for that artist (not as nine
//      section rows) and the database treats it as "everything for this artist except the vault, plus managing
//      who else has access" (migration 050).
//
//  What a section covers (so the descriptions are honest):
//    Tour     the schedule, advance, day sheets, travel, guest list and crew
//    Deals    booking offers and the money on each show (guarantee, deposit, agency and management commissions)
//    Finance  money: invoices, bills, budgets, settlements, banking, crew pay
//    Legal    contracts
//    Profile  the artist's details and accounts list
//    Team     the artist's directory of people
//    Projects the artist's requests, projects and to-dos
// ──────────────────────────────────────────────────────────

export type Level = 'none' | 'view' | 'edit'

export const SECTIONS = [
  { key: 'profile', label: 'Profile' },
  { key: 'music', label: 'Music' },
  { key: 'tour', label: 'Tour' },
  { key: 'deals', label: 'Deals & fees' },
  { key: 'content', label: 'Content' },
  { key: 'finance', label: 'Finance' },
  { key: 'team', label: 'Team' },
  { key: 'projects', label: 'Projects' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'legal', label: 'Legal' },
] as const
export type SectionKey = (typeof SECTIONS)[number]['key']

export interface AccessPreset {
  key: string
  label: string
  /** One plain sentence: who it is for and what they can do. */
  blurb: string
  /** What they will NOT be able to see. */
  hidden: string
  levels: Partial<Record<SectionKey, Level>>
}

export const PRESETS: AccessPreset[] = [
  {
    key: 'full', label: 'Full access',
    blurb: 'Everything for this artist, including money, contracts and the private profile, and can change all of it. Can\u2019t manage who else has access (that is a Point Person).',
    hidden: 'Nothing',
    levels: { profile: 'edit', music: 'edit', tour: 'edit', deals: 'edit', content: 'edit', finance: 'edit', team: 'edit', projects: 'edit', analytics: 'edit', legal: 'edit' },
  },
  {
    key: 'tourmanager', label: 'Tour or Production Manager',
    blurb: 'Runs the road: shows, advance, day sheets, travel and crew, and the tour money (budgets, settlements, invoices). Can look at show fees and booking offers, but not change them.',
    hidden: 'Contracts, music, content, projects, analytics and the profile (private details such as ID numbers and home address live there)',
    levels: { tour: 'edit', deals: 'view', finance: 'edit', team: 'view' },
  },
  {
    key: 'businessmanager', label: 'Business Manager',
    blurb: 'Sees and handles all of the money: invoices, bills, budgets, settlements and banking, plus the fees on shows and booking offers. Can read contracts. No tour calendar.',
    hidden: 'Shows and the tour calendar, music, content, projects and the profile',
    levels: { deals: 'edit', finance: 'edit', legal: 'view' },
  },
  {
    key: 'agent', label: 'Agent',
    blurb: 'Books the shows: works on the schedule, booking offers and show fees, and can look at the artist\u2019s people and projects.',
    hidden: 'Money (finance: invoices, bills, budgets), contracts, music, content and the profile',
    levels: { tour: 'edit', deals: 'edit', team: 'view', projects: 'view' },
  },
  {
    key: 'lawyer', label: 'Lawyer',
    blurb: 'Reads and works on contracts, and can look at music and the artist\u2019s people.',
    hidden: 'Money, touring, content, projects and the profile',
    levels: { legal: 'edit', music: 'view', team: 'view' },
  },
  {
    key: 'assistant', label: 'Day-to-day team',
    blurb: 'Works on shows (with their booking offers and fees), projects, content and music, and can look at the artist\u2019s people and analytics.',
    hidden: 'Money (finance: invoices, bills, budgets), contracts and the profile (private details such as ID numbers and home address live there)',
    levels: { music: 'edit', tour: 'edit', deals: 'edit', content: 'edit', team: 'view', projects: 'edit', analytics: 'view' },
  },
  {
    key: 'crew', label: 'Touring Crew',
    blurb: 'Sees the schedule, advance, day sheets, travel, guest list and crew for this artist, and can\u2019t change anything.',
    hidden: 'Money, booking offers and show fees, contracts, music, content and the profile',
    levels: { tour: 'view' },
  },
  {
    key: 'bookkeeper', label: 'Bookkeeper',
    blurb: 'Handles the money: invoices, bills, budgets, settlements and banking, and the fees on shows. Can look at the shows they relate to.',
    hidden: 'Contracts, music, content, the profile and projects',
    levels: { finance: 'edit', tour: 'view', deals: 'edit' },
  },
  {
    key: 'creative', label: 'Creative team',
    blurb: 'Works on music and content, and can see the projects and analytics.',
    hidden: 'Money, touring, contracts and the profile',
    levels: { music: 'edit', content: 'edit', projects: 'view', analytics: 'view' },
  },
  {
    key: 'readonly', label: 'Look only',
    blurb: 'Can look at shows, music, content, projects and analytics, but can\u2019t change anything.',
    hidden: 'Money, booking offers and show fees, contracts, the profile and the artist\u2019s people',
    levels: { music: 'view', tour: 'view', content: 'view', projects: 'view', analytics: 'view' },
  },
]

/** The admin of one artist. Not in PRESETS: it has no per-section levels, it is one 'admin' row. */
export const ADMIN_KEY = 'admin'
export const POINT_PERSON: AccessPreset = {
  key: ADMIN_KEY, label: 'Point Person',
  blurb: 'Runs this artist\u2019s whole business: can see and change everything for them, add people, change what they can see, and remove them. Can make other Point People.',
  hidden: 'The vault (saved passwords and bank details) unless a manager gives it separately. Other artists',
  levels: {},
}

/** Every choice in the level menu, Point Person first. */
export const LEVELS: AccessPreset[] = [POINT_PERSON, ...PRESETS]

export const presetByKey = (key: string) => LEVELS.find(p => p.key === key)

export interface GrantRow { id: string; section: string; client_id: string | null; can_edit: boolean }

/** The levels currently granted for one artist (sections that aren't granted are left out). */
export function levelsOf(grants: GrantRow[], clientId: string): Partial<Record<SectionKey, Level>> {
  const out: Partial<Record<SectionKey, Level>> = {}
  for (const g of grants) {
    if (g.client_id !== clientId) continue
    if (!SECTIONS.some(s => s.key === g.section)) continue
    out[g.section as SectionKey] = g.can_edit ? 'edit' : 'view'
  }
  return out
}

/** Is this person a Point Person (admin) for this artist? */
export function isPointPerson(grants: GrantRow[], clientId: string): boolean {
  return grants.some(g => g.section === ADMIN_KEY && g.client_id === clientId)
}

/** Which ready-made level exactly matches what is granted, 'none' for nothing at all, or 'custom'. */
export function matchPreset(grants: GrantRow[], clientId: string): string {
  if (isPointPerson(grants, clientId)) return ADMIN_KEY
  const have = levelsOf(grants, clientId)
  const keys = Object.keys(have) as SectionKey[]
  if (keys.length === 0) return 'none'
  const hit = PRESETS.find(p => {
    const want = Object.entries(p.levels).filter(([, l]) => l && l !== 'none') as [SectionKey, Level][]
    return want.length === keys.length && want.every(([k, l]) => have[k] === l)
  })
  return hit?.key ?? 'custom'
}

export interface GrantChanges {
  remove: string[]                                          // grant ids to delete
  update: { id: string; canEdit: boolean }[]                // existing grants whose view/edit changes
  add: { section: SectionKey | typeof ADMIN_KEY; canEdit: boolean }[]   // new grants
}

/**
 * What has to change to make one artist's grants exactly equal `levels` (or, with `pointPerson`, exactly "Point
 * Person"). Only touches that artist, and never the vault. Becoming a Point Person replaces the per-section rows
 * (they would be redundant, and would come back to life if the person were later made something smaller).
 */
export function planChanges(grants: GrantRow[], clientId: string, levels: Partial<Record<SectionKey, Level>>, pointPerson = false): GrantChanges {
  const mine = grants.filter(g => g.client_id === clientId)
  const out: GrantChanges = { remove: [], update: [], add: [] }
  const adminRow = mine.find(g => g.section === ADMIN_KEY)
  if (pointPerson) {
    for (const g of mine) if (SECTIONS.some(sec => sec.key === g.section)) out.remove.push(g.id)
    if (!adminRow) out.add.push({ section: ADMIN_KEY, canEdit: true })
    return out
  }
  if (adminRow) out.remove.push(adminRow.id)
  for (const g of mine) {
    if (!SECTIONS.some(sec => sec.key === g.section)) continue      // access the panel can't show (e.g. the vault) is never changed by choosing a level
    const want = levels[g.section as SectionKey]
    if (!want || want === 'none') out.remove.push(g.id)
    else if ((want === 'edit') !== g.can_edit) out.update.push({ id: g.id, canEdit: want === 'edit' })
  }
  for (const [section, want] of Object.entries(levels) as [SectionKey, Level | undefined][]) {
    if (!want || want === 'none') continue
    if (!mine.some(g => g.section === section)) out.add.push({ section, canEdit: want === 'edit' })
  }
  return out
}

export interface GrantSteps {
  add: GrantChanges['add']
  update: GrantChanges['update']
  remove: string[]
  removeLast: string[]
}

/**
 * The order to run a plan in: adds and changes first, ordinary removals next, and the rows in `lastIds` (a Point
 * Person's own admin row) very last, so someone stepping down or removing themselves keeps the right to finish the job.
 */
export function planSteps(plan: GrantChanges, lastIds: string[] = []): GrantSteps {
  return {
    add: plan.add,
    update: plan.update,
    remove: plan.remove.filter(id => !lastIds.includes(id)),
    removeLast: plan.remove.filter(id => lastIds.includes(id)),
  }
}

export type PageLevels = Partial<Record<SectionKey, Level>>

/** Click a page: none -> view -> edit -> none. Pages with no access are left out of the result. */
export function cyclePage(levels: PageLevels, section: SectionKey): PageLevels {
  const current = levels[section] ?? 'none'
  const next: Level = current === 'none' ? 'view' : current === 'view' ? 'edit' : 'none'
  const out: PageLevels = { ...levels }
  if (next === 'none') delete out[section]
  else out[section] = next
  return out
}

/** "View only" / "View and edit": every page they have at all moves to that level (pages with none stay none). */
export function setAllPages(levels: PageLevels, level: 'view' | 'edit'): PageLevels {
  const out: PageLevels = {}
  for (const [section, l] of Object.entries(levels) as [SectionKey, Level | undefined][]) if (l && l !== 'none') out[section] = level
  return out
}

/** The one word for a set of pages: nothing, all view, all edit, or a mix. */
export function overallLevel(levels: PageLevels): 'none' | 'view' | 'edit' | 'mixed' {
  const have = Object.values(levels).filter((l): l is 'view' | 'edit' => l === 'view' || l === 'edit')
  if (have.length === 0) return 'none'
  if (have.every(l => l === 'view')) return 'view'
  if (have.every(l => l === 'edit')) return 'edit'
  return 'mixed'
}

/** A role's own pages, with 'none' entries dropped (what the invite form starts from). */
export function levelsForRole(key: string): PageLevels {
  const preset = presetByKey(key)
  if (!preset) return {}
  const out: PageLevels = {}
  for (const [section, l] of Object.entries(preset.levels) as [SectionKey, Level | undefined][]) if (l && l !== 'none') out[section] = l
  return out
}

/** One line for a preset: "Can see: …; can change: …". */
export function summarize(levels: Partial<Record<SectionKey, Level>>): string {
  const names = (l: Level) => SECTIONS.filter(s => levels[s.key] === l).map(s => s.label)
  const edit = names('edit'), view = names('view')
  const parts = []
  if (edit.length) parts.push(`Can change: ${edit.join(', ')}`)
  if (view.length) parts.push(`Can look at: ${view.join(', ')}`)
  return parts.join(' · ') || 'Cannot see anything for this artist'
}

/**
 * Access this person has that the level picker neither shows nor changes: sections it doesn't list (such as the vault)
 * and access to ALL artists (set elsewhere, not per artist). Shown as a note so a level never looks like the whole story.
 */
export function otherAccess(grants: GrantRow[], clientId: string): string[] {
  const label = (section: string) => SECTIONS.find(s => s.key === section)?.label ?? section
  const known = new Set<string>([...SECTIONS.map(s => s.key), ADMIN_KEY])
  const out: string[] = []
  for (const g of grants) {
    if (g.client_id === clientId && !known.has(g.section)) out.push(`${label(g.section)} (not shown here)`)
    else if (g.client_id === null) out.push(`${label(g.section)} for all artists`)
  }
  return [...new Set(out)]
}
