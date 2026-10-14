'use client'
// ──────────────────────────────────────────────────────────
//  InboxPanel — the top of the roster page: what needs you, across every artist you can
//  see, most urgent first. Each item opens the right screen; Done hides it until it gets
//  worse, Snooze hides it for a while.
// ──────────────────────────────────────────────────────────

import { useState } from 'react'
import { useStore } from '@/lib/store'
import { useInbox } from '@/lib/useInbox'
import { money2 } from '@/lib/settlement-math'
import { SEVERITY_LABEL, type InboxItem, type InboxSeverity } from '@/lib/inbox'
import { addDays, today } from '@/lib/utils'
import type { BizSub, TourSub } from '@/types'

const DOT: Record<InboxSeverity, string> = { urgent: 'bg-red-500', soon: 'bg-amber-400', info: 'bg-gray-300' }
const SHOW_FIRST = 6

export function InboxPanel() {
  const { visible, hidden } = useInbox()
  const { openClient, setSection, setBizSub, setTourSub, markInboxDone, snoozeInboxItem, restoreInboxItem } = useStore()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [showHidden, setShowHidden] = useState(false)

  function open(item: InboxItem) {
    openClient(item.clientId)
    setSection(item.go.section)
    if (item.go.section === 'finance' && item.go.sub) setBizSub(item.go.sub as BizSub)
    if (item.go.section === 'tour' && item.go.sub) setTourSub(item.go.sub as TourSub)
  }

  const groups = (['urgent', 'soon', 'info'] as InboxSeverity[])
    .map(sev => ({ sev, items: visible.filter(i => i.severity === sev) }))
    .filter(g => g.items.length > 0)

  const row = (item: InboxItem, isHiddenRow = false) => (
    <div key={item.key} className="flex flex-wrap md:flex-nowrap items-start gap-x-3 gap-y-1.5 py-2.5 border-t border-gray-50 first:border-t-0">
      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${DOT[item.severity]}`} />
      <div className="flex-1 min-w-0 basis-[calc(100%-1.25rem)] md:basis-auto">
        <div className="text-sm">
          <span className="text-[11px] font-semibold text-gray-400 mr-1.5">{item.clientName}</span>
          <span className="font-medium">{item.title}</span>
        </div>
        {item.detail && <div className="text-xs text-gray-400 mt-0.5">{item.detail}</div>}
      </div>
      {item.amount !== undefined && item.currency && (
        <div className="text-sm font-semibold tabular-nums flex-shrink-0 ml-5 md:ml-0">{money2(item.amount, item.currency)}</div>
      )}
      <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto md:ml-0">
        <button onClick={() => open(item)} className="px-2 py-1 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50">Open</button>
        {isHiddenRow ? (
          <button onClick={() => restoreInboxItem(item.key)} className="px-2 py-1 text-xs text-blue-500 hover:underline">Bring back</button>
        ) : (
          <>
            <button onClick={() => markInboxDone(item.key)} className="px-2 py-1 text-xs text-gray-400 hover:text-green-600" title="Hide until it gets worse">Done</button>
            <select
              aria-label="Snooze" value="" className="px-1 py-1 text-xs text-gray-400 bg-transparent border-0 cursor-pointer hover:text-gray-700"
              onChange={e => { if (e.target.value) snoozeInboxItem(item.key, addDays(today(), Number(e.target.value))) }}
            >
              <option value="">Snooze</option>
              <option value="1">1 day</option>
              <option value="3">3 days</option>
              <option value="7">1 week</option>
            </select>
          </>
        )}
      </div>
    </div>
  )

  return (
    <section className="mb-7 bg-canvas border border-gray-100 rounded-2xl p-4 md:p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1">
        <h2 className="font-serif text-lg font-medium">Inbox</h2>
        {groups.map(g => (
          <span key={g.sev} className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${g.sev === 'urgent' ? 'bg-red-50 text-red-600' : g.sev === 'soon' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
            {g.items.length} {SEVERITY_LABEL[g.sev].toLowerCase()}
          </span>
        ))}
        {hidden.length > 0 && (
          <button onClick={() => setShowHidden(v => !v)} className="ml-auto text-xs text-gray-400 hover:text-gray-600">
            {showHidden ? 'Hide' : 'Show'} done &amp; snoozed ({hidden.length})
          </button>
        )}
      </div>

      {groups.length === 0 && (
        <div className="py-4 text-sm text-gray-400">You&apos;re all caught up. Nothing needs you right now.</div>
      )}

      {groups.map(g => {
        const all = expanded[g.sev]
        const shown = all ? g.items : g.items.slice(0, SHOW_FIRST)
        // Heads-ups are the least pressing, so they start folded away.
        if (g.sev === 'info' && !expanded.info_open) {
          return (
            <button key={g.sev} onClick={() => setExpanded({ ...expanded, info_open: true })} className="block mt-3 text-xs text-blue-500 hover:underline">
              Show {g.items.length} heads-up{g.items.length === 1 ? '' : 's'}
            </button>
          )
        }
        return (
          <div key={g.sev} className="mt-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">{SEVERITY_LABEL[g.sev]}</div>
            {shown.map(i => row(i))}
            {g.items.length > SHOW_FIRST && (
              <button onClick={() => setExpanded({ ...expanded, [g.sev]: !all })} className="text-xs text-blue-500 hover:underline mt-1">
                {all ? 'Show fewer' : `Show all ${g.items.length}`}
              </button>
            )}
          </div>
        )
      })}

      {showHidden && hidden.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-100">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">Done &amp; snoozed</div>
          {hidden.map(i => row(i, true))}
        </div>
      )}
    </section>
  )
}
