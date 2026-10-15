// ──────────────────────────────────────────────────────────
//  Search for the ⌘K bar. Every word typed has to appear somewhere in an item (its name first,
//  then its hint and keywords); name matches rank higher, and a match at the start of a word
//  ranks higher than one in the middle. Accents and capitals are ignored.
// ──────────────────────────────────────────────────────────

export interface Searchable {
  group: string
  label: string
  hint?: string
  keywords?: string
}

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const wordsOf = (s: string) => plain(s).split(/[^a-z0-9]+/).filter(Boolean)

/** 0 = not a match; higher = better. */
export function scoreItem(item: Searchable, query: string): number {
  const typed = wordsOf(query)
  if (typed.length === 0) return 1
  const label = plain(item.label)
  const labelWords = wordsOf(item.label)
  const restText = plain(`${item.hint ?? ''} ${item.keywords ?? ''}`)
  const restWords = wordsOf(restText)
  let total = 0
  for (const w of typed) {
    if (label.startsWith(w)) total += 5
    else if (labelWords.some(x => x.startsWith(w))) total += 4
    else if (label.includes(w)) total += 2
    else if (restWords.some(x => x.startsWith(w))) total += 1.5
    else if (restText.includes(w)) total += 1
    else return 0
  }
  return total
}

/** The matching items, grouped in the order the groups first appear, best match first inside each group, at most `perGroup` per group. */
export function searchCommands<T extends Searchable>(items: T[], query: string, perGroup = 6): T[] {
  const typing = query.trim().length > 0
  const order = [...new Set(items.map(i => i.group))]
  const scored = items.map((item, i) => ({ item, i, s: scoreItem(item, query) })).filter(x => x.s > 0)
  scored.sort((a, b) =>
    order.indexOf(a.item.group) - order.indexOf(b.item.group) || (typing ? b.s - a.s : 0) || a.i - b.i)
  const seen = new Map<string, number>()
  return scored
    .filter(x => { const n = (seen.get(x.item.group) ?? 0) + 1; seen.set(x.item.group, n); return n <= perGroup })
    .map(x => x.item)
}
