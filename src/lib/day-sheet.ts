// ──────────────────────────────────────────────────────────
//  The day sheet (and the advance sheet sent to a venue): what is known about one show, laid out in sections. The screen and the PDF both
//  draw from this, so they can never disagree. Pure logic (no store, no screen), covered by scripts/check-day-sheet.ts.
//
//  The sheet is for the crew and the venue, so it NEVER carries money: no fee, deposit, commission, payment or invoice, by design and with
//  no switch to add them. It also leaves out the show's private notes.
// ──────────────────────────────────────────────────────────

import type { AdvanceContact, Show, ShowAdvance } from '@/types'
import { looksLikeEmail, MAILTO_LIMIT } from '@/lib/email-address'

export interface DaySheetRow { label: string; value: string }
export type DaySheetKey = 'schedule' | 'hotel' | 'venue' | 'catering' | 'travel' | 'contacts' | 'notes'
export interface DaySheetSection { key: DaySheetKey; title: string; rows: DaySheetRow[]; note?: string }

export interface DaySheet {
  kind: 'daysheet' | 'advance'
  artist: string
  venue: string
  city: string
  dateLine: string               // "Friday, November 6, 2026"
  weather?: string
  sections: DaySheetSection[]
  hasAdvance: boolean            // false when nothing has been filled in for this show yet
}

const clean = (s?: string) => (s ?? '').trim()
/** Rows that have something to say (a blank value is left out, so the sheet only shows what is known). */
const rows = (pairs: [string, string | undefined][]): DaySheetRow[] => pairs.map(([label, v]) => ({ label, value: clean(v) })).filter(r => r.value !== '')

const dateLineOf = (iso: string) => new Date(iso.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

export function buildDaySheet(artist: string, show: Show, advance: ShowAdvance | undefined, kind: DaySheet['kind'] = 'daysheet'): DaySheet {
  const sections: DaySheetSection[] = []
  const add = (key: DaySheetKey, title: string, r: DaySheetRow[], note?: string) => { if (r.length > 0 || clean(note)) sections.push({ key, title, rows: r, ...(clean(note) ? { note: clean(note) } : {}) }) }

  if (advance) {
    const s = advance.schedule ?? {}, h = advance.hospitality ?? {}, p = advance.production ?? {}, l = advance.logistics ?? {}
    add('schedule', 'Schedule', rows([
      ['Bus Call', s.busCall], ['Lobby Call', s.lobbyCall], ['Load In', s.loadIn], ['Line Check', s.lineCheck], ['Soundcheck', s.soundcheck],
      ['Artist SC', s.artistSoundcheck], ['Doors', s.doorsOpen], ['Support On', s.supportOn], ['Support Off', s.supportOff],
      ['Headline On', s.headlineOn], ['Curfew', s.curfew], ['Load Out', s.loadOut], ['Bus Departure', s.departureTime],
    ]), s.notes)

    if (clean(h.hotel)) add('hotel', 'Hotel', rows([
      ['Hotel', h.hotel], ['Address', h.hotelAddress], ['Phone', h.hotelPhone], ['Confirmation', h.hotelConfirmation],
      ['Check-In', h.checkIn], ['Check-Out', h.checkOut], ['Rooms', h.roomCount],
    ]), h.roomNotes)

    add('venue', 'Venue / Production', rows([
      ['Address', l.loadingDockAddress], ['Stage', [p.stageWidth, p.stageDepth, p.roofHeight].map(clean).filter(Boolean).join(' × ')],
      ['FOH', p.fohPosition], ['Monitors', p.monPosition], ['Power', p.powerSupply], ['Local Crew', p.localCrewCount],
      ['Parking', l.parkingInstructions], ['Bus Parking', l.busParking],
    ]), p.backlineNotes)

    if (clean(h.cateringCompany) || clean(h.mealTimes)) add('catering', 'Catering', rows([
      ['Catering', h.cateringCompany], ['Meal Times', h.mealTimes], ['Dietary', h.dietaryNotes],
      ['Runner', [clean(h.runnerName), clean(h.runnerPhone)].filter(Boolean).join(' ')], ['Dressing Rm', h.dressingRooms],
    ]))

    if (clean(l.flights) || clean(l.groundTransport)) add('travel', 'Travel', rows([['Flights', l.flights], ['Airport', l.nearestAirport], ['Ground', l.groundTransport]]))

    // A contact counts when ANY of its name, phone or email is filled in (a line like "Security — 0123" is still worth showing).
    const contacts = (advance.contacts ?? []).filter((c: AdvanceContact) => clean(c.name) || clean(c.phone) || clean(c.email))
    if (contacts.length > 0) {
      sections.push({
        key: 'contacts', title: 'Contacts',
        rows: contacts.map(c => ({
          label: clean(c.role) || 'Contact',
          value: [clean(c.name), [clean(c.phone), clean(c.email)].filter(Boolean).join(' · ')].filter(Boolean).join(' — '),
        })),
      })
    }

    const wifi = clean(advance.wifi) ? `${clean(advance.wifi)}${clean(advance.wifiPassword) ? ` / ${clean(advance.wifiPassword)}` : ''}` : ''
    add('notes', 'Notes', rows([['WiFi', wifi], ['Guest List', clean(advance.guestListCap) ? `Cap: ${clean(advance.guestListCap)}` : '']]),
      [advance.guestListNotes, advance.generalNotes].map(clean).filter(Boolean).join('\n'))
  }

  return {
    kind, artist, venue: show.venue, city: show.city, dateLine: dateLineOf(show.date),
    ...(advance && clean(advance.weatherNotes) ? { weather: clean(advance.weatherNotes) } : {}),
    sections, hasAdvance: sections.length > 0,
  }
}

/** A file name for the PDF: "Day sheet - Mascolo - Fabric - 2026-11-06.pdf" (no characters a computer would refuse). */
export function daySheetFileName(sheet: DaySheet, isoDate: string): string {
  const part = (s: string) => s.replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
  const head = sheet.kind === 'advance' ? 'Advance' : 'Day sheet'
  return `${[head, part(sheet.artist), part(sheet.venue), isoDate.slice(0, 10)].filter(Boolean).join(' - ')}.pdf`
}

/**
 * A link that opens the person's own email program with a message to the venue's contacts, so the advance really goes out by email from
 * their own address. The PDF is attached by hand (a link cannot attach a file), so the message says so. `null` when there is nobody to write to.
 */
export function advanceMailto(sheet: DaySheet, contacts: AdvanceContact[]): string | null {
  const to = [...new Set(contacts.map(c => clean(c.email).toLowerCase()).filter(looksLikeEmail))]
  if (to.length === 0) return null
  const subject = `Advance: ${sheet.artist} at ${sheet.venue}, ${sheet.dateLine}`
  const schedule = sheet.sections.find(s => s.key === 'schedule')?.rows ?? []
  const head = `Hi,\n\nHere is the advance for ${sheet.artist} at ${sheet.venue} on ${sheet.dateLine}. The PDF is attached. Please look it over and tell us what is wrong or missing.\n`
  const tail = '\nThank you!'
  const fits = (b: string) => `mailto:${to.join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(b)}`.length <= MAILTO_LIMIT
  let body = head + (schedule.length > 0 ? '\nSchedule:\n' : '')
  for (const r of schedule) {
    const next = `${body}${r.label}: ${r.value}\n`
    if (!fits(next + tail)) break
    body = next
  }
  if (!fits(body + tail)) body = head                       // even the plain message is too long (a very long venue name): send just the short note
  return `mailto:${to.join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body + tail)}`
}
