'use client'
// ──────────────────────────────────────────────────────────
//  OfferTermsFields — the extra details an offer can carry, as form sections:
//  the show, money beyond the guarantee, terms (production, payments, radius
//  clause) and what's needed to decide. Everything here is also printed on the
//  offer sheet the artist receives.
// ──────────────────────────────────────────────────────────

import { FormField, inputClass, selectClass } from '@/components/ui/Modal'
import { AGE_LIMITS, BILLINGS, maxPotential, paymentsTotalPct, termsFromDraft, type TermsDraft } from '@/lib/offer-terms'

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`

export function OfferTermsFields({ draft, onChange, guarantee }: {
  draft: TermsDraft
  onChange: (d: TermsDraft) => void
  guarantee: number
}) {
  const set = <K extends keyof TermsDraft>(key: K, value: TermsDraft[K]) => onChange({ ...draft, [key]: value })
  const text = (key: keyof TermsDraft, placeholder?: string) => (
    <input
      type="text" className={inputClass} placeholder={placeholder}
      value={draft[key] as string} onChange={e => set(key, e.target.value as never)}
    />
  )
  const number = (key: keyof TermsDraft, placeholder?: string) => (
    <input
      type="number" className={inputClass} placeholder={placeholder}
      value={draft[key] as string} onChange={e => set(key, e.target.value as never)}
    />
  )
  const section = (title: string, children: React.ReactNode) => (
    <div className="pt-3 mt-1 border-t border-gray-100 space-y-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{title}</div>
      {children}
    </div>
  )

  const terms = termsFromDraft(draft)
  const bonusTotal = maxPotential(guarantee, terms)
  const paymentsPct = paymentsTotalPct(terms?.payments)
  const payments = draft.payments

  return (
    <>
      <div className="text-[11px] text-gray-400 pt-1">
        Everything below also appears on the offer sheet the artist gets. The Notes box above never does.
      </div>

      {section('The show', (
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Capacity">{number('capacity', 'e.g. 1000')}</FormField>
          <FormField label="Age limit">
            <select className={selectClass} value={draft.ageLimit} onChange={e => set('ageLimit', e.target.value)}>
              <option value="">—</option>
              {AGE_LIMITS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </FormField>
          <FormField label="Venue type">{text('venueType', 'e.g. Converted warehouse')}</FormField>
          <FormField label="Billing">
            <select className={selectClass} value={draft.billing} onChange={e => set('billing', e.target.value)}>
              <option value="">—</option>
              {BILLINGS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </FormField>
          <FormField label="Doors"><input type="time" className={inputClass} value={draft.doors} onChange={e => set('doors', e.target.value)} /></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Set starts"><input type="time" className={inputClass} value={draft.setStart} onChange={e => set('setStart', e.target.value)} /></FormField>
            <FormField label="Set (min)">{number('setLengthMin', '90')}</FormField>
          </div>
        </div>
      ))}

      {section('Money beyond the guarantee', (
        <>
          <FormField label="Ticket bonuses">
            <div className="space-y-1.5">
              {draft.bonuses.map((b, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-gray-400 w-12">At</span>
                  <input
                    type="number" className={`${inputClass} !w-24`} placeholder="850" value={b.atTickets}
                    onChange={e => set('bonuses', draft.bonuses.map((x, j) => (j === i ? { ...x, atTickets: e.target.value } : x)))}
                  />
                  <span className="text-gray-400">tickets sold, bonus $</span>
                  <input
                    type="number" className={`${inputClass} !w-24`} placeholder="750" value={b.amount}
                    onChange={e => set('bonuses', draft.bonuses.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                  />
                  <button type="button" aria-label="Remove bonus" onClick={() => set('bonuses', draft.bonuses.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-400 px-1">×</button>
                </div>
              ))}
              <button type="button" onClick={() => set('bonuses', [...draft.bonuses, { atTickets: '', amount: '' }])} className="text-xs text-accent hover:underline">+ Add a bonus</button>
              {terms?.bonuses && guarantee > 0 && (
                <div className="text-xs text-gray-500">Most this deal can pay: <b>{money(bonusTotal)}</b> (guarantee plus every bonus)</div>
              )}
            </div>
          </FormField>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Ground transport ($)">{number('groundTransport', '150')}</FormField>
            <FormField label="Hotel ($)">{number('hotel', '200')}</FormField>
            <FormField label="Airfare ($)">{number('airfare')}</FormField>
          </div>
          <div className="text-[11px] text-gray-400 -mt-2">What the promoter contributes toward the artist&apos;s travel.</div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Merch: artist's share (%)">{number('merchArtistPct', '80')}</FormField>
            <FormField label="Merch sold by">
              <select className={selectClass} value={draft.merchSoldBy} onChange={e => set('merchSoldBy', e.target.value)}>
                <option value="">—</option>
                <option value="artist">Artist sells</option>
                <option value="venue">Venue sells</option>
              </select>
            </FormField>
          </div>
        </>
      ))}

      {section('Terms', (
        <>
          <FormField label="Production & backline">{text('production', 'e.g. House production and backline only')}</FormField>
          <FormField label="Hospitality">{text('hospitality', 'e.g. No meal or hospitality buyouts')}</FormField>
          <FormField label="Payment schedule">
            <div className="space-y-1.5">
              {payments.map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <input
                    type="text" className={`${inputClass} flex-1`} placeholder="e.g. 30 days out" value={p.when}
                    onChange={e => set('payments', payments.map((x, j) => (j === i ? { ...x, when: e.target.value } : x)))}
                  />
                  <input
                    type="number" className={`${inputClass} !w-20`} placeholder="%" value={p.pct}
                    onChange={e => set('payments', payments.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)))}
                  />
                  <span className="w-20 text-right text-xs text-gray-400">{p.pct && guarantee ? money((guarantee * Number(p.pct)) / 100) : ''}</span>
                  <button type="button" aria-label="Remove payment" onClick={() => set('payments', payments.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-400 px-1">×</button>
                </div>
              ))}
              <div className="flex items-center gap-3 flex-wrap">
                <button type="button" onClick={() => set('payments', [...payments, { when: '', pct: '' }])} className="text-xs text-accent hover:underline">+ Add a payment</button>
                <span className="text-[11px] text-gray-400">Quick fill:</span>
                <button
                  type="button" className="text-xs text-accent hover:underline"
                  onClick={() => set('payments', [{ when: 'Before announce', pct: '25' }, { when: '30 days out', pct: '25' }, { when: 'Within 7 days after the show', pct: '50' }])}
                >25 / 25 / balance</button>
                <button
                  type="button" className="text-xs text-accent hover:underline"
                  onClick={() => set('payments', [{ when: 'On confirmation', pct: '50' }, { when: 'Day of show', pct: '50' }])}
                >50 / 50</button>
              </div>
              {payments.length > 0 && paymentsPct !== 100 && (
                <div className="text-xs rounded-lg bg-amber-50 text-amber-800 px-2.5 py-1.5">These add up to {paymentsPct}%, not 100%.</div>
              )}
            </div>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Radius clause: miles">{number('radiusMiles', '100')}</FormField>
            <FormField label="…until days after the show">{number('radiusDaysAfter', '60')}</FormField>
          </div>
        </>
      ))}

      {section('To decide', (
        <>
          <FormField label="Routing notes">
            <textarea
              className={`${inputClass} min-h-[64px]`} value={draft.routingNotes} onChange={e => set('routingNotes', e.target.value)}
              placeholder="e.g. Cancun is the next day, 7:30 PM set. No nonstops; connections work but it's a rough turnaround."
            />
          </FormField>
          <FormField label="Alternative dates">{text('alternativeDates', 'e.g. December is open except 12/14')}</FormField>
          <FormField label="Buyer needs an answer by"><input type="date" className={inputClass} value={draft.respondBy} onChange={e => set('respondBy', e.target.value)} /></FormField>
        </>
      ))}
    </>
  )
}
