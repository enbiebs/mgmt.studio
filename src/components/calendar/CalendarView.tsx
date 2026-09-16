'use client'
// ──────────────────────────────────────────────────────────
//  Calendar — the front door for a client.
//  One month grid showing every forward-looking date across the whole
//  business (shows, releases, posts, invoices, contracts, projects),
//  instead of six separate section-only calendars. Visually mirrors
//  Content's ManageView grid; the aggregation is new, the grid isn't.
// ──────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import { calendarDays, toDateStr, today, MONTH_NAMES, DOW_SHORT } from '@/lib/utils'
import { getCalendarEvents, CALENDAR_DOMAIN_LABEL, CALENDAR_DOMAIN_STYLE } from '@/lib/calendar'
import type { CalendarEvent, CalendarEventDomain } from '@/lib/calendar'
import type { MainSection } from '@/types'
import { AddShowModal } from '@/components/tour/TourView'
import { PostModal } from '@/components/content/ManageView'
import { AddProjectModal } from '@/components/manager/ProjectsView'

const DOMAIN_SECTION: Record<CalendarEventDomain, MainSection> = {
  show: 'tour', release: 'songs', post: 'content',
  invoice: 'finance', contract: 'legal', project: 'projects',
}
const ALL_DOMAINS: CalendarEventDomain[] = ['show', 'release', 'post', 'invoice', 'contract', 'project']

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

export function CalendarView() {
  const client = useStore(s => s.getClient())
  const hasAccess = useStore(s => s.hasAccess)
  const canEdit = useStore(s => s.canEdit)
  const canEditAny = canEdit('tour') || canEdit('content') || canEdit('projects')
  const { calYear, calMonth, calPrev, calNext, calToday } = useStore()
  const {
    setSection, setTourSub, setContentSub, setBizSub,
    setSelectedShow, setSelectedAlbum,
  } = useStore()
  const [activeDomains, setActiveDomains] = useState<Set<CalendarEventDomain>>(new Set(ALL_DOMAINS))
  const [quickAddDay, setQuickAddDay] = useState<string | null>(null)
  const [creating, setCreating] = useState<{ type: QuickAddType; date: string } | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!quickAddDay) return
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setQuickAddDay(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [quickAddDay])

  if (!client) return null

  const canSee = (domain: CalendarEventDomain) => hasAccess(DOMAIN_SECTION[domain], client.id)
  const creatableTypes = QUICK_ADD_TYPES.filter(t => canEdit(QUICK_ADD_CONFIG[t].section))
  const events = getCalendarEvents(client, canSee).filter(e => activeDomains.has(e.domain))
  const days = calendarDays(calYear, calMonth)
  const todayStr = today()

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
  function openEvent(e: CalendarEvent) {
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
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100">
        <button onClick={calPrev} className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 text-sm transition-colors">‹</button>
        <button onClick={calNext} className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 text-sm transition-colors">›</button>
        <span className="font-serif text-[18px] font-medium">{MONTH_NAMES[calMonth]} {calYear}</span>
        <button onClick={calToday} className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors">Today</button>

        <div className="ml-auto flex items-center gap-1.5">
          {ALL_DOMAINS.filter(canSee).map(domain => {
            const active = activeDomains.has(domain)
            return (
              <button
                key={domain}
                onClick={() => toggleDomain(domain)}
                className={`px-2 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                  active ? CALENDAR_DOMAIN_STYLE[domain] : 'bg-canvas border-gray-200 text-gray-300'
                }`}
              >
                {CALENDAR_DOMAIN_LABEL[domain]}
              </button>
            )
          })}
        </div>
        {canEditAny && <GoogleCalendarPanel clientId={client.id} />}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto p-4">
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
                  !current ? 'bg-gray-50' : isToday ? 'bg-blue-50' : 'bg-canvas'
                }`}
              >
                <div className={`text-xs font-semibold mb-1 ${isToday ? 'text-blue-600' : 'text-gray-400'}`}>{date.getDate()}</div>
                {dayEvents.map(e => (
                  <div
                    key={e.id}
                    onClick={() => openEvent(e)}
                    className={`border-l-2 px-1.5 py-0.5 rounded-r text-[10px] font-semibold mb-0.5 cursor-pointer hover:brightness-95 transition-all truncate ${CALENDAR_DOMAIN_STYLE[e.domain]}`}
                    title={`${CALENDAR_DOMAIN_LABEL[e.domain]} — ${e.title}`}
                  >
                    {e.title}
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
      .then(json => setConnected(!!json.connected))
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
                Shows, Posts, and Projects sync to a dedicated Google Calendar. Editing or deleting them there updates Mgmt Studio too.
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
                className="w-full px-2.5 py-1.5 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
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
