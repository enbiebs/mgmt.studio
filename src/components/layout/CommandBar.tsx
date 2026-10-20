'use client'
// ──────────────────────────────────────────────────────────
//  The ⌘K bar: jump to any page, artist, show, offer, invoice, contract, song, release, person, guest, booking, settlement,
//  bill, budget or post, or do a common action, from anywhere.
//  Only what this person may see is searched (artists they can open, sections they have access to).
// ──────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import { fromDateStr, today } from '@/lib/utils'
import { notify } from '@/lib/notify'
import { dueLabel, parseQuickTodo, taskDestination, todoPrefix } from '@/lib/tasks'
import { recallLastArtist, rememberLastArtist, useMe } from '@/lib/useToday'
import { searchCommands, type Searchable } from '@/lib/command-search'
import { buildRecordEntries, type SearchTarget } from '@/lib/search-records'
import { DRIVE_FOLDERS, folderLink } from '@/lib/drive-links'
import { Icon, type IconName } from '@/components/ui/Icon'
import type { BizSub, MainSection, TourSub } from '@/types'
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

/** Opens a found record: its artist, page and tab, and the show / release / budget when it is one. */
function openTarget(t: SearchTarget) {
  jump(t.clientId, t.section, st => {
    if (t.tourSub) st.setTourSub(t.tourSub)
    if (t.bizSub) st.setBizSub(t.bizSub)
    if (t.songsSub) st.setSongsSub(t.songsSub)
    if (t.legalSub) st.setLegalSub(t.legalSub)
    if (t.contentSub) st.setContentSub(t.contentSub)
    if (t.selectedShowId) st.setSelectedShow(t.selectedShowId)
    if (t.selectedAlbumId) st.setSelectedAlbum(t.selectedAlbumId)
    if (t.selectedBudgetId) st.setSelectedBudget(t.selectedBudgetId)
  })
}

export function CommandBar() {
  const role = useStore(s => s.role)
  const view = useStore(s => s.view)
  const clientId = useStore(s => s.clientId)
  const data = useStore(s => s.data)
  const hasAccess = useStore(s => s.hasAccess)
  const accessibleClientIds = useStore(s => s.accessibleClientIds)
  const me = useMe()
  const nav = useVisibleNav()

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)

  const show = useCallback((initial = '') => {
    returnFocus.current = document.activeElement as HTMLElement | null
    setQuery(initial); setSel(0); setOpen(true)
  }, [])
  const hide = useCallback(() => { setOpen(false); returnFocus.current?.focus?.() }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (open) hide(); else show() }
    }
    // Other parts of the app can open the bar with some text already typed (the event's detail).
    const onOpen = (e: Event) => { const text = (e as CustomEvent<string | undefined>).detail; show(typeof text === 'string' ? text : '') }
    window.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_COMMAND_BAR, onOpen)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener(OPEN_COMMAND_BAR, onOpen) }
  }, [open, show, hide])

  const items = useMemo<Command[]>(() => {
    if (!open) return []
    const out: Command[] = []
    const ids = accessibleClientIds()
    const roster = ids === 'all' ? data.clients : data.clients.filter(c => ids.includes(c.id))
    const current = roster.find(c => c.id === clientId)

    out.push({ id: 'home', group: 'Go to', icon: 'home', label: 'Home', hint: 'All artists and what needs you', run: () => useStore.getState().goToDashboard() })
    if (role === 'manager') out.push({ id: 'company', group: 'Go to', icon: 'team', label: 'Company', hint: 'Your people and what each can open', keywords: 'team people access invite roster', run: () => useStore.getState().goToCompany() })
    if (view === 'studio' && current) {
      for (const g of nav) for (const i of g.items) {
        out.push({ id: `go-${i.key}`, group: 'Go to', icon: i.icon, label: i.label, hint: current.name, run: () => useStore.getState().setSection(i.key) })
      }
    }
    // Actions come right after the pages, so they are easy to find.
    const pasteFor = view === 'studio' && current ? [current] : roster
    for (const c of pasteFor) {
      if (!hasAccess('deals', c.id, true)) continue   // booking offers are Deals & fees
      out.push({
        id: `paste-offer-${c.id}`, group: 'Actions', icon: 'tour', label: `Paste a booking offer for ${c.name}`,
        hint: 'Read an email or PDF into a new booking offer', keywords: 'new offer add email paste',
        run: () => jump(c.id, 'tour', st => { st.setTourSub('offers'); st.requestOfferPaste() }),
      })
    }
    // "New offer for nimino", "Log a deposit for nimino": straight to the form, for the open artist (or each artist you can edit).
    const actFor = view === 'studio' && current ? [current] : roster
    for (const c of actFor) {
      if (hasAccess('deals', c.id, true)) out.push({
        id: `new-offer-${c.id}`, group: 'Actions', icon: 'plus', label: `New offer for ${c.name}`,
        hint: 'Add a booking offer', keywords: 'add create booking offer inquiry hold',
        run: () => jump(c.id, 'tour', st => { st.setTourSub('offers'); st.requestOfferAdd() }),
      })
      if (hasAccess('finance', c.id, true)) out.push({
        id: `log-deposit-${c.id}`, group: 'Actions', icon: 'plus', label: `Log a deposit for ${c.name}`,
        hint: 'Money that arrived, to divide up', keywords: 'add deposit payment income royalty banking',
        run: () => jump(c.id, 'finance', st => { st.setBizSub('banking'); st.requestDepositAdd() }),
      })
    }
    // "Open the trash for nimino": what was deleted lately, to put back
    for (const c of actFor.filter(x => hasAccess('activity', x.id))) {          // (an artist's own login has no Activity page)
      out.push({
        id: `open-trash-${c.id}`, group: 'Actions', icon: 'activity', label: `Open the trash for ${c.name}`,
        hint: 'Deleted lately? Put it back', keywords: 'trash deleted restore undo bin recover',
        run: () => jump(c.id, 'activity', st => st.requestTrash()),
      })
    }
    if (roster.some(c => hasAccess('projects', c.id, true))) {
      out.push({
        id: 'add-todo', group: 'Actions', icon: 'plus', label: 'Add a to-do', hint: 'Type: to-do: call the promoter friday', keywords: 'task reminder note todo',
        run: () => { window.dispatchEvent(new CustomEvent(OPEN_COMMAND_BAR, { detail: 'to-do: ' })) },
      })
    }
    if (role === 'manager') {
      out.push({ id: 'add-client', group: 'Actions', icon: 'plus', label: 'Add a client', hint: 'New artist', run: () => { const s = useStore.getState(); s.goToDashboard(); s.openModal('add-client') } })
    }
    out.push({ id: 'sign-out', group: 'Actions', icon: 'arrow', label: 'Sign out', run: () => { void useStore.getState().signOut() } })

    // The open artist's Drive folders, one keystroke away.
    if (view === 'studio' && current) {
      for (const [key, label] of DRIVE_FOLDERS) {
        const url = folderLink(current, key)
        if (url) out.push({
          id: `folder-${key}`, group: 'Folders', icon: 'folder', label: key === 'root' ? 'Open the artist folder' : `Open the ${label} folder`,
          hint: `${current.name} · Drive`, keywords: 'drive google files folder',
          run: () => { window.open(url, '_blank', 'noopener,noreferrer') },
        })
      }
    }
    for (const c of roster) {
      out.push({ id: `artist-${c.id}`, group: 'Artists', icon: 'home', label: c.name, hint: c.isDemo ? 'Demo artist' : 'Open artist', run: () => useStore.getState().openClient(c.id) })
    }
    for (const c of roster) {
      if (!hasAccess('tour', c.id)) continue
      for (const s of c.tour.shows) {
        if (s.status === 'cancelled') continue
        out.push({
          id: `show-${s.id}`, group: 'Shows', icon: 'calendar', label: place(s.venue, s.city),
          hint: `${c.name} · ${dateText(s.date)}${s.historyOnly ? ' · history' : ''}`,
          run: () => jump(c.id, 'tour', st => { st.setTourSub('tour'); st.setSelectedShow(s.id) }),
        })
      }
    }
    for (const c of roster) {
      if (!hasAccess('deals', c.id)) continue
      const showIds = new Set(c.tour.shows.map(s => s.id))   // an offer that already became a show is found as the show
      for (const o of c.agentData?.offers ?? []) {
        if (o.showId && showIds.has(o.showId)) continue
        out.push({
          id: `offer-${o.id}`, group: 'Offers', icon: 'tour', label: place(o.venue, o.city),
          hint: `${c.name} · ${cap(o.status)} offer · ${dateText(o.date)}`, keywords: `${o.promoter ?? ''} ${o.country ?? ''}`,
          run: () => jump(c.id, 'tour', st => st.setTourSub('offers')),
        })
      }
    }
    for (const c of roster) {
      if (!hasAccess('finance', c.id)) continue
      for (const inv of c.finance?.invoices ?? []) {
        out.push({
          id: `invoice-${inv.id}`, group: 'Invoices', icon: 'finance', label: `${inv.number} · ${inv.to}`,
          hint: `${c.name} · ${cap(inv.status)}`, keywords: `${inv.category} ${inv.toEmail ?? ''}`,
          run: () => jump(c.id, 'finance', st => st.setBizSub('invoices')),
        })
      }
    }
    // Open to-dos and unfinished projects: type a word from one and jump straight to it.
    for (const c of roster) {
      for (const t of c.tasks ?? []) {
        if (t.doneAt) continue
        out.push({
          id: `task-${t.id}`, group: 'To-dos', icon: 'check', label: t.title,
          hint: `${c.name}${t.dueDate ? ` · due ${dueLabel(t.dueDate, today())}` : ''}`, keywords: 'todo task reminder',
          run: () => {
            const to = t.link ? taskDestination(t.link) : { section: 'projects' as MainSection }
            jump(c.id, to.section, st => {
              if ('sub' in to && to.sub) { if (to.section === 'tour') st.setTourSub(to.sub as TourSub); if (to.section === 'finance') st.setBizSub(to.sub as BizSub) }
              if ('showId' in to && to.showId) st.setSelectedShow(to.showId)
            })
          },
        })
      }
      for (const p of c.projects ?? []) {
        if (p.status === 'done' || !hasAccess('projects', c.id)) continue
        out.push({
          id: `project-${p.id}`, group: 'Projects', icon: 'projects', label: p.title,
          hint: `${c.name} · ${p.fromArtist ? 'Artist request' : 'Project'}`, keywords: 'project request',
          run: () => jump(c.id, 'projects'),
        })
      }
    }
    return out
  }, [open, data, clientId, view, role, nav, hasAccess, accessibleClientIds])

  // Contracts, songs, releases, people, guests, travel, settlements, bills, budgets and posts (behind the same access as their pages).
  // They are only searched once something is typed, so the list you see on opening stays short.
  const recordItems = useMemo<Command[]>(() => {
    if (!open) return []
    const ids = accessibleClientIds()
    const roster = ids === 'all' ? data.clients : data.clients.filter(c => ids.includes(c.id))
    return buildRecordEntries(roster, (section, id) => hasAccess(section, id))
      .map(e => ({ id: e.id, group: e.group, icon: e.icon, label: e.label, hint: e.hint, keywords: e.keywords, run: () => openTarget(e.target) }))
  }, [open, data, hasAccess, accessibleClientIds])

  // "to-do: call the promoter friday" shows where it will be filed; Enter files it for you (with an Undo).
  const todoItems = useMemo<Command[]>(() => {
    const typed = open ? todoPrefix(query) : null
    if (!typed) return []
    const ids = accessibleClientIds()
    const roster = (ids === 'all' ? data.clients : data.clients.filter(c => ids.includes(c.id))).filter(c => hasAccess('projects', c.id, true))
    const current = view === 'studio' ? roster.find(c => c.id === clientId) : undefined
    const last = recallLastArtist()
    const targets = current ? [current] : [...roster.filter(c => c.id === last), ...roster.filter(c => c.id !== last)].slice(0, 8)
    const parsed = parseQuickTodo(typed, today())
    return targets.map(c => ({
      id: `todo-${c.id}`, group: 'Add a to-do', icon: 'plus' as IconName, label: `“${parsed.title}”`,
      hint: `${c.name}${parsed.dueDate ? ` · due ${dueLabel(parsed.dueDate, today())}` : ''}${me ? ' · for you' : ''}`,
      run: () => {
        const st = useStore.getState()
        const id = st.addTask(c.id, { title: parsed.title, dueDate: parsed.dueDate, assigneeId: me ?? undefined, source: 'command_bar' })
        if (!id) return
        rememberLastArtist(c.id)
        notify(`To-do added for ${c.name}`, { label: 'Undo', run: () => useStore.getState().deleteTask(c.id, id) })
      },
    }))
  }, [open, query, data, view, clientId, me, hasAccess, accessibleClientIds])

  const results = useMemo(
    () => (todoItems.length > 0 ? todoItems : searchCommands(query.trim() ? [...items, ...recordItems] : items, query)),
    [todoItems, items, recordItems, query],
  )
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
            placeholder="Jump to anything, or type “to-do: …” to add one"
            autoComplete="off"
            className="flex-1 py-4 text-[15px] bg-transparent outline-none placeholder:text-gray-400"
          />
        </div>

        <div ref={listRef} id="command-list" role="listbox" className="max-h-[360px] overflow-y-auto p-2">
          {results.length === 0 && <div className="px-3 py-6 text-sm text-gray-500 text-center">Nothing matches &ldquo;{query}&rdquo;. Try an artist, a venue, a song, a person, a contract or an invoice number.</div>}
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
