// ──────────────────────────────────────────────────────────
//  Geography — where cities are, how far apart, and what that means for a booking:
//    - radius clauses ("no other shows within 100 miles, until 60 days after");
//    - whether getting from one show to the next is realistic.
//
//  Distances are straight-line ("as the crow flies"), which is how radius clauses are normally
//  measured. Travel times are rough estimates, labelled as such.
// ──────────────────────────────────────────────────────────

import { placeKey, dayDiff, type Booking } from '@/lib/intelligence'
import { US_STATES, CA_PROVINCES, AU_STATES, COUNTRY_CODE } from '@/lib/regions'

export interface LatLon { lat: number; lon: number }
export interface Located extends LatLon {
  label: string                              // "Jacksonville, FL, US"
  how: 'exact' | 'name-only' | 'fuzzy'       // how sure the match is
}

// ── Distance ─────────────────────────────────────────────────
export function milesBetween(a: LatLon, b: LatLon): number {
  const R = 3958.8                           // Earth's radius in miles
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

// ── Reading "Jacksonville, FL" / "Berlin, Germany" into what the database can match ──
export interface Region { country?: string; admin1?: string }

/** The readings a written state/country could have. "CA" could be California or Canada: both are tried. */
export function regionAlternatives(token: string): Region[] {
  const t = token.trim().toLowerCase()
  if (!t) return []
  const out: Region[] = []
  if (US_STATES.includes(t)) out.push({ country: 'US', admin1: t.toUpperCase() })
  if (CA_PROVINCES.includes(t)) out.push({ country: 'CA', admin1: t.toUpperCase() })
  if (AU_STATES.includes(t)) out.push({ country: 'AU', admin1: t.toUpperCase() })
  if (COUNTRY_CODE[t]) out.push({ country: COUNTRY_CODE[t] })
  return out
}

export interface PlaceRequest { key: string; name: string; regions: Region[] }

export function placeRequest(city: string): PlaceRequest {
  const k = placeKey(city)
  return { key: city, name: k.name, regions: k.region ? regionAlternatives(k.region) : [] }
}

// ── Is it realistic to get from one show to the next? ────────
export interface TravelVerdict {
  miles: number
  hours: number                              // rough door-to-door estimate
  mode: 'same-city' | 'drive' | 'flight'
  level: 'ok' | 'tight' | 'unrealistic'
}

/** A rough estimate: drive up to ~250 miles, otherwise a flight (3h of airport time + flying). */
export function travelVerdict(miles: number, gapDays: number): TravelVerdict {
  const g = Math.max(0, Math.abs(gapDays))
  const mode: TravelVerdict['mode'] = miles < 15 ? 'same-city' : miles <= 250 ? 'drive' : 'flight'
  const hours = mode === 'same-city' ? 0.5 : mode === 'drive' ? miles / 55 : 3 + miles / 450
  // Time between the two shows that can actually be used for travel: a day is mostly show and sleep.
  const usable = g * 24 - 12
  const level: TravelVerdict['level'] = hours > usable ? 'unrealistic' : hours > usable * 0.5 ? 'tight' : 'ok'
  return { miles: Math.round(miles), hours: Math.round(hours * 10) / 10, mode, level }
}

// ── Radius clauses ───────────────────────────────────────────
export interface RadiusIssue {
  kind: 'this-offer' | 'other-show'          // whose clause is being broken
  booking: Booking
  miles: number
  clauseMiles: number
  until: string                              // the last date the clause covers
}

/**
 * Radius clauses that clash with a date and place.
 *  - "this-offer": the offer's own clause says nothing else within R miles until D days after it; an
 *    existing booking inside that circle and that period clashes.
 *  - "other-show": an existing booking's clause covers the new date and place.
 * When a deal was confirmed is not recorded, so a clause is treated as running from today until its
 * end date (the show date plus the days after).
 */
export function radiusIssues(
  candidate: { date: string; city: string; radius?: { miles: number; daysAfter: number }; key?: string },
  bookings: Booking[],
  where: (city: string) => LatLon | null,
  todayIso: string,
): { issues: RadiusIssue[]; unlocated: string[] } {
  const here = where(candidate.city)
  const issues: RadiusIssue[] = []
  const unlocated = new Set<string>()
  if (!here && candidate.city.trim()) unlocated.add(candidate.city.trim())

  const addDays = (iso: string, n: number) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10)

  for (const b of bookings) {
    if (b.key === candidate.key || b.date < todayIso && candidate.date < todayIso) continue
    const need = (candidate.radius && b.date >= todayIso) || (b.radius && candidate.date >= todayIso)
    if (!need) continue
    const there = where(b.city)
    if (!there || !here) { if (!there && b.city.trim()) unlocated.add(b.city.trim()); continue }
    const miles = milesBetween(here, there)

    // the new offer's own clause
    if (candidate.radius && candidate.radius.miles > 0 && b.date >= todayIso) {
      const until = addDays(candidate.date, candidate.radius.daysAfter)
      if (miles < candidate.radius.miles && b.date <= until && dayDiff(b.date, candidate.date) !== 0) {
        issues.push({ kind: 'this-offer', booking: b, miles: Math.round(miles), clauseMiles: candidate.radius.miles, until })
      }
    }
    // an existing booking's clause
    if (b.radius && b.radius.miles > 0 && candidate.date >= todayIso) {
      const until = addDays(b.date, b.radius.daysAfter)
      if (miles < b.radius.miles && candidate.date <= until && dayDiff(b.date, candidate.date) !== 0) {
        issues.push({ kind: 'other-show', booking: b, miles: Math.round(miles), clauseMiles: b.radius.miles, until })
      }
    }
  }
  return { issues, unlocated: [...unlocated] }
}
