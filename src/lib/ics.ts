// ──────────────────────────────────────────────────────────
//  Studio · Calendar feed (.ics) generation
//
//  Turns a client's shows into an RFC5545 calendar feed for the
//  /api/calendar/[token] subscription route.
//
//  Show.date/time have no timezone info attached (see Show in
//  types/index.ts and the "local venue times" note on travel_items in
//  supabase/migrations/003_tour_persistence.sql) — the same limitation
//  every other date display in this app already has. So each event is
//  written as a "floating" local time (no TZID, no Z), which most
//  calendar apps show as-is rather than converting across timezones.
// ──────────────────────────────────────────────────────────

import type { Show } from '@/types'

function pad(n: number): string {
  return n < 10 ? '0' + n : String(n)
}

// "2026-08-14" + "20:00" → "20260814T200000"
function toIcsDateTime(date: string, time: string): string {
  const [y, m, d] = date.split('-')
  const [hh, mm] = (time || '00:00').split(':')
  return `${y}${m}${d}T${hh}${mm}00`
}

// Shows have no explicit end time, so DTEND is a fixed 3-hour default.
function addHoursIcs(date: string, time: string, hours: number): string {
  const dt = new Date(`${date}T${(time || '00:00')}:00`)
  dt.setHours(dt.getHours() + hours)
  return `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`
}

function nowUtcStamp(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

function escapeIcsText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

export function buildIcsFeed(clientName: string, shows: Show[]): string {
  const stamp = nowUtcStamp()
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mgmt Studio//Tour Calendar//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeIcsText(clientName)} — Tour Dates`,
  ]
  for (const show of shows) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${show.id}@mgmtstudio`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${toIcsDateTime(show.date, show.time)}`,
      `DTEND:${addHoursIcs(show.date, show.time, 3)}`,
      `SUMMARY:${escapeIcsText(`${show.venue} — ${show.city}`)}`,
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}
