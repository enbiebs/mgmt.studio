'use client'
// ──────────────────────────────────────────────────────────
//  TravelEntryForms — add a flight, hotel or ground booking by hand, with its real
//  details (confirmation code, cost, who it covers comes afterwards on the card).
//  These replaced a "search" that only ever returned made-up results: a made-up price
//  would have flowed into the budget as a real cost.
// ──────────────────────────────────────────────────────────

import { useState } from 'react'
import { uid } from '@/lib/utils'
import type { Currency, TravelFlight, TravelGround, TravelHotel, TravelStatus } from '@/types'

const input = 'w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-accent bg-canvas'

function Field({ label, children, span }: { label: string; children: React.ReactNode; span?: boolean }) {
  return (
    <div className={span ? 'col-span-2' : ''}>
      <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">{label}</label>
      {children}
    </div>
  )
}

// Cost, currency and status are common to every kind of booking.
function CommonFields({ s, set }: { s: Common; set: (patch: Partial<Common>) => void }) {
  return (
    <>
      <Field label="Total cost">
        <div className="flex gap-1.5">
          <input type="number" min={0} value={s.cost} onChange={e => set({ cost: e.target.value })} placeholder="optional" className={input} />
          <select value={s.currency} onChange={e => set({ currency: e.target.value as Currency })} className={`${input} !w-20`}>
            <option>USD</option><option>GBP</option><option>EUR</option>
          </select>
        </div>
      </Field>
      <Field label="Confirmation code">
        <input value={s.confirmationCode} onChange={e => set({ confirmationCode: e.target.value })} className={input} />
      </Field>
      <Field label="Status">
        <select value={s.status} onChange={e => set({ status: e.target.value as TravelStatus })} className={input}>
          <option value="booked">Booked</option>
          <option value="pending">Pending</option>
          <option value="needed">Still needed</option>
        </select>
      </Field>
    </>
  )
}

interface Common { cost: string; currency: Currency; confirmationCode: string; status: TravelStatus }
const COMMON: Common = { cost: '', currency: 'USD', confirmationCode: '', status: 'booked' }
const tail = (c: Common) => ({
  status: c.status,
  confirmationCode: c.confirmationCode.trim() || undefined,
  cost: c.cost !== '' && Number(c.cost) >= 0 ? Number(c.cost) : undefined,
  currency: c.cost !== '' ? c.currency : undefined,
})

function Buttons({ canSave, onSave, onCancel, color }: { canSave: boolean; onSave: () => void; onCancel: () => void; color: string }) {
  return (
    <div className="flex gap-2 mt-3">
      <button onClick={onSave} disabled={!canSave} className={`px-3 py-1.5 text-xs font-semibold text-white rounded-lg disabled:opacity-40 transition-colors ${color}`}>Save</button>
      <button onClick={onCancel} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">Cancel</button>
    </div>
  )
}

export function AddFlightForm({ initialShowId, onSave, onCancel }: {
  initialShowId?: string; onSave: (item: TravelFlight) => void; onCancel: () => void
}) {
  const [f, setF] = useState({ from: '', to: '', airline: '', flightNumber: '', departure: '', arrival: '', cabin: '', traveler: 'Full Party', ...COMMON })
  const set = (patch: Partial<typeof f>) => setF(prev => ({ ...prev, ...patch }))
  const canSave = f.from.trim() !== '' && f.to.trim() !== ''

  function save() {
    onSave({
      id: uid(), showIds: initialShowId ? [initialShowId] : [], kind: 'flight', traveler: f.traveler.trim() || 'Full Party',
      legs: [{
        id: uid(), airline: f.airline.trim() || undefined, flightNumber: f.flightNumber.trim() || undefined,
        from: f.from.trim().toUpperCase(), to: f.to.trim().toUpperCase(),
        departure: f.departure || undefined, arrival: f.arrival || undefined, cabin: f.cabin || undefined,
      }],
      ...tail(f),
    })
  }

  return (
    <div className="border border-blue-100 rounded-xl p-4 bg-blue-50/30">
      <div className="text-xs font-bold text-gray-700 mb-3">✈️ Add a flight</div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="From (airport)"><input value={f.from} onChange={e => set({ from: e.target.value })} placeholder="LAX" className={`${input} uppercase`} /></Field>
        <Field label="To (airport)"><input value={f.to} onChange={e => set({ to: e.target.value })} placeholder="JAX" className={`${input} uppercase`} /></Field>
        <Field label="Airline"><input value={f.airline} onChange={e => set({ airline: e.target.value })} className={input} /></Field>
        <Field label="Flight number"><input value={f.flightNumber} onChange={e => set({ flightNumber: e.target.value })} className={input} /></Field>
        <Field label="Departs"><input type="datetime-local" value={f.departure} onChange={e => set({ departure: e.target.value })} className={input} /></Field>
        <Field label="Arrives"><input type="datetime-local" value={f.arrival} onChange={e => set({ arrival: e.target.value })} className={input} /></Field>
        <Field label="Cabin">
          <select value={f.cabin} onChange={e => set({ cabin: e.target.value })} className={input}>
            <option value="">—</option><option>Economy</option><option>Premium Economy</option><option>Business</option><option>First</option>
          </select>
        </Field>
        <Field label="Who is it for?"><input value={f.traveler} onChange={e => set({ traveler: e.target.value })} className={input} /></Field>
        <CommonFields s={f} set={set} />
      </div>
      <div className="text-[11px] text-gray-400 mt-2">A connection? Save this flight, then use &ldquo;+ Add connecting flight&rdquo; on its card. The cost is for the whole booking.</div>
      <Buttons canSave={canSave} onSave={save} onCancel={onCancel} color="bg-accent hover:bg-accent-hover" />
    </div>
  )
}

export function AddHotelForm({ initialShowId, onSave, onCancel }: {
  initialShowId?: string; onSave: (item: TravelHotel) => void; onCancel: () => void
}) {
  const [f, setF] = useState({ name: '', address: '', phone: '', checkIn: '', checkOut: '', rooms: '', roomType: '', ...COMMON })
  const set = (patch: Partial<typeof f>) => setF(prev => ({ ...prev, ...patch }))
  const canSave = f.name.trim() !== ''

  function save() {
    onSave({
      id: uid(), showIds: initialShowId ? [initialShowId] : [], kind: 'hotel',
      name: f.name.trim(), address: f.address.trim() || undefined, phone: f.phone.trim() || undefined,
      checkIn: f.checkIn || undefined, checkOut: f.checkOut || undefined,
      roomCount: f.rooms !== '' && Number(f.rooms) > 0 ? Number(f.rooms) : undefined, roomType: f.roomType.trim() || undefined,
      ...tail(f),
    })
  }

  return (
    <div className="border border-purple-100 rounded-xl p-4 bg-purple-50/20">
      <div className="text-xs font-bold text-gray-700 mb-3">🏨 Add a hotel</div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Hotel name" span><input value={f.name} onChange={e => set({ name: e.target.value })} className={input} /></Field>
        <Field label="Address" span><input value={f.address} onChange={e => set({ address: e.target.value })} className={input} /></Field>
        <Field label="Check-in"><input type="date" value={f.checkIn} onChange={e => set({ checkIn: e.target.value })} className={input} /></Field>
        <Field label="Check-out"><input type="date" value={f.checkOut} onChange={e => set({ checkOut: e.target.value })} className={input} /></Field>
        <Field label="Rooms"><input type="number" min={1} value={f.rooms} onChange={e => set({ rooms: e.target.value })} className={input} /></Field>
        <Field label="Room type"><input value={f.roomType} onChange={e => set({ roomType: e.target.value })} placeholder="King / Double / Suite" className={input} /></Field>
        <Field label="Phone"><input value={f.phone} onChange={e => set({ phone: e.target.value })} className={input} /></Field>
        <CommonFields s={f} set={set} />
      </div>
      <div className="text-[11px] text-gray-400 mt-2">The cost is for the whole stay, all rooms.</div>
      <Buttons canSave={canSave} onSave={save} onCancel={onCancel} color="bg-purple-600 hover:bg-purple-700" />
    </div>
  )
}

const GROUND_TYPES: { value: TravelGround['type']; label: string }[] = [
  { value: 'transfer', label: 'Transfer / car service' }, { value: 'rental-car', label: 'Rental car' },
  { value: 'train', label: 'Train' }, { value: 'bus', label: 'Bus' },
]

export function AddGroundForm({ initialShowId, onSave, onCancel }: {
  initialShowId?: string; onSave: (item: TravelGround) => void; onCancel: () => void
}) {
  const [f, setF] = useState({ type: 'transfer' as TravelGround['type'], provider: '', from: '', to: '', pickupTime: '', vehicleType: '', ...COMMON })
  const set = (patch: Partial<typeof f>) => setF(prev => ({ ...prev, ...patch }))
  const canSave = f.provider.trim() !== '' || (f.from.trim() !== '' && f.to.trim() !== '')

  function save() {
    onSave({
      id: uid(), showIds: initialShowId ? [initialShowId] : [], kind: 'ground', type: f.type,
      provider: f.provider.trim() || undefined, from: f.from.trim() || undefined, to: f.to.trim() || undefined,
      pickupTime: f.pickupTime || undefined, vehicleType: f.vehicleType.trim() || undefined,
      ...tail(f),
    })
  }

  return (
    <div className="border border-amber-100 rounded-xl p-4 bg-amber-50/20">
      <div className="text-xs font-bold text-gray-700 mb-3">🚐 Add ground transport</div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Type">
          <select value={f.type} onChange={e => set({ type: e.target.value as TravelGround['type'] })} className={input}>
            {GROUND_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="Provider"><input value={f.provider} onChange={e => set({ provider: e.target.value })} placeholder="Company or driver" className={input} /></Field>
        <Field label="From"><input value={f.from} onChange={e => set({ from: e.target.value })} placeholder="Airport / hotel" className={input} /></Field>
        <Field label="To"><input value={f.to} onChange={e => set({ to: e.target.value })} placeholder="Venue / hotel" className={input} /></Field>
        <Field label="Pickup time"><input type="datetime-local" value={f.pickupTime} onChange={e => set({ pickupTime: e.target.value })} className={input} /></Field>
        <Field label="Vehicle"><input value={f.vehicleType} onChange={e => set({ vehicleType: e.target.value })} placeholder="Sprinter van, sedan…" className={input} /></Field>
        <CommonFields s={f} set={set} />
      </div>
      <Buttons canSave={canSave} onSave={save} onCancel={onCancel} color="bg-amber-600 hover:bg-amber-700" />
    </div>
  )
}
