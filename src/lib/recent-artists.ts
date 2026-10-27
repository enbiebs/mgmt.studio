// ──────────────────────────────────────────────────────────
//  The artist switcher's memory and search: which artists you opened last (so the one you were just in is a click away), and finding an
//  artist by typing a few letters. Pure logic (no store, no screen), covered by scripts/check-recent-artists.ts.
// ──────────────────────────────────────────────────────────

export const RECENT_KEY = 'mgmt-recent-artists'
export const RECENT_MAX = 5
/** The switcher offers a search box once there are more artists than this (with a few artists a plain list is quicker). */
export const SEARCH_ABOVE = 6

/** The list after opening `id`: it goes to the front, no repeats, no more than RECENT_MAX. */
export function pushRecent(list: readonly string[], id: string, max = RECENT_MAX): string[] {
  return [id, ...list.filter(x => x !== id)].slice(0, max)
}

/** The recent artists that still exist and this person can open, newest first, leaving out the one that is open now. */
export function recentArtists<T extends { id: string }>(list: readonly string[], roster: readonly T[], openId?: string | null): T[] {
  const byId = new Map(roster.map(c => [c.id, c]))
  return list.filter(id => id !== openId).map(id => byId.get(id)).filter((c): c is T => !!c)
}

// Letters that do not split into a letter plus an accent, folded to the plain letters people type; "$" is how some names write "s".
const FOLD: Record<string, string> = { 'ø': 'o', 'ł': 'l', 'đ': 'd', 'ð': 'd', 'æ': 'ae', 'œ': 'oe', 'ß': 'ss', 'þ': 'th', '$': 's' }
/** What a name or a search is compared as: no capitals, no accents, no apostrophes, punctuation as a space, letters of any alphabet kept. */
const plain = (s: string) => s.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase()
  .replace(/[øłđðæœßþ$]/g, c => FOLD[c]).replace(/['’`]/g, '').replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim()

/** True when what was typed has something to search for (a lone "." or spaces is not a search, so the list stays as it is). */
export const isSearching = (query: string): boolean => plain(query) !== ''

/**
 * Artists matching what was typed: names that start with it first, then names with a word that starts with it, then names that contain it.
 * Nothing (to search for) typed gives everyone, A to Z.
 */
export function filterArtists<T extends { name: string }>(roster: readonly T[], query: string): T[] {
  const q = plain(query)
  if (!q) return [...roster].sort((a, b) => a.name.localeCompare(b.name))
  const rank = (name: string) => { const n = plain(name); return n.startsWith(q) ? 0 : n.split(' ').some(w => w.startsWith(q)) ? 1 : n.includes(q) ? 2 : 3 }
  return roster.map(c => ({ c, r: rank(c.name) })).filter(x => x.r < 3).sort((a, b) => a.r - b.r || a.c.name.localeCompare(b.c.name)).map(x => x.c)
}

/** Reads the saved list, tolerating anything odd in it (a list of strings, or nothing). */
export function parseRecent(raw: string | null): string[] {
  try {
    const v: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX) : []
  } catch { return [] }
}
