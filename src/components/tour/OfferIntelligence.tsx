'use client'
// ──────────────────────────────────────────────────────────
//  OfferIntelligence — "What we know" under an offer: what else is booked on and around the date,
//  and what this artist has been paid in the city and at the venue before. Computed live from the
//  artist's own records as the form is edited (see lib/intelligence.ts); nothing is guessed.
// ──────────────────────────────────────────────────────────

import { useEffect, useMemo } from 'react'
import { useStore } from '@/lib/store'
import { financeSettings } from '@/lib/budget'
import { bookingsOf, conflictsFor, feeHistory, summarize, vsMedian, type Booking } from '@/lib/intelligence'
import { milesBetween, radiusIssues, travelVerdict } from '@/lib/geo'
import { useLocated } from '@/lib/places'
import { fromDateStr, today } from '@/lib/utils'
import type { Client, Currency } from '@/types'

const long = (iso: string) => fromDateStr(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const money = (n: number, c: Currency) => `${c === 'GBP' ? '£' : c === 'EUR' ? '€' : '$'}${Math.round(n).toLocaleString('en-US')}`
const what = (b: Booking) => `${b.venue}${b.city ? `, ${b.city}` : ''} (${b.kind === 'offer' ? `${b.status} offer` : `${b.status} show`})`
const gapLabel = (gap: number) => {
  const n = Math.abs(gap)
  return n === 1 ? (gap < 0 ? 'The day before' : 'The day after') : `${n} days ${gap < 0 ? 'before' : 'after'}`
}

export function OfferIntelligence({ client, date, city, venue, guarantee, radius, excludeOfferId, excludeShowId }: {
  client: Client
  date: string
  city: string
  venue: string
  guarantee: number          // US dollars, as the offer form holds it
  radius?: { miles: number; daysAfter: number }     // the radius clause typed into the form, if any
  excludeOfferId?: string
  excludeShowId?: string
}) {
  const fxRates = useStore(s => s.fxRates)
  const loadFxRates = useStore(s => s.loadFxRates)
  useEffect(() => { loadFxRates().catch(console.error) }, [loadFxRates])

  const home = financeSettings(client).homeCurrency
  const todayIso = today()
  const all = useMemo(() => bookingsOf(client, { offerId: excludeOfferId, showId: excludeShowId }), [client, excludeOfferId, excludeShowId])
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date)
  const near = useMemo(() => (validDate ? conflictsFor(all, date) : null), [all, date, validDate])
  // Only look up the cities that matter: this one, the ones within 3 days, and (when a radius clause is
  // involved either way) every upcoming booking.
  const upcoming = all.filter(b => b.date >= todayIso)
  const radiusAtPlay = !!radius || upcoming.some(b => b.radius)
  const cities = [city, ...(near ? [...near.sameDay, ...near.nearby].map(b => b.city) : []), ...(radiusAtPlay ? upcoming.map(b => b.city) : [])].filter(c => c.trim())
  const places = useLocated(cities)
  const radiusResult = useMemo(
    () => (validDate && city.trim() && radiusAtPlay ? radiusIssues({ date, city, radius }, all, places.where, todayIso) : null),
    // places.loading flips when the lookup lands, which is what re-runs this
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [validDate, city, date, radius?.miles, radius?.daysAfter, all, radiusAtPlay, todayIso, places.loading],
  )
  const info = useMemo(() => {
    const exclude = { offerId: excludeOfferId, showId: excludeShowId }
    const conflicts = near
    const hist = feeHistory(client, { city, venue }, fxRates, home, todayIso, exclude)
    return { conflicts, hist, cityStats: summarize(hist.inCity), venueStats: summarize(hist.atVenue), hasAnyFees: client.tour.shows.some(s => s.status === 'confirmed' && (s.guarantee ?? 0) > 0) }
  }, [client, near, city, venue, fxRates, home, todayIso, excludeOfferId, excludeShowId])

  if (!date && !city.trim()) return null

  const current = guarantee > 0 ? Math.round(home === 'USD' ? guarantee : guarantee * (fxRates[home] ? 1 / fxRates[home] : 1)) : 0
  const pct = vsMedian(current, info.cityStats)
  const { conflicts } = info

  return (
    <div className="rounded-xl border border-gray-100 p-3 space-y-2.5 text-xs">
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">What we know</div>

      {conflicts && conflicts.sameDay.length > 0 && (
        <div className="rounded-lg border border-red-200 text-red-600 px-2.5 py-2">
          <div className="font-semibold">Already booked on this date</div>
          {conflicts.sameDay.map(b => <div key={b.key}>{what(b)}</div>)}
        </div>
      )}
      {conflicts && conflicts.sameDay.length === 0 && conflicts.nearby.length === 0 && (
        <div className="text-gray-500">Nothing else is booked within 3 days of this date.</div>
      )}
      {conflicts && conflicts.nearby.length > 0 && (
        <div className="space-y-0.5">
          <div className="font-semibold text-gray-600">Around that date</div>
          {conflicts.nearby.map(b => {
            const a = places.where(city), z = places.where(b.city)
            const tv = a && z ? travelVerdict(milesBetween(a, z), b.gap) : null
            return (
              <div key={b.key} className="text-gray-500">
                <span className="text-gray-400">{gapLabel(b.gap)}:</span> {what(b)}
                {tv && (
                  <span className={tv.level === 'unrealistic' ? 'text-red-600 font-medium' : tv.level === 'tight' ? 'text-amber-700 font-medium' : 'text-gray-400'}>
                    {' '}· {tv.miles.toLocaleString('en-US')} miles
                    {tv.mode === 'same-city' ? ', same city' : tv.mode === 'drive' ? `, about ${tv.hours}h by road` : `, needs a flight (about ${tv.hours}h)`}
                    {tv.level === 'unrealistic' ? ' - not realistic in that time' : tv.level === 'tight' ? ' - tight' : ''}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {radiusResult && (
        <div className="space-y-0.5">
          <div className="font-semibold text-gray-600">Radius clauses</div>
          {radiusResult.issues.length === 0 ? (
            <div className="text-gray-500">No clash found{radius ? ` with this offer's ${radius.miles}-mile clause` : ''}{upcoming.some(b => b.radius) ? ' or with the clauses on your other bookings' : ''}.</div>
          ) : radiusResult.issues.map((i, n) => (
            <div key={n} className="rounded-lg border border-red-200 text-red-600 px-2.5 py-1.5">
              {i.kind === 'this-offer'
                ? `This offer's ${i.clauseMiles}-mile clause (until ${long(i.until)}) overlaps ${what(i.booking)} on ${long(i.booking.date)}, ${i.miles} miles away.`
                : `${i.booking.venue}${i.booking.city ? `, ${i.booking.city}` : ''} has a ${i.clauseMiles}-mile clause (until ${long(i.until)}) that covers this city: ${i.miles} miles away.`}
            </div>
          ))}
          <div className="text-[10px] text-gray-300">Straight-line distances. When a deal was confirmed isn&apos;t recorded, so each clause is treated as running from today.</div>
        </div>
      )}
      {(() => {
        const missing = [...new Set([...(radiusResult?.unlocated ?? []), ...cities.filter(c => places.get(c) === null)])]
        const guess = city.trim() ? places.get(city) : undefined
        return (
          <>
            {guess && guess.how !== 'exact' && (
              <div className="text-gray-400">&ldquo;{city}&rdquo; was read as {guess.label}{guess.how === 'fuzzy' ? ' (spelling looked different)' : ''}. If that&apos;s wrong, add the state or country.</div>
            )}
            {missing.length > 0 && (
              <div className="text-gray-400">Couldn&apos;t find on the map: {missing.join('; ')}. Their distances aren&apos;t checked.</div>
            )}
          </>
        )
      })()}

      {city.trim() && (
        <div className="space-y-0.5">
          <div className="font-semibold text-gray-600">What you&apos;ve been paid in {city.split(',')[0].trim()}</div>
          {info.cityStats ? (
            <>
              <div className="text-gray-500">
                {info.cityStats.count} show{info.cityStats.count === 1 ? '' : 's'}
                {info.cityStats.count > 1 ? `: ${money(info.cityStats.min, home)} to ${money(info.cityStats.max, home)}, typically ${money(info.cityStats.median, home)}` : `: ${money(info.cityStats.median, home)}`}.
                {' '}Last: {long(info.cityStats.last.date)} at {info.cityStats.last.venue} for {money(info.cityStats.last.fee, home)}
                {info.cityStats.last.currency !== home ? ` (${money(info.cityStats.last.original, info.cityStats.last.currency)})` : ''}
                {info.cityStats.last.upcoming ? ' (upcoming)' : ''}.
              </div>
              {pct !== null && current > 0 && (
                <div className={pct < -5 ? 'text-amber-700 font-medium' : pct > 5 ? 'text-green-600 font-medium' : 'text-gray-500'}>
                  This offer ({money(current, home)}) is {pct === 0 ? 'in line with' : `${Math.abs(pct)}% ${pct < 0 ? 'below' : 'above'}`} your typical fee here.
                </div>
              )}
            </>
          ) : (
            <div className="text-gray-500">
              {info.hasAnyFees ? `No confirmed shows recorded in ${city.split(',')[0].trim()} yet.` : 'No show history in the app yet. Import your past calendar (Tour → Import, with past shows ticked) to compare fees.'}
            </div>
          )}
        </div>
      )}

      {venue.trim() && info.venueStats && (
        <div className="text-gray-500">
          <span className="font-semibold text-gray-600">At {info.venueStats.last.venue}:</span>{' '}
          {info.venueStats.count} time{info.venueStats.count === 1 ? '' : 's'}, last {long(info.venueStats.last.date)} for {money(info.venueStats.last.fee, home)}.
        </div>
      )}

      <div className="text-[10px] text-gray-300">
        From the shows recorded in the app; city locations from GeoNames (CC BY 4.0). Fees are guarantees{home !== 'USD' ? `, shown in ${home}` : ''}; other currencies are converted at today&apos;s rates{info.hist.missingRates.length > 0 ? ` (no rate yet for ${info.hist.missingRates.join(', ')}, counted 1:1)` : ''}.
      </div>
    </div>
  )
}
