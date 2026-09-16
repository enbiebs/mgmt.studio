'use client'
// ──────────────────────────────────────────────────────────
//  Calendar — the front door for a client.
//  One month grid showing every forward-looking date across the whole
//  business (shows, releases, posts, invoices, contracts, projects),
//  instead of six separate section-only calendars. Visually mirrors
//  Content's ManageView grid; the aggregation is new, the grid isn't.
// ──────────────────────────────────────────────────────────

import { useState } from 'react'
import { useStore } from '@/lib/store'
import { calendarDays, toDateStr, today, MONTH_NAMES, DOW_SHORT } from '@/lib/utils'
import { getCalendarEvents, CALENDAR_DOMAIN_LABEL, CALENDAR_DOMAIN_STYLE } from '@/lib/calendar'
import type { CalendarEvent, CalendarEventDomain } from '@/lib/calendar'
import type { MainSection } from '@/types'

const DOMAIN_SECTION: Record<CalendarEventDomain, MainSection> = {
  show: 'tour', release: 'songs', post: 'content',
  invoice: 'business', contract: 'legal', project: 'projects',
}
const ALL_DOMAINS: CalendarEventDomain[] = ['show', 'release', 'post', 'invoice', 'contract', 'project']

export function CalendarView() {
  const client = useStore(s => s.getClient())
  const hasAccess = useStore(s => s.hasAccess)
  const { calYear, calMonth, calPrev, calNext, calToday } = useStore()
  const {
    setSection, setTourSub, setContentSub, setBizSub,
    setSelectedShow, setSelectedAlbum,
  } = useStore()
  const [activeDomains, setActiveDomains] = useState<Set<CalendarEventDomain>>(new Set(ALL_DOMAINS))

  if (!client) return null

  const canSee = (domain: CalendarEventDomain) => hasAccess(DOMAIN_SECTION[domain], client.id)
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
      setSection('business'); setBizSub('invoices')
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
                className={`relative min-h-[88px] p-1.5 ${
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
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
