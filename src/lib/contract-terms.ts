// ──────────────────────────────────────────────────────────
//  The key terms worth writing down for each kind of contract: a few labelled boxes instead of one blank notes field. A management
//  deal is judged on its term, commission, sunset, key person, exclusivity and territory; a sync licence on the use, the territory
//  and the period. Stored as plain text per box (Contract.terms), so they cost nothing to read back and the AI reader can fill them.
//  Pure logic (no store, no screen), covered by scripts/check-contract-terms.ts.
// ──────────────────────────────────────────────────────────

import type { Contract, ContractType } from '@/types'

export interface TermField { key: string; label: string; hint: string }

const f = (key: string, label: string, hint: string): TermField => ({ key, label, hint })

/** Keys are snake_case so the activity log can read them back as words ("key person"). */
export const TERM_FIELDS: Record<ContractType, TermField[]> = {
  management: [
    f('term', 'Term', 'e.g. 3 years from signing, with two 1-year options'),
    f('commission', 'Commission', 'e.g. 20% of gross income'),
    f('sunset', 'Sunset commission', 'e.g. 15% for 3 years, then 12%, then 10%'),
    f('key_person', 'Key person', 'e.g. if Dana leaves the company, the artist may end it'),
    f('exclusivity', 'Exclusivity', 'e.g. exclusive manager worldwide'),
    f('territory', 'Territory', 'e.g. worldwide'),
  ],
  touring: [
    f('term', 'Term', 'e.g. 2 years, with a 1-year option'),
    f('commission', 'Commission', 'e.g. 10% of the guarantee'),
    f('exclusivity', 'Exclusivity', 'e.g. exclusive for live shows worldwide'),
    f('territory', 'Territory', 'e.g. North America'),
  ],
  recording: [
    f('rights', 'Rights granted', 'e.g. exclusive recording services; the label owns the masters'),
    f('territory', 'Territory', 'e.g. worldwide'),
    f('term', 'Term and reversion', 'e.g. 3 albums; masters revert after 10 years'),
    f('royalty', 'Royalty', 'e.g. 18% of net receipts'),
    f('advance', 'Advance', 'e.g. $250,000, recoupable'),
    f('options', 'Options', 'e.g. the label may pick up 2 more albums'),
  ],
  publishing: [
    f('rights', 'Rights granted', 'e.g. co-publishing; admin only'),
    f('territory', 'Territory', 'e.g. worldwide'),
    f('term', 'Term and reversion', 'e.g. 5 years; songs revert after 3 years'),
    f('share', 'Share or admin fee', 'e.g. 75/25 split; 15% admin fee'),
    f('advance', 'Advance', 'e.g. $100,000, recoupable'),
  ],
  sync: [
    f('use', 'Media and use', 'e.g. TV series, one episode, in-context'),
    f('territory', 'Territory', 'e.g. worldwide'),
    f('term', 'Licence period', 'e.g. 5 years from first air date'),
    f('fee', 'Fee', 'e.g. $40,000 master, $40,000 sync'),
  ],
  brand: [
    f('deliverables', 'What the artist delivers', 'e.g. 2 posts, 1 video, 1 event'),
    f('exclusivity', 'Category exclusivity', 'e.g. no other footwear brands'),
    f('territory', 'Territory', 'e.g. US and Canada'),
    f('term', 'Term', 'e.g. 12 months from signing'),
    f('fee', 'Fee', 'e.g. $60,000, paid in two parts'),
  ],
  merch: [
    f('rights', 'Rights granted', 'e.g. exclusive online store and tour merch'),
    f('territory', 'Territory', 'e.g. worldwide'),
    f('term', 'Term', 'e.g. 2 years'),
    f('split', 'Split', 'e.g. 70/30 in the artist\'s favour'),
  ],
  nda: [
    f('scope', 'What is covered', 'e.g. unreleased music and tour plans'),
    f('term', 'How long it lasts', 'e.g. 3 years from signing'),
    f('direction', 'One way or both ways', 'e.g. mutual'),
  ],
  other: [],
}

export function termFieldsFor(type: ContractType): TermField[] {
  return TERM_FIELDS[type] ?? []
}

const KNOWN = (type: ContractType) => new Set(termFieldsFor(type).map(x => x.key))

/** The terms to save: only boxes this kind of contract has, with something written in them, trimmed. */
export function cleanTerms(type: ContractType, terms: Record<string, string> | undefined): Record<string, string> {
  const known = KNOWN(type)
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(terms ?? {})) {
    const value = typeof v === 'string' ? v.trim() : ''
    if (value && known.has(k)) out[k] = value.slice(0, 500)
  }
  return out
}

/** The boxes that have something in them, in the order the form shows them, with their labels. */
export function termsSummary(c: Pick<Contract, 'type' | 'terms'>): { label: string; value: string }[] {
  return termFieldsFor(c.type).filter(x => c.terms?.[x.key]).map(x => ({ label: x.label, value: c.terms![x.key] }))
}
