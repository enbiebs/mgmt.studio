'use client'
// "Who needs you most": one row per artist with something waiting, the busiest first (lib/attention-table.ts). Opening the
// artist's name goes to the artist; the line beside it goes straight to the most pressing thing.

import { useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { useInbox } from '@/lib/useInbox'
import { attentionRows, MIN_ROWS, SHOW_ROWS } from '@/lib/attention-table'
import { openInboxItem } from '@/lib/inbox-open'
import { Badge } from '@/components/ui/Badge'

export function AttentionTable() {
  const { visible } = useInbox()
  const openClient = useStore(s => s.openClient)
  const [all, setAll] = useState(false)
  const rows = useMemo(() => attentionRows(visible), [visible])
  if (rows.length < MIN_ROWS) return null
  const shown = all ? rows : rows.slice(0, SHOW_ROWS)

  return (
    <section aria-label="Who needs you most" className="mb-8">
      <h2 className="font-serif text-xl font-medium leading-tight">Who needs you most</h2>
      <p className="mb-3 mt-0.5 text-sm text-gray-400">{rows.length} of your artists have something waiting, the busiest first.</p>
      <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-canvas">
        {shown.map(r => (
          <li key={r.clientId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
            <button onClick={() => openClient(r.clientId)} className="w-36 flex-shrink-0 truncate text-left text-sm font-semibold hover:text-accent">{r.clientName}</button>
            <span className="flex flex-shrink-0 items-center gap-1.5">
              {r.urgent > 0 && <Badge variant="red">{r.urgent} need{r.urgent === 1 ? 's' : ''} you now</Badge>}
              {r.soon > 0 && <Badge variant="amber">{r.soon} coming up</Badge>}
            </span>
            <button onClick={() => openInboxItem(r.top)} className="min-w-0 flex-1 basis-48 truncate text-left text-sm text-gray-500 hover:text-gray-900" title={r.top.title}>
              {r.top.title}{r.more > 0 ? <span className="text-gray-400"> · and {r.more} more</span> : null}
            </button>
          </li>
        ))}
      </ul>
      {rows.length > SHOW_ROWS && (
        <button onClick={() => setAll(v => !v)} className="mt-2 text-xs font-medium text-accent hover:underline">
          {all ? 'Show fewer' : `Show the other ${rows.length - SHOW_ROWS}`}
        </button>
      )}
    </section>
  )
}
