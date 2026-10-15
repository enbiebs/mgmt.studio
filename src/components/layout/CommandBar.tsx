'use client'
// ──────────────────────────────────────────────────────────
//  The ⌘K bar: jump to any page, artist, show, offer or invoice, or do a common action, from anywhere.
//  Only what this person may see is searched (artists they can open, sections they have access to).
// ──────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import { fromDateStr } from '@/lib/utils'
import { searchCommands, type Searchable } from '@/lib/command-search'
import { Icon, type IconName } from '@/components/ui/Icon'
import type { MainSection } from '@/types'
import { useVisibleNav } from './nav'

export const OPEN_COMMAND_BAR = 'mgmt:open-command-bar'

interface Command extends Searchable { id: string; icon: IconName; run: () => void }

const dateText = (iso: string) =>
  iso ? fromDateStr(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
const place = (venue: string, city: string) => [venue, city].filter(Boolean).join(' · ') || 'Untitled'
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Open an artist at a section, then let the caller point at something inside it. */
function jump(clientId: string, section: MainSection, then?: (s: ReturnType<typeof useStore.getState>) => void) {
  const s = useStore.getState()
  s.openClient(clientId)
  s.setSection(section)
  then?.(s)
}

export function CommandBar() {
  const role = useStore(s => s.role)
  const view = useStore(s => s.view)
  const clientId = useStore(s => s.clientId)
  const data = useStore(s => s.data)
  const hasAccess = useStore(s => s.hasAccess)
  const accessibleClientIds = useStore(s => s.accessibleClientIds)
  const nav = useVisibleNav()

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)

  const show = useCallback(() => {
    returnFocus.current = document.activeElement as HTMLElement | null
    setQuery(''); setSel(0); setOpen(true)
  }, [])
  const hide = useCallback(() => { setOpen(false); returnFocus.current?.focus?.() }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (open) hide(); else show() }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_COMMAND_BAR, show)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener(OPEN_COMMAND_BAR, show) }
  }, [open, show, hide])

  const items = useMemo<Command[]>(() => {
    if (!open) return []
    const out: Command[] = []
    const ids = accessibleClientIds()
    const roster = ids === 'all' ? data.clients : data.clients.filter(c => ids.includes(c.id))
    const current = roster.find(c => c.id === clientId)

    out.push({ id: 'home', group: 'Go to', icon: 'home', label: 'Home', hint: 'All artists and what needs you', run: () => useStore.getState().goToDashboard() })
    if (view === 'studio' && current) {
      for (const g of nav) for (const i of g.items) {
        out.push({ id: `go-${i.key}`, group: 'Go to', icon: i.icon, label: i.label, hint: current.name, run: () => useStore.getState().setSection(i.key) })
      }
    }
    // Actions come right after the pages, so they are easy to find.
    const pasteFor = view === 'studio' && current ? [current] : roster
    for (const c of pasteFor) {
      if (!hasAccess('tour', c.id, true)) continue
      out.push({
        id: `paste-offer-${c.id}`, group: 'Actions', icon: 'tour', label: `Paste a booking offer for ${c.name}`,
        hint: 'Read an email or PDF into a new booking offer', keywords: 'new offer add email paste',
        run: () => jump(c.id, 'tour', st => { st.setTourSub('offers'); st.requestOfferPaste() }),
      })
    }
    if (role === 'manager') {
      out.push({ id: 'add-client', group: 'Actions', icon: 'plus', label: 'Add a client', hint: 'New artist', run: () => { const s = useStore.getState(); s.goToDashboard(); s.openModal('add-client') } })
    }
    out.push({ id: 'sign-out', group: 'Actions', icon: 'arrow', label: 'Sign out', run: () => { void useStore.getState().signOut() } })

    for (const c of roster) {
      out.push({ id: `artist-${c.id}`, group: 'Artists', icon: 'home', label: c.name, hint: c.isDemo ? 'Demo artist' : 'Open artist', run: () => useStore.getState().openClient(c.id) })
    }
    for (const c of roster) {
      if (!hasAccess('tour', c.id)) continue
      const showIds = new Set(c.tour.shows.map(s => s.id))
      for (const s of c.tour.shows) {
        if (s.status === 'cancelled') continue
        out.push({
          id: `show-${s.id}`, group: 'Shows', icon: 'calendar', label: place(s.venue, s.city),
          hint: `${c.name} · ${dateText(s.date)}${s.historyOnly ? ' · history' : ''}`,
          run: () => jump(c.id, 'tour', st => { st.setTourSub('tour'); st.setSelectedShow(s.id) }),
        })
      }
      for (const o of c.agentData?.offers ?? []) {
        if (o.showId && showIds.has(o.showId)) continue
        out.push({
          id: `offer-${o.id}`, group: 'Offers', icon: 'tour', label: place(o.venue, o.city),
          hint: `${c.name} · ${cap(o.status)} offer · ${dateText(o.date)}`,
          run: () => jump(c.id, 'tour', st => st.setTourSub('offers')),
        })
      }
    }
    for (const c of roster) {
      if (!hasAccess('finance', c.id)) continue
      for (const inv of c.finance?.invoices ?? []) {
        out.push({
          id: `invoice-${inv.id}`, group: 'Invoices', icon: 'finance', label: `${inv.number} · ${inv.to}`,
          hint: `${c.name} · ${cap(inv.status)}`,
          run: () => jump(c.id, 'finance', st => st.setBizSub('invoices')),
        })
      }
    }
    return out
  }, [open, data, clientId, view, role, nav, hasAccess, accessibleClientIds])

  const results = useMemo(() => searchCommands(items, query), [items, query])
  const active = Math.min(sel, Math.max(0, results.length - 1))

  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [open, active, results])

  if (!open || role === 'artist') return null

  const choose = (i: number) => { const r = results[i]; if (r) { setOpen(false); r.run() } }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/30 px-4 pt-[12vh] animate-in fade-in duration-150"
      onMouseDown={e => { if (e.target === e.currentTarget) hide() }}
    >
      <div role="dialog" aria-modal="true" aria-label="Search or jump to" className="w-full max-w-[580px] bg-canvas border border-gray-100 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 border-b border-gray-100">
          <Icon name="search" className="w-[18px] h-[18px] text-gray-400" />
          <input
            autoFocus
            value={query}
            onChange={e => { setQuery(e.target.value); setSel(0) }}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel(Math.min(active + 1, results.length - 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(Math.max(active - 1, 0)) }
              else if (e.key === 'Enter') { e.preventDefault(); choose(active) }
              else if (e.key === 'Escape') { e.preventDefault(); hide() }
              else if (e.key === 'Tab') e.preventDefault()
            }}
            role="combobox"
            aria-expanded="true"
            aria-controls="command-list"
            aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
            placeholder="Jump to an artist, show, offer, invoice, or page"
            autoComplete="off"
            className="flex-1 py-4 text-[15px] bg-transparent outline-none placeholder:text-gray-400"
          />
        </div>

        <div ref={listRef} id="command-list" role="listbox" className="max-h-[360px] overflow-y-auto p-2">
          {results.length === 0 && <div className="px-3 py-6 text-sm text-gray-500 text-center">Nothing matches &ldquo;{query}&rdquo;. Try a venue, a city, or an invoice number.</div>}
          {results.map((r, i) => (
            <div key={r.id}>
              {(i === 0 || results[i - 1].group !== r.group) && (
                <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400">{r.group}</div>
              )}
              <button
                id={`cmd-${r.id}`}
                role="option"
                aria-selected={i === active}
                onMouseMove={() => { if (i !== active) setSel(i) }}
                onClick={() => choose(i)}
                className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-left text-sm ${i === active ? 'bg-gray-100' : ''}`}
              >
                <Icon name={r.icon} className="w-4 h-4 text-gray-400" />
                <span className="truncate">{r.label}</span>
                {r.hint && <span className="ml-auto pl-3 text-xs text-gray-400 truncate">{r.hint}</span>}
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4 px-5 py-2 border-t border-gray-100 text-[11px] text-gray-400">
          <span>↑↓ to move</span><span>↵ to open</span><span>esc to close</span>
        </div>
      </div>
    </div>
  )
}
