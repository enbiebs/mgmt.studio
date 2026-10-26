'use client'
// ──────────────────────────────────────────────────────────
//  Calendar — the front door for a client.
//  One month grid showing every forward-looking date across the whole
//  business (shows, releases, posts, invoices, contracts, projects),
//  instead of six separate section-only calendars. Visually mirrors
//  Content's ManageView grid; the aggregation is new, the grid isn't.
//  With `roster`, the same grid shows every artist this person can open, each date named for its artist ("All artists" → Calendar).
// ──────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import { calendarDays, toDateStr, today, MONTH_NAMES, DOW_SHORT } from '@/lib/utils'
import { getCalendarEvents, canSeeCalendarDomain, CALENDAR_DOMAIN_LABEL, CALENDAR_DOMAIN_STYLE } from '@/lib/calendar'
import { findClashes, clashLine } from '@/lib/calendar-clashes'
import type { CalendarEvent, CalendarEventDomain } from '@/lib/calendar'
import type { MainSection } from '@/types'
import { AddShowModal } from '@/components/tour/TourView'
import { PostModal } from '@/components/content/ManageView'
import { AddProjectModal } from '@/components/manager/ProjectsView'
import { SetupChecklist } from '@/components/calendar/SetupChecklist'
import { PRODUCT_NAME } from '@/lib/brand'
import { useRosterClients } from '@/components/layout/nav'

// How an event looks from its date state: played or finished things fade, a cancelled show is struck through,
// and a deadline that has passed unfinished is outlined in red. The same wording is used everywhere ("Overdue", "Cancelled").
const stateClass = (e: CalendarEvent) =>
  `${e.state === 'done' ? 'opacity-50' : ''} ${e.cancelled ? 'line-through' : ''} ${e.state === 'overdue' ? 'ring-1 ring-red-400' : ''}`
const stateWord = (e: CalendarEvent) => (e.cancelled ? 'Cancelled' : e.state === 'overdue' ? 'Overdue' : e.state === 'soon' ? 'Due soon' : '')

const ALL_DOMAINS: CalendarEventDomain[] = ['show', 'offer', 'release', 'post', 'invoice', 'contract', 'project', 'bill']

// Quick-add on the calendar grid itself only covers the three record types
// that have few enough required fields to create with a single lightweight
// form (venue/date/time; title/date/type; title/type) — Invoices and
// Contracts need real structured data (line items, counterparty) and keep
// going through their own section's full creation flow.
type QuickAddType = 'show' | 'post' | 'project'
const QUICK_ADD_CONFIG: Record<QuickAddType, { label: string; section: MainSection }> = {
  show:    { label: 'Show',    section: 'tour' },
  post:    { label: 'Post',    section: 'content' },
  project: { label: 'Project', section: 'projects' },
}
const QUICK_ADD_TYPES: QuickAddType[] = ['show', 'post', 'project']

/** A date on the calendar; in the all-artists view it also says whose it is. */
type RosterEvent = CalendarEvent & { clientId?: string; clientName?: string }

export function CalendarView({ roster = false }: { roster?: boolean } = {}) {
  const ownClient = useStore(s => s.getClient())
  const everyone = useRosterClients()
  const hasAccess = useStore(s => s.hasAccess)
  const role = useStore(s => s.role)
  const canEdit = useStore(s => s.canEdit)
  const canEditAny = canEdit('tour') || canEdit('content') || canEdit('projects')
  const { calYear, calMonth, calPrev, calNext, calToday } = useStore()
  const {
    openClient, setSection, setTourSub, setContentSub, setBizSub,
    setSelectedShow, setSelectedAlbum,
  } = useStore()
  const [activeDomains, setActiveDomains] = useState<Set<CalendarEventDomain>>(new Set(ALL_DOMAINS))
  const [quickAddDay, setQuickAddDay] = useState<string | null>(null)
  const [creating, setCreating] = useState<{ type: QuickAddType; date: string } | null>(null)
  const [allClashes, setAllClashes] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!quickAddDay) return
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setQuickAddDay(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [quickAddDay])

  const client = roster ? null : ownClient
  const shown = roster ? everyone : ownClient ? [ownClient] : []
  if (shown.length === 0) {
    return roster ? <div className="flex-1 flex items-center justify-center text-sm text-gray-400">No artists you can open yet.</div> : null
  }

  // A kind of date has a filter button when at least one artist shown lets this person see it.
  const canSee = (domain: CalendarEventDomain) => shown.some(c => canSeeCalendarDomain(domain, c.id, role, hasAccess))
  // Quick-add needs one artist to add to, so the all-artists view has none.
  const creatableTypes = roster ? [] : QUICK_ADD_TYPES.filter(t => canEdit(QUICK_ADD_CONFIG[t].section))
  const everything: RosterEvent[] = shown
    .flatMap(c => getCalendarEvents(c, d => canSeeCalendarDomain(d, c.id, role, hasAccess))
      .map(e => (roster ? { ...e, id: `${c.id}:${e.id}`, clientId: c.id, clientName: c.name } : e)))
  const events = everything.filter(e => activeDomains.has(e.domain))
  // Clashes are worked out from every date this person can see, so hiding a kind with the filter buttons never hides a warning.
  const clashes = findClashes(everything, today())
  const clashIds = new Set(clashes.flatMap(c => c.ids))
  const CLASH_SHOWN = 3
  const showClashes = allClashes ? clashes : clashes.slice(0, CLASH_SHOWN)
  const showMonth = (date: string) => useStore.setState({ calYear: Number(date.slice(0, 4)), calMonth: Number(date.slice(5, 7)) - 1 })
  const eventTitle = (e: RosterEvent) => (e.clientName ? `${e.clientName} · ${e.title}` : e.title)
  const days = calendarDays(calYear, calMonth)
  const todayStr = today()
  // On a phone the month grid is too small to read, so the same events are shown day by day.
  const monthPrefix = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`
  const monthEvents = events.filter(e => e.date.startsWith(monthPrefix)).sort((a, b) => a.date.localeCompare(b.date))
  const agendaDays = [...new Set(monthEvents.map(e => e.date))]
  const dayLabel = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  function toggleDomain(domain: CalendarEventDomain) {
    setActiveDomains(prev => {
      const next = new Set(prev)
      if (next.has(domain)) next.delete(domain)
      else next.add(domain)
      return next
    })
  }

  // setSection() resets selectedShowId, so it must run before the
  // selection setters below, not after.
  function openEvent(e: RosterEvent) {
    if (e.clientId) openClient(e.clientId)
    if (e.domain === 'show' && e.showId) {
      setSection('tour'); setSelectedShow(e.showId); setTourSub('advance')
    } else if (e.domain === 'release' && e.albumId) {
      setSection('songs'); setSelectedAlbum(e.albumId)
    } else if (e.domain === 'post') {
      setSection('content'); setContentSub('manage')
    } else if (e.domain === 'invoice') {
      setSection('finance'); setBizSub('invoices')
    } else if (e.domain === 'contract') {
      setSection('legal')
    } else if (e.domain === 'project') {
      setSection('projects')
    } else if (e.domain === 'bill') {
      setSection('finance'); setBizSub('payments')
    } else if (e.domain === 'offer') {
      setSection('tour'); setTourSub('offers')
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex flex-wrap items-center gap-2.5 px-3 md:px-5 py-3 md:py-3.5 border-b border-gray-100">
        <button onClick={calPrev} className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 text-sm transition-colors">‹</button>
        <button onClick={calNext} className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 text-sm transition-colors">›</button>
        <span className="font-serif text-[18px] font-medium">{MONTH_NAMES[calMonth]} {calYear}</span>
        <button onClick={calToday} className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors">Today</button>

        <div className="order-last basis-full md:order-none md:basis-auto md:ml-auto flex items-center gap-1.5 overflow-x-auto pb-0.5 md:pb-0">
          {ALL_DOMAINS.filter(canSee).map(domain => {
            const active = activeDomains.has(domain)
            return (
              <button
                key={domain}
                onClick={() => toggleDomain(domain)}
                className={`px-2 py-1 rounded-full text-[11px] font-semibold border transition-colors flex-shrink-0 ${
                  active ? CALENDAR_DOMAIN_STYLE[domain] : 'bg-canvas border-gray-200 text-gray-300'
                }`}
              >
                {CALENDAR_DOMAIN_LABEL[domain]}
              </button>
            )
          })}
        </div>
        {client && canEditAny && <GoogleCalendarPanel clientId={client.id} />}
      </div>

      {clashes.length > 0 && (
        <div role="status" aria-label="Dates to check" className="flex-shrink-0 border-b border-amber-100 bg-amber-50 px-3 py-2 md:px-5">
          <div className="text-xs font-semibold text-amber-800">⚠ {clashes.length === 1 ? '1 date to check' : `${clashes.length} dates to check`}</div>
          <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
            {showClashes.map(c => (
              <li key={`${c.clientId ?? ''}|${c.date}`}>
                <button onClick={() => showMonth(c.date)} className="text-left text-xs text-amber-900 hover:underline">{clashLine(c, dayLabel(c.date))}</button>
              </li>
            ))}
          </ul>
          {clashes.length > CLASH_SHOWN && (
            <button onClick={() => setAllClashes(v => !v)} className="mt-1 text-xs font-medium text-amber-800 hover:underline">{allClashes ? 'Show fewer' : `Show the other ${clashes.length - CLASH_SHOWN}`}</button>
          )}
        </div>
      )}

      {client && <SetupChecklist client={client} />}

      {/* Phone: the month as a day-by-day list */}
      <div className="md:hidden flex-1 overflow-auto px-3 py-3">
        {agendaDays.length === 0 && (
          <div className="py-10 text-center text-sm text-gray-400">Nothing scheduled in {MONTH_NAMES[calMonth]}.</div>
        )}
        {agendaDays.map(d => (
          <div key={d} className="mb-4">
            <div className={`text-[11px] font-bold uppercase tracking-wider mb-1.5 ${d === todayStr ? 'text-accent' : 'text-gray-400'}`}>
              {dayLabel(d)}{d === todayStr && ' · Today'}
            </div>
            <div className="space-y-1.5">
              {monthEvents.filter(e => e.date === d).map(e => (
                <button
                  key={e.id}
                  onClick={() => openEvent(e)}
                  className={`w-full text-left border-l-[3px] rounded-r-lg px-3 py-2 ${CALENDAR_DOMAIN_STYLE[e.domain]} ${stateClass(e)}`}
                >
                  <div className="text-sm font-semibold leading-snug">{clashIds.has(e.id) && <span role="img" aria-label="Check this date" title="Check this date">⚠ </span>}{eventTitle(e)}</div>
                  <div className="text-[11px] opacity-75">{CALENDAR_DOMAIN_LABEL[e.domain]}{e.subtitle ? ` · ${e.subtitle}` : ''}{stateWord(e) ? ` · ${stateWord(e)}` : ''}</div>
                </button>
              ))}
            </div>
          </div>
        ))}
        {creatableTypes.length > 0 && (
          <div className="flex items-center gap-2 pt-2 pb-4">
            {creatableTypes.map(t => (
              <button
                key={t}
                onClick={() => setCreating({ type: t, date: todayStr.startsWith(monthPrefix) ? todayStr : `${monthPrefix}-01` })}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium"
              >
                + {QUICK_ADD_CONFIG[t].label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Desktop: the month grid */}
      <div className="hidden md:block flex-1 overflow-auto p-4">
        <div className="grid grid-cols-7 gap-px bg-gray-100 border border-gray-100 rounded-xl overflow-hidden">
          {DOW_SHORT.map(d => (
            <div key={d} className="bg-gray-50 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-gray-400">{d}</div>
          ))}
          {days.map(({ date, current }, i) => {
            const dStr = toDateStr(date)
            const isToday = dStr === todayStr
            const dayEvents = events.filter(e => e.date === dStr)
            return (
              <div
                key={i}
                className={`relative min-h-[88px] p-1.5 group ${
                  !current ? 'bg-gray-50' : isToday ? 'bg-accent-soft' : 'bg-canvas'
                }`}
              >
                <div className={`text-xs font-semibold mb-1 ${isToday ? 'text-accent' : 'text-gray-400'}`}>{date.getDate()}</div>
                {dayEvents.map(e => (
                  <div
                    key={e.id}
                    onClick={() => openEvent(e)}
                    className={`border-l-2 px-1.5 py-0.5 rounded-r text-[10px] font-semibold mb-0.5 cursor-pointer hover:brightness-95 transition-all truncate ${CALENDAR_DOMAIN_STYLE[e.domain]} ${stateClass(e)}`}
                    title={`${CALENDAR_DOMAIN_LABEL[e.domain]} — ${eventTitle(e)}${stateWord(e) ? ` (${stateWord(e)})` : ''}${clashIds.has(e.id) ? ' — check this date: it clashes with something else' : ''}`}
                  >
                    {clashIds.has(e.id) && <span role="img" aria-label="Check this date">⚠ </span>}{eventTitle(e)}
                  </div>
                ))}
                {creatableTypes.length > 0 && (
                  <button
                    onClick={() => setQuickAddDay(v => v === dStr ? null : dStr)}
                    className="absolute top-1 right-1 w-5 h-5 rounded flex items-center justify-center text-gray-300 opacity-0 group-hover:opacity-100 hover:bg-gray-100 hover:text-gray-500 transition-all text-sm"
                  >
                    +
                  </button>
                )}
                {quickAddDay === dStr && (
                  <div ref={popoverRef} className="absolute right-1 top-7 bg-canvas border border-gray-100 rounded-lg shadow-lg min-w-[120px] overflow-hidden z-50">
                    {creatableTypes.map(t => (
                      <button
                        key={t}
                        onClick={() => { setCreating({ type: t, date: dStr }); setQuickAddDay(null) }}
                        className={`block w-full text-left px-3 py-1.5 text-xs font-medium hover:bg-gray-50 transition-colors ${CALENDAR_DOMAIN_STYLE[t].split(' ').find(c => c.startsWith('text-'))}`}
                      >
                        + {QUICK_ADD_CONFIG[t].label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {creating?.type === 'show'    && <AddShowModal    defaultDate={creating.date} onClose={() => setCreating(null)} />}
      {creating?.type === 'post'    && <PostModal        defaultDate={creating.date} onClose={() => setCreating(null)} />}
      {creating?.type === 'project' && <AddProjectModal defaultDueDate={creating.date} onClose={() => setCreating(null)} />}
    </div>
  )
}

// ── Google Calendar connection panel ────────────────────────
// Real two-way sync (Stage 1: connect/disconnect + push Mgmt Studio →
// Google; pulling changes back is a later stage). Mirrors the existing
// one-way .ics feed panel in TourView.tsx, styled the same way.
function GoogleCalendarPanel({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false)
  const [connected, setConnected] = useState<boolean | null>(null)
  const [configured, setConfigured] = useState(true)
  const [busy, setBusy] = useState(false)
  // Lazy initializer (runs once, during render, not as an effect) — reads
  // the one-time redirect params Google's OAuth callback may have left on
  // the URL, so opening this straight from a fresh page load still shows
  // the result of that connect attempt.
  const [message, setMessage] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    const params = new URLSearchParams(window.location.search)
    if (params.get('google_calendar_connected') === clientId) return 'Connected!'
    if (params.get('google_calendar_error')) return 'Something went wrong connecting — try again.'
    return null
  })
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('google_calendar_connected') || params.get('google_calendar_error')) {
      window.history.replaceState(null, '', window.location.pathname)
    }
    fetch(`/api/google-calendar/status?clientId=${clientId}`)
      .then(res => res.json())
      .then(json => { setConnected(!!json.connected); setConfigured(json.configured !== false) })
      .catch(() => setConnected(false))
  }, [clientId])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function connect() {
    setBusy(true)
    try {
      const res = await fetch('/api/google-calendar/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not start connecting')
      window.location.href = json.url
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not start connecting')
      setBusy(false)
    }
  }

  async function disconnect() {
    setBusy(true)
    try {
      await fetch('/api/google-calendar/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })
      setConnected(false)
      setMessage(null)
    } finally {
      setBusy(false)
    }
  }

  // Not set up yet (no Google keys on the server): there is nothing useful to click.
  if (!configured && !connected) return null

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"
      >
        📆 Google Calendar
      </button>
      {open && (
        <div ref={panelRef} className="absolute right-0 top-full mt-1 bg-canvas border border-gray-100 rounded-xl shadow-lg p-3 w-72 z-50 text-xs">
          {connected === null ? (
            <div className="text-gray-400">Checking…</div>
          ) : connected ? (
            <>
              <div className="text-gray-500 mb-2">
                Shows, Posts, and Projects sync to a dedicated Google Calendar. Editing or deleting them there updates {PRODUCT_NAME} too.
              </div>
              <button
                onClick={disconnect}
                disabled={busy}
                className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg font-medium text-red-400 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {busy ? 'Disconnecting…' : 'Disconnect'}
              </button>
            </>
          ) : (
            <>
              <div className="text-gray-500 mb-2">
                Connect a Google Calendar for this client — Shows, Posts, and Projects will sync both ways.
              </div>
              <button
                onClick={connect}
                disabled={busy}
                className="w-full px-2.5 py-1.5 bg-accent text-white font-medium rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {busy ? 'Connecting…' : 'Connect Google Calendar'}
              </button>
            </>
          )}
          {message && <div className="mt-2 text-gray-400">{message}</div>}
        </div>
      )}
    </div>
  )
}
