// ──────────────────────────────────────────────────────────
//  Studio · Utility functions
// ──────────────────────────────────────────────────────────

import type { Currency, Stage, ChecklistItem, PostType, Album, ReleaseType } from '@/types'

/** Format a money amount: $8K, £40K, $200K, $1.2M */
export function fmt(amount: number, currency: Currency): string {
  const sym = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$'
  if (amount >= 1_000_000) return `${sym}${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000)     return `${sym}${(amount / 1_000).toFixed(0)}K`
  return `${sym}${amount.toLocaleString()}`
}

/** Human-readable stage label */
export function stageLabel(stage: Stage): string {
  return { track: 'TRACK', mix: 'MIX', master: 'MASTER', done: 'DONE' }[stage]
}

/**
 * Shifts a "HH:MM" (24h) time string by ± minutes, wrapping within a day.
 * Returns null for anything that isn't a clean HH:MM — blank, "TBC", or
 * other freeform text — so callers can silently skip those rather than
 * mangling them. Used by the Advance schedule's "shift everything after
 * this by N minutes" tool.
 */
export function shiftTime(value: string, minutes: number): string | null {
  const m = value.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const h = parseInt(m[1], 10)
  const mi = parseInt(m[2], 10)
  if (h > 23 || mi > 59) return null
  const total = (((h * 60 + mi + minutes) % 1440) + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** Human-readable release type label — shared by every Music sub-tab */
export const RELEASE_TYPE_LABEL: Record<ReleaseType, string> = { single: 'Single', ep: 'EP', album: 'Album' }

/**
 * A client can have several releases (single/EP/album). Every Music sub-tab
 * that only makes sense for one release at a time (Label Copy, Checklist,
 * Status) resolves which one via this — falling back to the first release
 * if nothing's selected yet, or if the previously-selected one was deleted.
 */
export function resolveActiveAlbum(albums: Album[], selectedId: string | null): Album {
  return albums.find(a => a.id === selectedId) ?? albums[0]
}

/** CSS class for stage badge */
export function stageBadgeClass(stage: Stage): string {
  return {
    track:  'bg-gray-100 text-gray-500',
    mix:    'bg-purple-100 text-purple-700',
    master: 'bg-blue-100 text-blue-700',
    done:   'bg-green-100 text-green-700',
  }[stage]
}

/** 1-2 uppercase initials from a name */
export function initials(name: string): string {
  return name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

/** Short random id */
export function uid(): string {
  return Math.random().toString(36).slice(2, 9)
}

/** ISO date string for a Date object */
export function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

/** Today as ISO date string */
export function today(): string {
  return toDateStr(new Date())
}

/** Add (or subtract, with a negative n) days to an ISO date string */
export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}

/**
 * Release rollout template — the day-by-day content cadence a release
 * actually follows: countdown posts building to release day, then a
 * cross-platform push (IG, TikTok, YouTube Shorts, Spotify Clips) in the
 * weeks after, since a single "official sound" clip gets re-cut across
 * every platform rather than posted once and left alone.
 */
export const ROLLOUT_TEMPLATE: { offset: number; type: PostType; time: string; title: (t: string) => string }[] = [
  { offset: -16, type: 'laylo',         time: '10:00am', title: t => `Pre-save "${t}" — out this Friday` },
  { offset: -14, type: 'post',          time: '11:00am', title: t => `Gearing up for "${t}" — behind the scenes` },
  { offset: -7,  type: 'post',          time: '11:00am', title: t => `One week until "${t}" 🔥` },
  { offset: -4,  type: 'post',          time: '11:00am', title: t => `"${t}" is out this Friday` },
  { offset: -2,  type: 'story',         time: '5:00pm',  title: t => `"${t}" — pre-save reminder / countdown` },
  { offset: -1,  type: 'story',         time: '6:00pm',  title: t => `"${t}" drops tomorrow` },
  { offset: 0,   type: 'post',          time: '9:00am',  title: t => `${t.toUpperCase()} IS OUT NOW!` },
  { offset: 0,   type: 'tiktok',        time: '9:00am',  title: t => `"${t}" — out now (Official Sound)` },
  { offset: 0,   type: 'tweet',         time: '9:00am',  title: t => `"${t}" — streaming everywhere now` },
  { offset: 1,   type: 'reel',          time: '11:00am', title: t => `"${t}" — reaction & recap` },
  { offset: 2,   type: 'story',         time: '12:00pm', title: t => `"${t}" — fan reactions` },
  { offset: 3,   type: 'shorts',        time: '11:00am', title: t => `"${t}" — Official Short` },
  { offset: 5,   type: 'spotify-clip',  time: '11:00am', title: t => `"${t}" — Spotify Clip` },
  { offset: 7,   type: 'tiktok',        time: '11:00am', title: t => `"${t}" — week one push` },
  { offset: 9,   type: 'story',         time: '11:00am', title: t => `"${t}" — behind-the-scenes archive drop` },
  { offset: 14,  type: 'reel',          time: '11:00am', title: t => `"${t}" — still on repeat` },
]

/** Calendar grid for a month — returns Date objects including padding days */
export function calendarDays(year: number, month: number): { date: Date; current: boolean }[] {
  const first = new Date(year, month, 1)
  const last  = new Date(year, month + 1, 0)
  const days: { date: Date; current: boolean }[] = []

  // Pad before the 1st (Sunday = 0)
  for (let i = 0; i < first.getDay(); i++) {
    days.push({ date: new Date(year, month, 1 - (first.getDay() - i)), current: false })
  }
  for (let d = 1; d <= last.getDate(); d++) {
    days.push({ date: new Date(year, month, d), current: true })
  }
  // Pad to complete last row
  while (days.length % 7 !== 0) {
    const prev = days[days.length - 1].date
    const next = new Date(prev); next.setDate(prev.getDate() + 1)
    days.push({ date: next, current: false })
  }
  return days
}

export const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]
export const MONTH_SHORT = MONTH_NAMES.map(m => m.slice(0, 3))
export const DOW_SHORT   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

/** Parses a "touched" string like "12d" / "3d" / "now" into a day count, or null if unparseable */
export function touchedDays(touched: string): number | null {
  if (touched === 'now') return 0
  const m = touched.match(/^(\d+)d$/)
  return m ? Number(m[1]) : null
}

/** A non-done track is "stale" once it's gone 10+ days without an update */
export function isStale(stage: Stage, touched: string): boolean {
  if (stage === 'done') return false
  const days = touchedDays(touched)
  return days !== null && days >= 10
}

/** Fresh release checklist — all items unchecked, grouped by phase */
export function defaultChecklist(): ChecklistItem[] {
  return [
    // Rights & Credits — has to clear before anything downstream can move
    { key: 'splits',       phase: 'Rights & Credits',       label: 'Splits gathered from every songwriter/feature', done: false },
    { key: 'samples',      phase: 'Rights & Credits',       label: 'Sample clearance checked',                      done: false },
    { key: 'labelcopy',    phase: 'Rights & Credits',       label: 'Label copy / credits finalized',                done: false },
    // Audio Delivery — timed against the DSP pitching deadline, not the release date
    { key: 'masters',      phase: 'Audio Delivery',         label: 'Final master delivered',                        done: false },
    { key: 'stems',        phase: 'Audio Delivery',         label: 'Stems delivered (Atmos mix)',                   done: false },
    { key: 'extended',     phase: 'Audio Delivery',         label: 'Extended version delivered',                    done: false },
    { key: 'archived',     phase: 'Audio Delivery',         label: 'Master archived with label',                    done: false },
    { key: 'metadata',     phase: 'Audio Delivery',         label: 'Delivered to DSPs',                             done: false },
    // Release Assets
    { key: 'isrc',         phase: 'Release Assets',         label: 'ISRC codes assigned',                           done: false },
    { key: 'upc',          phase: 'Release Assets',         label: 'UPC / barcode assigned',                        done: false },
    { key: 'artwork',      phase: 'Release Assets',         label: 'Artwork finalized (3000×3000)',                 done: false },
    { key: 'releasedate',  phase: 'Release Assets',         label: 'Release date confirmed',                        done: false },
    { key: 'copyright',    phase: 'Release Assets',         label: 'Copyright registration filed',                  done: false },
    // Social & DSP Marketing — re-triggered whenever the master changes
    { key: 'officialsound', phase: 'Social & DSP Marketing', label: 'TikTok/Meta Official Sound clip approved',     done: false },
    { key: 'cml',           phase: 'Social & DSP Marketing', label: 'TikTok CML/PML clearance confirmed',           done: false },
    { key: 'dsppitch',      phase: 'Social & DSP Marketing', label: 'DSP pitch submitted',                          done: false },
    { key: 'lyrics',        phase: 'Social & DSP Marketing', label: 'Lyrics approved for asset creation',           done: false },
    { key: 'presave',       phase: 'Social & DSP Marketing', label: 'Pre-save / pre-order live',                    done: false },
  ]
}

export const AVATAR_COLORS = [
  '#4c8df6','#8b5cf6','#ec4899','#f59e0b',
  '#10b981','#ef4444','#6366f1','#14b8a6','#f97316','#06b6d4',
]
