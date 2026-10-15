// ──────────────────────────────────────────────────────────
//  Access levels: ready-made bundles of what a teammate can see and change for ONE artist. Choosing a level
//  just fills in the same per-section view / edit choices the Access panel already had (nothing new is
//  trusted: the database still checks every one of them), so a level can always be fine-tuned afterwards.
//  Pure logic (no screen, no database), so it can be tested.
//
//  What a section covers (so the descriptions are honest):
//    Tour     the schedule, advance, day sheets, travel, guest list, crew, AND the booking offers with their fees
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
    blurb: 'Everything for this artist, including money, contracts and the private profile, and can change all of it.',
    hidden: 'Nothing',
    levels: { profile: 'edit', music: 'edit', tour: 'edit', content: 'edit', finance: 'edit', team: 'edit', projects: 'edit', analytics: 'edit', legal: 'edit' },
  },
  {
    key: 'assistant', label: 'Day-to-day team',
    blurb: 'Works on shows, projects, content and music, and can look at the artist’s people and analytics.',
    hidden: 'Money (finance), contracts and the profile (private details such as ID numbers and home address live there). Booking offers, with their fees, are part of Tour, so they show',
    levels: { music: 'edit', tour: 'edit', content: 'edit', team: 'view', projects: 'edit', analytics: 'view' },
  },
  {
    key: 'crew', label: 'Tour crew',
    blurb: 'Sees the schedule, advance, day sheets, travel, guest list and crew for this artist, and can’t change anything.',
    hidden: 'Money, contracts, music, content and the profile. Booking offers, with their fees, are part of Tour, so they show',
    levels: { tour: 'view' },
  },
  {
    key: 'bookkeeper', label: 'Bookkeeper',
    blurb: 'Handles the money: invoices, bills, budgets, settlements and banking. Can look at the shows they relate to.',
    hidden: 'Contracts, music, content, the profile and projects',
    levels: { finance: 'edit', tour: 'view' },
  },
  {
    key: 'creative', label: 'Creative team',
    blurb: 'Works on music and content, and can see the projects and analytics.',
    hidden: 'Money, touring, contracts and the profile',
    levels: { music: 'edit', content: 'edit', projects: 'view', analytics: 'view' },
  },
  {
    key: 'readonly', label: 'Look only',
    blurb: 'Can look at shows, music, content, projects and analytics, but can’t change anything.',
    hidden: 'Money, contracts, the profile and the artist’s people. Booking offers, with their fees, are part of Tour, so they show',
    levels: { music: 'view', tour: 'view', content: 'view', projects: 'view', analytics: 'view' },
  },
]

export const presetByKey = (key: string) => PRESETS.find(p => p.key === key)

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

/** Which ready-made level exactly matches what is granted, 'none' for nothing at all, or 'custom'. */
export function matchPreset(grants: GrantRow[], clientId: string): string {
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
  add: { section: SectionKey; canEdit: boolean }[]          // new grants
}

/** What has to change to make one artist's grants exactly equal `levels`. Only touches that artist. */
export function planChanges(grants: GrantRow[], clientId: string, levels: Partial<Record<SectionKey, Level>>): GrantChanges {
  const mine = grants.filter(g => g.client_id === clientId)
  const out: GrantChanges = { remove: [], update: [], add: [] }
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
  const known = new Set<string>(SECTIONS.map(s => s.key))
  const out: string[] = []
  for (const g of grants) {
    if (g.client_id === clientId && !known.has(g.section)) out.push(`${label(g.section)} (not shown here)`)
    else if (g.client_id === null) out.push(`${label(g.section)} for all artists`)
  }
  return [...new Set(out)]
}
