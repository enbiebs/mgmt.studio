'use client'
// ──────────────────────────────────────────────────────────
//  Holds on offers, on screen: the chips on an offer card ("Held until Nov 20 (4 days left)", "2nd hold of 3") and the
//  "Hold" part of the offer form (until when, and our place in line when another promoter holds the same date).
//  The rules live in lib/holds.ts. Hold details are internal: they never go on an offer sheet.
// ──────────────────────────────────────────────────────────

import { useMemo } from 'react'
import { useStore } from '@/lib/store'
import { FormField, inputClass, selectClass } from '@/components/ui/Modal'
import { holdClock, MAX_POSITION, ordinal, otherHoldsOnDate, othersLine, placeLabel, placeTone, type HoldPlace } from '@/lib/holds'
import type { TermsDraft } from '@/lib/offer-terms'
import type { TourOffer } from '@/types'
import { addDays, today as localToday } from '@/lib/utils'

const CLOCK_STYLE = {
  late: 'bg-red-50 text-red-600',
  soon: 'bg-amber-50 text-amber-700',
  ok: 'bg-gray-100 text-gray-500',
  quiet: 'border border-dashed border-gray-300 text-gray-400',
} as const

const PLACE_STYLE = {
  first: 'bg-green-50 text-green-700',
  behind: 'bg-gray-100 text-gray-500',
  check: 'bg-amber-50 text-amber-700',
} as const

/** What an offer card says about a hold: how long is left, and where we stand if others hold the same date. Nothing for an offer that is not on hold. */
export function HoldChips({ offer, place }: { offer: TourOffer; place?: HoldPlace }) {
  const clock = holdClock(offer, localToday())
  if (!clock && !place) return null
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {clock && <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${CLOCK_STYLE[clock.tone]}`}>{clock.label}</span>}
      {place && (
        <span
          className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${PLACE_STYLE[placeTone(place)]}`}
          title={place.others.length > 0 ? `Also on hold for this date: ${place.others.join(', ')}` : undefined}
        >{placeLabel(place)}</span>
      )}
    </div>
  )
}

/** The hold part of the offer form. Shown only while the offer is on hold. */
export function HoldFormFields({ draft, onChange, date, offerId }: {
  draft: TermsDraft
  onChange: (d: TermsDraft) => void
  date: string
  offerId?: string
}) {
  const offers = useStore(s => s.getClient()?.agentData?.offers)
  const today = localToday()
  const others = useMemo(() => otherHoldsOnDate(offers ?? [], date, today, offerId), [offers, date, today, offerId])
  const places = Math.min(MAX_POSITION, Math.max(others.length + 1, Number(draft.holdPosition) || 0))
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-3">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-amber-700">Hold</div>
        <div className="text-[11px] text-gray-500">The promoter is keeping this date for you. Say until when, and you&apos;ll be reminded before it runs out.</div>
      </div>
      <FormField label="Held until">
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" className={`${inputClass} !w-auto`} value={draft.holdUntil} onChange={e => onChange({ ...draft, holdUntil: e.target.value })} />
          {([['In 1 week', 7], ['In 2 weeks', 14]] as const).map(([label, n]) => (
            <button key={n} type="button" onClick={() => onChange({ ...draft, holdUntil: addDays(today, n) })} className="px-2 py-1 border border-gray-200 rounded-lg text-xs hover:bg-gray-50">{label}</button>
          ))}
        </div>
      </FormField>
      {others.length > 0 && (
        <FormField label="Place in line">
          <select className={selectClass} value={draft.holdPosition} onChange={e => onChange({ ...draft, holdPosition: e.target.value })}>
            <option value="">Not ranked yet</option>
            {Array.from({ length: places }, (_, i) => i + 1).map(n => <option key={n} value={String(n)}>{ordinal(n)} hold</option>)}
          </select>
          <div className="text-[11px] text-gray-500 mt-1">Also on hold for this date: {othersLine(others)}.</div>
        </FormField>
      )}
    </div>
  )
}
