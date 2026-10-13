// ──────────────────────────────────────────────────────────
//  Pasted offers — the parts that don't need a server: what the AI reads out of an offer
//  email / PDF / Word file, and how that becomes the values the offer form starts with.
//
//  The AI only reads. Everything it returns is checked and turned into plain form values
//  here, and the person sees the filled-in form (with a list of things to check) before
//  anything is saved.
// ──────────────────────────────────────────────────────────

import type { OfferBonus, OfferPayment, OfferTerms } from '@/types'
import { makeConverter, type FxRates } from '@/lib/budget'
import { AGE_LIMITS, BILLINGS, paymentsTotalPct } from '@/lib/offer-terms'
import { today } from '@/lib/utils'

export type PasteCurrency = 'USD' | 'GBP' | 'EUR' | 'AUD' | 'CAD' | 'JPY' | 'other' | 'not stated'

// What the AI read, in the offer's OWN currency. "Not written" is "" for text and 0 for
// numbers (-1 for the merch split, where 0% is a real answer).
export interface OfferReading {
  venue: string; city: string; country: string
  date: string                 // YYYY-MM-DD, or ""
  promoter: string
  currency: PasteCurrency
  guarantee: number; doorSplitPct: number; buyout: number
  agencyName: string
  summary: string
  capacity: number
  ageLimit: string; venueType: string; billing: string
  doors: string; setStart: string; setLengthMin: number     // "21:00" (24-hour)
  bonuses: { atTickets: number; amount: number }[]
  groundTransport: number; hotel: number; airfare: number
  merchArtistPct: number; merchSoldBy: string
  production: string; hospitality: string
  payments: { when: string; pct: number }[]
  radiusMiles: number; radiusDaysAfter: number
  routingNotes: string; alternativeDates: string; respondBy: string
  checkThese: string[]
}

// The values the offer form starts with (money in US dollars, which is all the form holds).
export interface OfferPrefill {
  venue: string; city: string; country: string; date: string; promoter: string
  guarantee?: number; door?: number; buyout?: number
  notes?: string
  viaAgency?: boolean; agencyName?: string
  terms?: OfferTerms
}

const text = (s: string) => (s.trim() === '' ? undefined : s.trim())
const pos = (n: number) => (Number.isFinite(n) && n > 0 ? n : undefined)
const isoDate = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim())
  if (!m) return undefined
  const d = new Date(`${s.trim()}T00:00:00Z`)
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s.trim() ? s.trim() : undefined
}
const hhmm = (s: string) => (/^([01]?\d|2[0-3]):[0-5]\d$/.test(s.trim()) ? s.trim() : undefined)

const SYMBOL: Record<string, string> = { USD: '$', GBP: '£', EUR: '€' }
const moneyLabel = (amount: number, currency: string) =>
  `${SYMBOL[currency] ?? currency + ' '}${amount.toLocaleString('en-US')}`

export function toPrefill(r: OfferReading, rates: FxRates): { prefill: OfferPrefill; notices: string[] } {
  const notices: string[] = []
  const { convert } = makeConverter(rates)

  // ── Money: the form holds US dollars only ──
  const cur = r.currency
  const hasMoney = r.guarantee > 0 || r.buyout > 0 || r.groundTransport > 0 || r.hotel > 0 || r.airfare > 0 || r.bonuses.some(b => b.amount > 0)
  let toUsd: ((n: number) => number | undefined) = n => n
  let currencyNote: string | undefined
  if (hasMoney) {
    if (cur === 'USD') {
      // as is
    } else if (cur === 'not stated') {
      notices.push("The offer doesn't say which currency the money is in - I've assumed US dollars.")
    } else if ((cur === 'GBP' || cur === 'EUR') && rates[cur] > 0) {
      const rate = rates[cur]
      toUsd = n => Math.round(convert(n, cur, 'USD'))
      currencyNote = `Offer was ${moneyLabel(r.guarantee, cur)}`
      notices.push(`This offer is in ${cur}. The form only holds US dollars, so every amount was converted at today's rate (1 ${cur} = $${rate.toFixed(2)}). Change them if the contract says otherwise.`)
    } else {
      toUsd = () => undefined
      currencyNote = `Offer was ${r.guarantee > 0 ? moneyLabel(r.guarantee, cur === 'other' ? '' : cur).trim() : 'in another currency'}`
      notices.push(`This offer is in ${cur === 'other' ? 'a currency the app can\'t convert' : cur}, and the form only holds US dollars. I left the money boxes empty and put the original amount in the notes - type in the dollar amounts yourself.`)
    }
  }
  const usd = (n: number) => (pos(n) ? toUsd(n) : undefined)

  // ── Date ──
  const date = isoDate(r.date) ?? ''
  if (!date) notices.push("I couldn't find the show date - please enter it.")
  else if (date < today()) notices.push(`The date in this offer (${date}) has already passed - check it.`)

  // ── Terms ──
  const bonuses: OfferBonus[] = r.bonuses
    .map(b => ({ atTickets: pos(b.atTickets), amount: usd(b.amount) }))
    .filter((b): b is OfferBonus => !!b.atTickets && !!b.amount)
  const payments: OfferPayment[] = r.payments
    .map(p => ({ when: p.when.trim(), pct: pos(p.pct) }))
    .filter((p): p is OfferPayment => p.when !== '' && !!p.pct)
  if (payments.length > 0 && Math.round(paymentsTotalPct(payments)) !== 100) {
    notices.push(`The payment schedule adds up to ${paymentsTotalPct(payments)}%, not 100% - check it.`)
  }
  const respondBy = isoDate(r.respondBy)
  const merchPct = r.merchArtistPct >= 0 && r.merchArtistPct <= 100 && (r.merchSoldBy !== '' || r.merchArtistPct > 0) ? r.merchArtistPct : undefined

  const rawTerms: OfferTerms = {
    capacity: pos(r.capacity),
    ageLimit: AGE_LIMITS.includes(r.ageLimit) ? r.ageLimit : undefined,
    venueType: text(r.venueType),
    billing: BILLINGS.includes(r.billing) ? r.billing : undefined,
    doors: hhmm(r.doors), setStart: hhmm(r.setStart), setLengthMin: pos(r.setLengthMin),
    bonuses,
    groundTransport: usd(r.groundTransport), hotel: usd(r.hotel), airfare: usd(r.airfare),
    merchArtistPct: merchPct,
    merchSoldBy: r.merchSoldBy === 'artist' || r.merchSoldBy === 'venue' ? r.merchSoldBy : undefined,
    production: text(r.production), hospitality: text(r.hospitality),
    payments,
    radiusMiles: pos(r.radiusMiles), radiusDaysAfter: pos(r.radiusDaysAfter),
    routingNotes: text(r.routingNotes), alternativeDates: text(r.alternativeDates), respondBy,
  }
  const terms = Object.fromEntries(
    Object.entries(rawTerms).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0)),
  ) as OfferTerms

  // ── The offer ──
  const guarantee = usd(r.guarantee)
  const notes = [currencyNote, text(r.summary)].filter(Boolean).join(' · ')
  const prefill: OfferPrefill = {
    venue: r.venue.trim(), city: r.city.trim(), country: r.country.trim(), date, promoter: r.promoter.trim(),
    guarantee, door: pos(r.doorSplitPct), buyout: usd(r.buyout),
    notes: notes || undefined,
    viaAgency: text(r.agencyName) ? true : undefined, agencyName: text(r.agencyName),
    terms: Object.keys(terms).length > 0 ? terms : undefined,
  }

  for (const c of r.checkThese) if (c.trim()) notices.push(c.trim())
  return { prefill, notices }
}
