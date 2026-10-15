'use client'
// ──────────────────────────────────────────────────────────
//  ActivityView — "who changed what, and when" for one artist.
//  The entries are kept by the database (see migration 035), so this is only a reader: what a
//  person can see here is decided there, by the same rules as the data itself.
// ──────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { createClient } from '@/lib/supabase/client'
import { ACTIVITY_GROUPS, actorName, describeEntry, type ActivityEntry } from '@/lib/activity'
import { localDateOf, today, addDays, fromDateStr } from '@/lib/utils'

const PAGE = 50

async function fetchPage(clientId: string, from: number) {
  const { data, error } = await createClient().from('activity_log').select('*')
    .eq('client_id', clientId).order('created_at', { ascending: false }).range(from, from + PAGE - 1)
  return { rows: (data ?? []) as ActivityEntry[], failed: !!error }
}

const dayHeading = (iso: string) => {
  if (iso === today()) return 'Today'
  if (iso === addDays(today(), -1)) return 'Yesterday'
  return fromDateStr(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}
const timeText = (ts: string) => new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

export function ActivityView() {
  const clientId = useStore(s => s.clientId)
  const clientName = useStore(s => s.getClient()?.name)
  const myId = useStore(s => s.userId)
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [group, setGroup] = useState('all')
  const [person, setPerson] = useState('all')

  // First load, and again whenever another artist is opened.
  useEffect(() => {
    if (!clientId) return
    let alive = true
    fetchPage(clientId, 0).then(({ rows, failed }) => {
      if (!alive) return
      if (failed) setError("Couldn't load the activity. Please try again.")
      else { setEntries(rows); setMore(rows.length === PAGE) }
      setLoading(false)
    })
    return () => { alive = false }
  }, [clientId])

  async function load(from: number, replace: boolean) {
    if (!clientId) return
    setLoading(true); setError(null)
    const { rows, failed } = await fetchPage(clientId, from)
    if (failed) setError("Couldn't load the activity. Please try again.")
    else { setEntries(prev => (replace ? rows : [...prev, ...rows])); setMore(rows.length === PAGE) }
    setLoading(false)
  }

  const people = useMemo(() => [...new Set(entries.map(e => actorName(e, myId)))].sort(), [entries, myId])
  const shown = useMemo(() => {
    const types = ACTIVITY_GROUPS.find(g => g.key === group)?.types
    return entries.filter(e => (!types || types.includes(e.entity_type)) && (person === 'all' || actorName(e, myId) === person))
  }, [entries, group, person, myId])
  const days = useMemo(() => {
    const byDay = new Map<string, ActivityEntry[]>()
    for (const e of shown) {
      const d = localDateOf(e.created_at)
      byDay.set(d, [...(byDay.get(d) ?? []), e])
    }
    return [...byDay.entries()]
  }, [shown])

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-4 md:px-6 pt-4 md:pt-6 pb-4 border-b border-gray-100">
        <div className="flex items-end justify-between gap-3 mb-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Accountability</div>
            <h2 className="text-xl font-semibold">{clientName} — Activity</h2>
          </div>
          <button onClick={() => void load(0, true)} className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50">Refresh</button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {[{ key: 'all', label: 'Everything' }, ...ACTIVITY_GROUPS].map(g => (
            <button
              key={g.key}
              onClick={() => setGroup(g.key)}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${group === g.key ? 'bg-gray-900 text-canvas border-gray-900' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
            >
              {g.label}
            </button>
          ))}
          {people.length > 1 && (
            <select value={person} onChange={e => setPerson(e.target.value)} className="ml-auto px-2 py-1 border border-gray-200 rounded-lg text-xs bg-canvas" aria-label="Filter by person">
              <option value="all">Everyone</option>
              {people.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="p-4 md:p-6 max-w-3xl">
        {error && <div className="rounded-lg border border-red-200 text-red-600 text-xs px-3 py-2 mb-3">{error}</div>}
        {!loading && !error && shown.length === 0 && (
          <div className="py-12 text-center text-sm text-gray-400 space-y-1">
            <div>{entries.length === 0 ? 'Nothing recorded yet.' : 'Nothing matches that filter.'}</div>
            {entries.length === 0 && <div className="text-xs">From now on, every change to this artist&apos;s shows, offers, budgets, invoices, bills, settlements and contracts is recorded here, with who made it.</div>}
          </div>
        )}

        {days.map(([day, list]) => (
          <div key={day} className="mb-6">
            <div className={`text-[11px] font-bold uppercase tracking-wider mb-2 ${day === today() ? 'text-accent' : 'text-gray-400'}`}>{dayHeading(day)}</div>
            <div className="space-y-3">
              {list.map(e => {
                const who = actorName(e, myId)
                const t = describeEntry(e)
                return (
                  <div key={e.id} className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-[11px] font-semibold text-gray-600 flex-shrink-0 mt-0.5" aria-hidden>
                      {who.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm leading-snug">
                        <span className="font-semibold">{who}</span> {t.headline}
                        <span className="text-xs text-gray-400"> · {timeText(e.created_at)}</span>
                      </div>
                      {t.details.length > 0 && (
                        <ul className="mt-0.5 text-xs text-gray-500 space-y-0.5 list-disc pl-4">
                          {t.details.map((d, i) => <li key={i}>{d}</li>)}
                        </ul>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {loading && <div className="py-6 text-center text-xs text-gray-400">Loading…</div>}
        {more && !loading && (
          <button onClick={() => void load(entries.length, false)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50">Show older activity</button>
        )}
        <div className="mt-8 text-[11px] text-gray-300">Kept by the database, so it can&apos;t be edited. You only see changes to the sections you have access to.</div>
      </div>
    </div>
  )
}
