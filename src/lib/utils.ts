// ──────────────────────────────────────────────────────────
//  Studio · Utility functions
// ──────────────────────────────────────────────────────────

import type { Currency, Stage, ChecklistItem } from '@/types'

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

/** Fresh release checklist — all items unchecked */
export function defaultChecklist(): ChecklistItem[] {
  return [
    { key: 'masters',     label: 'Final masters delivered',           done: false },
    { key: 'artwork',     label: 'Artwork finalized (3000×3000)',     done: false },
    { key: 'isrc',        label: 'ISRC codes assigned',               done: false },
    { key: 'upc',         label: 'UPC / barcode assigned',            done: false },
    { key: 'splits',      label: 'Splits sheet signed',               done: false },
    { key: 'labelcopy',   label: 'Label copy completed',              done: false },
    { key: 'metadata',    label: 'Metadata submitted to distributor', done: false },
    { key: 'releasedate', label: 'Release date confirmed',            done: false },
    { key: 'presave',     label: 'Pre-save / pre-order live',         done: false },
    { key: 'copyright',   label: 'Copyright registration filed',      done: false },
  ]
}

export const AVATAR_COLORS = [
  '#4c8df6','#8b5cf6','#ec4899','#f59e0b',
  '#10b981','#ef4444','#6366f1','#14b8a6','#f97316','#06b6d4',
]
