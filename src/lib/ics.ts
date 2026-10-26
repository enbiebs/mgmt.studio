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
import { PRODUCT_NAME } from '@/lib/brand'

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

/** A show's title in a calendar: a held date says HOLD and a cancelled one says CANCELLED, so neither reads as a booking even in apps that ignore status. */
export function showTitle(show: Pick<Show, 'status' | 'venue' | 'city'>): string {
  const base = `${show.venue} — ${show.city}`
  return show.status === 'cancelled' ? `CANCELLED: ${base}` : show.status === 'hold' ? `HOLD: ${base}` : base
}

// A held date goes out as tentative and a cancelled show as cancelled, so a subscriber's calendar never shows either as a confirmed booking.
// (A cancelled event keeps its UID: calendar apps then update or remove the event they already have instead of leaving it behind.)
function statusLines(show: Pick<Show, 'status'>): string[] {
  if (show.status === 'cancelled') return ['STATUS:CANCELLED', 'TRANSP:TRANSPARENT']
  return [show.status === 'hold' ? 'STATUS:TENTATIVE' : 'STATUS:CONFIRMED']
}

// RFC 5545: a line is at most 75 bytes; a longer one continues on the next line after a single space. (Counted in bytes, never splitting a character.)
export function foldLine(line: string): string {
  const out: string[] = []
  let current = ''
  let bytes = 0
  for (const ch of line) {
    const size = new TextEncoder().encode(ch).length
    if (bytes + size > (out.length === 0 ? 75 : 74)) { out.push(current); current = ''; bytes = 0 }
    current += ch
    bytes += size
  }
  out.push(current)
  return out.join('\r\n ')
}

export function buildIcsFeed(clientName: string, shows: Show[]): string {
  const stamp = nowUtcStamp()
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${PRODUCT_NAME}//Tour Calendar//EN`,
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
      `SUMMARY:${escapeIcsText(showTitle(show))}`,
      ...statusLines(show),
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(foldLine).join('\r\n') + '\r\n'
}
