'use client'
import { useState, useRef, useEffect } from 'react'
import { useStore } from '@/lib/store'
import { Badge } from '@/components/ui/Badge'
import { fmt, initials } from '@/lib/utils'
import type { Client } from '@/types'

export function ClientCard({ client: c }: { client: Client }) {
  // Client create/edit/delete is manager-only structurally (clients RLS
  // requires role = 'manager'), unlike everything else which is scoped
  // per-section — so this checks role directly, not a section grant.
  const isManager = useStore(s => s.role === 'manager')
  const { openClient, openModal, deleteClient } = useStore()
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
  const usd           = c.business.royalties.streams.filter(s => s.currency === 'USD').reduce((a, b) => a + b.amount, 0)
  const gbp           = c.business.royalties.streams.filter(s => s.currency === 'GBP').reduce((a, b) => a + b.amount, 0)
  const upcomingShows = c.tour.shows.filter(s => new Date(s.date) >= new Date()).length
  const pendingSplit  = c.business.banking.deposits.filter(d => !d.done).length
  const regIssues     = c.business.catalog.works.filter(w => w.bmi === 'warn' || w.sx === 'warn' || w.ppl === 'warn').length
  const royStr        = [usd > 0 ? fmt(usd, 'USD') : '', gbp > 0 ? fmt(gbp, 'GBP') : ''].filter(Boolean).join(' · ') || '—'

  return (
    <div
      className="relative bg-canvas border border-gray-100 rounded-2xl p-5 cursor-pointer hover:shadow-lg hover:border-gray-200 transition-all duration-200 group"
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
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center text-white text-base font-bold flex-shrink-0"
          style={{ background: c.color }}
        >
          {initials(c.name)}
        </div>
        <div>
          <div className="text-[17px] font-semibold leading-tight">{c.name}</div>
          <div className="text-xs text-gray-400 mt-0.5">{c.genre}</div>
        </div>
      </div>

      {/* ── Stats grid ── */}
      <div className="grid grid-cols-2 gap-3.5">
        <StatBlock label="Songs" value={String(tracks.length)} sub={`${finished} done / mastered`} />
        <StatBlock label="Royalties Owed" value={royStr} sub={`${c.business.royalties.streams.length} streams`} smallValue />
        <StatBlock label="Upcoming Shows" value={String(upcomingShows)} sub={`${c.tour.shows.length} total`} />
        <StatBlock label="Catalog" value={String(c.business.catalog.works.length)} sub="registered works" />
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center gap-1.5 mt-4 pt-3.5 border-t border-gray-100">
        {upcomingShows > 0 && <Badge variant="green">{upcomingShows} upcoming</Badge>}
        {pendingSplit   > 0 && <Badge variant="amber">{pendingSplit} to split</Badge>}
        {regIssues      > 0 && <Badge variant="red">{regIssues} reg issues</Badge>}
        {!upcomingShows && !pendingSplit && !regIssues && <Badge variant="gray">All clear</Badge>}
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
