// ──────────────────────────────────────────────────────────
//  "Who needs you most": the Inbox's alerts boiled down to one row per artist, the busiest artist first, each with the single
//  most pressing thing. Pure logic (no store, no screen), covered by scripts/check-attention-table.ts. Heads-ups (info) never count,
//  the same as the badge on the Today link, and the practice artist never ranks beside real ones.
// ──────────────────────────────────────────────────────────

import type { InboxItem, InboxSeverity } from '@/lib/inbox'

export interface AttentionRow {
  clientId: string
  clientName: string
  urgent: number
  soon: number
  /** The most pressing alert for this artist: the most severe, then the earliest date. */
  top: InboxItem
  /** How many more alerts are waiting behind `top`. */
  more: number
}

const RANK: Record<InboxSeverity, number> = { urgent: 0, soon: 1, info: 2 }
const pressing = (a: InboxItem, b: InboxItem) => RANK[a.severity] - RANK[b.severity] || (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.key.localeCompare(b.key)

/** One row per artist that has something needing action (urgent or coming up), most urgent first, then most items, then name. */
export function attentionRows(items: readonly InboxItem[]): AttentionRow[] {
  const byClient = new Map<string, InboxItem[]>()
  for (const i of items) if (i.severity !== 'info' && !i.demo) byClient.set(i.clientId, [...(byClient.get(i.clientId) ?? []), i])
  return [...byClient.entries()]
    .map(([clientId, list]) => {
      const sorted = [...list].sort(pressing)
      return {
        clientId, clientName: sorted[0].clientName,
        urgent: list.filter(i => i.severity === 'urgent').length,
        soon: list.filter(i => i.severity === 'soon').length,
        top: sorted[0], more: list.length - 1,
      }
    })
    .sort((a, b) => b.urgent - a.urgent || b.soon - a.soon || a.clientName.localeCompare(b.clientName))
}

/** The table is worth showing once there are at least two artists to rank. */
export const MIN_ROWS = 2
/** Rows shown before "and N more". */
export const SHOW_ROWS = 6
