'use client'
import { useState, useRef, useEffect } from 'react'
import { useStore } from '@/lib/store'
import { Badge } from '@/components/ui/Badge'
import { fmt, today } from '@/lib/utils'
import { getCalendarEvents, canSeeCalendarDomain } from '@/lib/calendar'
import { useInbox } from '@/lib/useInbox'
import { useSetup } from '@/lib/useSetup'
import { useMe } from '@/lib/useToday'
import { isMine } from '@/lib/tasks'
import type { CalendarEventDomain } from '@/lib/calendar'
import { formatTotals, royaltiesOwed } from '@/lib/money'
import type { Client, Currency } from '@/types'
import { ArtistAvatar } from '@/components/ui/ArtistAvatar'

export function ClientCard({ client: c }: { client: Client }) {
  // Client create/edit/delete is manager-only structurally (clients RLS
  // requires role = 'manager'), unlike everything else which is scoped
  // per-section — so this checks role directly, not a section grant.
  const isManager = useStore(s => s.role === 'manager')
  const hasAccess = useStore(s => s.hasAccess)
  const role = useStore(s => s.role)
  const { openClient, openModal, deleteClient } = useStore()
  const inbox = useInbox().byClient[c.id]
  const setup = useSetup(c)
  const me = useMe()
  const myTodos = (c.tasks ?? []).filter(t => !t.doneAt && isMine(t, me)).length
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Compute stats
  const tracks        = c.songs.albums.flatMap(a => a.tracks)
  const finished      = tracks.filter(t => t.stage === 'done' || t.stage === 'master').length
  const pendingSplit  = c.business.banking.deposits.filter(d => !d.done).length
  const regIssues     = c.business.catalog.works.filter(w => w.bmi === 'warn' || w.sx === 'warn' || w.ppl === 'warn').length
  const royStr        = formatTotals(royaltiesOwed(c.business.royalties.streams), (n, cur) => fmt(n, cur as Currency)) || '—'

  // "Upcoming" pulls from the same unified calendar aggregator the
  // Calendar tab uses (src/lib/calendar.ts) instead of a one-off inline
  // date filter, so it covers everything forward-looking — not just
  // shows — and respects the same per-domain access grants.
  const canSeeDomain = (domain: CalendarEventDomain) => canSeeCalendarDomain(domain, c.id, role, hasAccess)
  const upcomingEvents = getCalendarEvents(c, canSeeDomain).filter(e => e.date >= today() && !e.cancelled)     // a cancelled show is not upcoming
  const upcoming       = upcomingEvents.length
  const upcomingShows  = upcomingEvents.filter(e => e.domain === 'show').length
  const upcomingOther  = upcoming - upcomingShows

  return (
    <div
      className="glass relative bg-canvas border border-gray-100 rounded-2xl p-5 cursor-pointer hover:shadow-lg hover:border-gray-200 transition-all duration-200 group"
      onClick={() => openClient(c.id)}
    >
      {/* ── 3-dot menu ── */}
      {isManager && (
      <div
        ref={menuRef}
        className="absolute top-4 right-4"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={() => setMenuOpen(v => !v)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 opacity-0 group-hover:opacity-100 hover:bg-gray-100 hover:text-gray-500 transition-all text-base"
        >
          ⋯
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 bg-canvas border border-gray-100 rounded-xl shadow-lg min-w-[150px] overflow-hidden z-50">
            <button
              className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
              onClick={() => { openModal('edit-client', { id: c.id }); setMenuOpen(false) }}
            >
              Edit client
            </button>
            <button
              className="block w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors"
              onClick={() => { if (confirm(`Remove ${c.name}?`)) { deleteClient(c.id); setMenuOpen(false) } }}
            >
              Remove client
            </button>
          </div>
        )}
      </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-center gap-3 mb-5">
        <ArtistAvatar client={c} className="w-11 h-11" textClass="text-base" />
        <div>
          <div className="text-[17px] font-semibold leading-tight">{c.name}</div>
          <div className="text-xs text-gray-400 mt-0.5">
            {c.genre}
            {c.isDemo && <span title="Practice data. Only you can see it. Its alerts show up on Home so you can see the app working, but its figures never count toward real cash." className="ml-2 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-semibold uppercase tracking-wide">Demo · only you</span>}
          </div>
        </div>
      </div>

      {/* ── Stats grid ── */}
      <div className="grid grid-cols-2 gap-3.5">
        <StatBlock label="Songs" value={String(tracks.length)} sub={`${finished} done / mastered`} />
        <StatBlock label="Royalties Owed" value={royStr} sub={`${c.business.royalties.streams.length} streams`} smallValue />
        <StatBlock label="Upcoming" value={String(upcoming)} sub={upcomingOther > 0 ? `${upcomingShows} shows, ${upcomingOther} other` : `${upcomingShows} shows`} />
        <StatBlock label="Catalog" value={String(c.business.catalog.works.length)} sub="registered works" />
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center gap-1.5 mt-4 pt-3.5 border-t border-gray-100">
        {(inbox?.urgent ?? 0) > 0 && <Badge variant="red">{inbox!.urgent} need you now</Badge>}
        {(inbox?.soon ?? 0) > 0 && <Badge variant="amber">{inbox!.soon} coming up</Badge>}
        {upcoming     > 0 && <Badge variant="green">{upcoming} upcoming</Badge>}
        {pendingSplit > 0 && <Badge variant="amber">{pendingSplit} to split</Badge>}
        {regIssues    > 0 && <Badge variant="red">{regIssues} reg issues</Badge>}
        {myTodos > 0 && <Badge variant="blue">{myTodos} to-do{myTodos === 1 ? '' : 's'} for you</Badge>}
        {setup && !setup.complete && <Badge variant="blue">Setup {setup.done}/{setup.total}</Badge>}
        {!upcoming && !pendingSplit && !regIssues && !inbox?.urgent && !inbox?.soon && !(setup && !setup.complete) && myTodos === 0 && <Badge variant="gray">All clear</Badge>}
        <button
          className="ml-auto text-sm font-medium px-2.5 py-1 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          onClick={e => { e.stopPropagation(); openClient(c.id) }}
        >
          Open →
        </button>
      </div>
    </div>
  )
}

function StatBlock({ label, value, sub, smallValue }: { label: string; value: string; sub: string; smallValue?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">{label}</div>
      <div className={`font-semibold font-serif leading-tight text-gray-900 ${smallValue ? 'text-base' : 'text-xl'}`}>{value}</div>
      <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>
    </div>
  )
}
