'use client'
// ──────────────────────────────────────────────────────────
//  Travel Booking View
//  Per-show travel management: flights, hotels, ground transport.
//  Shows booking status at a glance, inline add forms,
//  and mock search results (real API integration ready).
// ──────────────────────────────────────────────────────────

import { useState } from 'react'
import { useStore } from '@/lib/store'
import { uid } from '@/lib/utils'
import type {
  Show, TravelItem, TravelFlight, TravelHotel, TravelGround,
  TravelStatus, Currency,
} from '@/types'

// ── Status badge ────────────────────────────────────────────
const STATUS_STYLES: Record<TravelStatus, string> = {
  booked:    'bg-green-50 text-green-700 border border-green-200',
  pending:   'bg-amber-50 text-amber-700 border border-amber-200',
  needed:    'bg-red-50 text-red-600 border border-red-200',
  cancelled: 'bg-gray-100 text-gray-400 border border-gray-200',
}
const STATUS_LABEL: Record<TravelStatus, string> = {
  booked: 'Booked', pending: 'Pending', needed: 'Needed', cancelled: 'Cancelled',
}

function StatusBadge({ status }: { status: TravelStatus }) {
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${STATUS_STYLES[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}

// ── Travel status summary for sidebar ───────────────────────
function showTravelStatus(items: TravelItem[]) {
  if (items.length === 0) return 'none'
  if (items.every(i => i.status === 'booked')) return 'all'
  if (items.some(i => i.status === 'needed')) return 'needed'
  return 'partial'
}

const SHOW_DOT: Record<string, string> = {
  all:     'bg-green-500',
  partial: 'bg-amber-400',
  needed:  'bg-red-500',
  none:    'bg-gray-200',
}

// ── Format helpers ───────────────────────────────────────────
function fmtDate(iso: string | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function fmtDateTime(iso: string | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
}
function fmtCost(cost: number | undefined, currency: Currency | undefined) {
  if (!cost) return ''
  const sym = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$'
  return `${sym}${cost.toLocaleString()}`
}

// ── Flight card ──────────────────────────────────────────────
function FlightCard({ item, onRemove }: { item: TravelFlight; onRemove: () => void }) {
  return (
    <div className="border border-gray-100 rounded-xl p-4 hover:border-gray-200 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-base">✈️</span>
          <div>
            <div className="text-sm font-semibold text-gray-900">
              {item.from ?? '—'} → {item.to ?? '—'}
              {item.fromCity && item.toCity && (
                <span className="text-xs font-normal text-gray-400 ml-1">
                  ({item.fromCity} → {item.toCity})
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {item.airline} {item.flightNumber && `· ${item.flightNumber}`}
              {item.cabin && ` · ${item.cabin}`}
              {item.duration && ` · ${item.duration}`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={item.status} />
          <button
            onClick={onRemove}
            className="text-gray-300 hover:text-red-400 text-xs transition-colors"
          >✕</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3">
        {item.departure && (
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Departs</div>
            <div className="text-xs font-medium text-gray-700">{fmtDateTime(item.departure)}</div>
          </div>
        )}
        {item.arrival && (
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Arrives</div>
            <div className="text-xs font-medium text-gray-700">{fmtDateTime(item.arrival)}</div>
          </div>
        )}
        {item.traveler && (
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Travelers</div>
            <div className="text-xs font-medium text-gray-700">{item.traveler}</div>
          </div>
        )}
        {item.seats && (
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Seats</div>
            <div className="text-xs font-medium text-gray-700">{item.seats}</div>
          </div>
        )}
        {item.confirmationCode && (
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Confirmation</div>
            <div className="text-xs font-mono font-medium text-blue-600">{item.confirmationCode}</div>
          </div>
        )}
        {item.cost && (
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Cost</div>
            <div className="text-xs font-medium text-gray-700">{fmtCost(item.cost, item.currency)}</div>
          </div>
        )}
      </div>
      {item.notes && (
        <div className="mt-2 pt-2 border-t border-gray-50 text-xs text-gray-400 italic">{item.notes}</div>
      )}
    </div>
  )
}

// ── Hotel card ───────────────────────────────────────────────
function HotelCard({ item, onRemove }: { item: TravelHotel; onRemove: () => void }) {
  return (
    <div className="border border-gray-100 rounded-xl p-4 hover:border-gray-200 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-base">🏨</span>
          <div>
            <div className="text-sm font-semibold text-gray-900">{item.name ?? 'Hotel TBD'}</div>
            {item.address && <div className="text-xs text-gray-400 mt-0.5">{item.address}</div>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={item.status} />
          <button
            onClick={onRemove}
            className="text-gray-300 hover:text-red-400 text-xs transition-colors"
          >✕</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3">
        {item.checkIn && (
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Check-In</div>
            <div className="text-xs font-medium text-gray-700">{fmtDate(item.checkIn)}</div>
          </div>
        )}
        {item.checkOut && (
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Check-Out</div>
            <div className="text-xs font-medium text-gray-700">{fmtDate(item.checkOut)}</div>
          </div>
        )}
        {item.roomCount && (
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Rooms</div>
            <div className="text-xs font-medium text-gray-700">{item.roomCount} {item.roomType ? `· ${item.roomType}` : ''}</div>
          </div>
        )}
        {item.phone && (
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Phone</div>
            <div className="text-xs font-medium text-gray-700">{item.phone}</div>
          </div>
        )}
        {item.confirmationCode && (
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Confirmation</div>
            <div className="text-xs font-mono font-medium text-blue-600">{item.confirmationCode}</div>
          </div>
        )}
        {item.cost && (
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Cost</div>
            <div className="text-xs font-medium text-gray-700">{fmtCost(item.cost, item.currency)}</div>
          </div>
        )}
      </div>
      {item.notes && (
        <div className="mt-2 pt-2 border-t border-gray-50 text-xs text-gray-400 italic">{item.notes}</div>
      )}
    </div>
  )
}

// ── Ground card ──────────────────────────────────────────────
const GROUND_EMOJI: Record<string, string> = {
  'rental-car': '🚗',
  'transfer':   '🚐',
  'train':      '🚂',
  'bus':        '🚌',
}

function GroundCard({ item, onRemove }: { item: TravelGround; onRemove: () => void }) {
  const emoji = GROUND_EMOJI[item.type] ?? '🚗'
  const typeLabel = item.type === 'rental-car' ? 'Rental Car' :
                    item.type === 'transfer' ? 'Transfer' :
                    item.type === 'train' ? 'Train' : 'Bus'
  return (
    <div className="border border-gray-100 rounded-xl p-4 hover:border-gray-200 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-base">{emoji}</span>
          <div>
            <div className="text-sm font-semibold text-gray-900">
              {typeLabel}{item.vehicleType ? ` · ${item.vehicleType}` : ''}
            </div>
            {(item.from || item.to) && (
              <div className="text-xs text-gray-400 mt-0.5">
                {item.from}{item.from && item.to ? ' → ' : ''}{item.to}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={item.status} />
          <button
            onClick={onRemove}
            className="text-gray-300 hover:text-red-400 text-xs transition-colors"
          >✕</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3">
        {item.pickupTime && (
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Pickup</div>
            <div className="text-xs font-medium text-gray-700">{fmtDateTime(item.pickupTime)}</div>
          </div>
        )}
        {item.provider && (
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Provider</div>
            <div className="text-xs font-medium text-gray-700">{item.provider}</div>
          </div>
        )}
        {item.confirmationCode && (
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Confirmation</div>
            <div className="text-xs font-mono font-medium text-blue-600">{item.confirmationCode}</div>
          </div>
        )}
        {item.cost && (
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Cost</div>
            <div className="text-xs font-medium text-gray-700">{fmtCost(item.cost, item.currency)}</div>
          </div>
        )}
      </div>
      {item.notes && (
        <div className="mt-2 pt-2 border-t border-gray-50 text-xs text-gray-400 italic">{item.notes}</div>
      )}
    </div>
  )
}

// ── Mock search results ──────────────────────────────────────
const MOCK_FLIGHTS = [
  { airline: 'Delta', number: 'DL 402', cabin: 'Economy', departure: '08:15', arrival: '11:30', duration: '5h 15m', price: 380, stops: 'Nonstop' },
  { airline: 'United', number: 'UA 208', cabin: 'Economy', departure: '10:45', arrival: '14:20', duration: '5h 35m', price: 310, stops: 'Nonstop' },
  { airline: 'American', number: 'AA 719', cabin: 'Business', departure: '07:00', arrival: '10:10', duration: '5h 10m', price: 1240, stops: 'Nonstop' },
  { airline: 'JetBlue', number: 'B6 1045', cabin: 'Economy', departure: '14:30', arrival: '18:55', duration: '6h 25m', price: 265, stops: '1 stop (BOS)' },
]
const MOCK_HOTELS = [
  { name: 'Marriott Downtown', stars: 4, price: 289, perNight: true, distance: '0.3mi to venue' },
  { name: 'Hyatt Place', stars: 4, price: 219, perNight: true, distance: '0.8mi to venue' },
  { name: 'The Autograph Collection', stars: 5, price: 445, perNight: true, distance: '0.5mi to venue' },
]
const MOCK_GROUND = [
  { type: 'Sprinter Van', provider: 'Executive Limo', capacity: 12, price: 450 },
  { type: 'Sedan', provider: 'Uber Charter', capacity: 4, price: 120 },
  { type: 'SUV', provider: 'Black Car Co', capacity: 6, price: 280 },
]

// ── Add form types ───────────────────────────────────────────
type AddMode = null | 'flight' | 'hotel' | 'ground'

// ── Section header ───────────────────────────────────────────
function SectionHeader({
  icon, title, count, onAdd,
}: {
  icon: string; title: string; count: number; onAdd: () => void
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <span className="text-sm">{icon}</span>
        <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">{title}</span>
        {count > 0 && (
          <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5">{count}</span>
        )}
      </div>
      <button
        onClick={onAdd}
        className="text-xs text-blue-500 hover:text-blue-700 font-medium transition-colors"
      >
        + Add
      </button>
    </div>
  )
}

// ── Empty section placeholder ────────────────────────────────
function EmptySlot({ kind, onAdd }: { kind: string; onAdd: () => void }) {
  return (
    <button
      onClick={onAdd}
      className="w-full border-2 border-dashed border-gray-100 rounded-xl p-4 text-center text-xs text-gray-400 hover:border-blue-200 hover:text-blue-400 transition-colors"
    >
      + Add {kind}
    </button>
  )
}

// ── Quick add form ───────────────────────────────────────────
function AddFlightForm({
  showId, onSave, onCancel,
}: {
  showId: string;
  onSave: (item: TravelFlight) => void;
  onCancel: () => void;
}) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [departure, setDeparture] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<typeof MOCK_FLIGHTS | null>(null)

  function doSearch() {
    if (!from || !to) return
    setSearching(true)
    setTimeout(() => { setSearching(false); setResults(MOCK_FLIGHTS) }, 800)
  }

  function pickResult(r: typeof MOCK_FLIGHTS[0]) {
    const dateStr = departure || new Date().toISOString().slice(0, 10)
    onSave({
      id: uid(), showId, kind: 'flight', status: 'booked',
      traveler: 'Full Party',
      airline: r.airline, flightNumber: r.number,
      from: from.toUpperCase(), to: to.toUpperCase(),
      departure: `${dateStr}T${r.departure}`,
      arrival: `${dateStr}T${r.arrival}`,
      duration: r.duration, cabin: r.cabin,
      cost: r.price, currency: 'USD',
    })
  }

  return (
    <div className="border border-blue-100 rounded-xl p-4 bg-blue-50/30">
      <div className="text-xs font-bold text-gray-700 mb-3">✈️ Find Flights</div>
      <div className="grid grid-cols-3 gap-2 mb-2">
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">From</label>
          <input
            value={from} onChange={e => setFrom(e.target.value)}
            placeholder="JFK"
            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-400 bg-canvas uppercase"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">To</label>
          <input
            value={to} onChange={e => setTo(e.target.value)}
            placeholder="LHR"
            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-400 bg-canvas uppercase"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">Date</label>
          <input
            type="date" value={departure} onChange={e => setDeparture(e.target.value)}
            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-400 bg-canvas"
          />
        </div>
      </div>
      <div className="flex gap-2 mb-3">
        <button
          onClick={doSearch}
          disabled={searching || !from || !to}
          className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {searching ? 'Searching…' : 'Search Flights'}
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">Cancel</button>
        <div className="ml-auto text-[10px] text-gray-400 italic self-center">Demo — shows sample results</div>
      </div>

      {results && (
        <div className="space-y-2">
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => pickResult(r)}
              className="w-full text-left border border-gray-200 rounded-lg p-3 bg-canvas hover:border-blue-400 hover:bg-blue-50/30 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <div className="text-xs font-semibold text-gray-800">{r.airline} {r.number}</div>
                    <div className="text-[11px] text-gray-400">{r.stops} · {r.duration} · {r.cabin}</div>
                  </div>
                  <div className="text-[11px] text-gray-600 font-mono">
                    {r.departure} → {r.arrival}
                  </div>
                </div>
                <div className="text-sm font-bold text-gray-900">${r.price}<span className="text-[10px] font-normal text-gray-400">/person</span></div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function AddHotelForm({
  showId, onSave, onCancel,
}: {
  showId: string;
  onSave: (item: TravelHotel) => void;
  onCancel: () => void;
}) {
  const [city, setCity] = useState('')
  const [checkIn, setCheckIn] = useState('')
  const [checkOut, setCheckOut] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<typeof MOCK_HOTELS | null>(null)

  function doSearch() {
    if (!city) return
    setSearching(true)
    setTimeout(() => { setSearching(false); setResults(MOCK_HOTELS) }, 700)
  }

  function pickResult(r: typeof MOCK_HOTELS[0]) {
    onSave({
      id: uid(), showId, kind: 'hotel', status: 'pending',
      name: r.name, checkIn, checkOut,
      cost: r.price, currency: 'USD',
      notes: r.distance,
    })
  }

  return (
    <div className="border border-purple-100 rounded-xl p-4 bg-purple-50/20">
      <div className="text-xs font-bold text-gray-700 mb-3">🏨 Find Hotels</div>
      <div className="grid grid-cols-3 gap-2 mb-2">
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">City</label>
          <input
            value={city} onChange={e => setCity(e.target.value)}
            placeholder="London, UK"
            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-purple-400 bg-canvas"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">Check-In</label>
          <input type="date" value={checkIn} onChange={e => setCheckIn(e.target.value)}
            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-purple-400 bg-canvas" />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">Check-Out</label>
          <input type="date" value={checkOut} onChange={e => setCheckOut(e.target.value)}
            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-purple-400 bg-canvas" />
        </div>
      </div>
      <div className="flex gap-2 mb-3">
        <button
          onClick={doSearch}
          disabled={searching || !city}
          className="px-3 py-1.5 text-xs font-semibold bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
        >
          {searching ? 'Searching…' : 'Search Hotels'}
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">Cancel</button>
        <div className="ml-auto text-[10px] text-gray-400 italic self-center">Demo — shows sample results</div>
      </div>
      {results && (
        <div className="space-y-2">
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => pickResult(r)}
              className="w-full text-left border border-gray-200 rounded-lg p-3 bg-canvas hover:border-purple-400 hover:bg-purple-50/30 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-gray-800">
                    {'⭐'.repeat(r.stars)} {r.name}
                  </div>
                  <div className="text-[11px] text-gray-400">{r.distance}</div>
                </div>
                <div className="text-sm font-bold text-gray-900">${r.price}<span className="text-[10px] font-normal text-gray-400">/night</span></div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function AddGroundForm({
  showId, onSave, onCancel,
}: {
  showId: string;
  onSave: (item: TravelGround) => void;
  onCancel: () => void;
}) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [pickupTime, setPickupTime] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<typeof MOCK_GROUND | null>(null)

  function doSearch() {
    setSearching(true)
    setTimeout(() => { setSearching(false); setResults(MOCK_GROUND) }, 600)
  }

  function pickResult(r: typeof MOCK_GROUND[0]) {
    onSave({
      id: uid(), showId, kind: 'ground', status: 'pending',
      type: r.type === 'Sprinter Van' ? 'transfer' : r.type === 'Sedan' ? 'transfer' : 'rental-car',
      vehicleType: r.type,
      provider: r.provider,
      from, to, pickupTime,
      cost: r.price, currency: 'USD',
    })
  }

  return (
    <div className="border border-green-100 rounded-xl p-4 bg-green-50/20">
      <div className="text-xs font-bold text-gray-700 mb-3">🚐 Ground Transport</div>
      <div className="grid grid-cols-3 gap-2 mb-2">
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">From</label>
          <input value={from} onChange={e => setFrom(e.target.value)} placeholder="Airport / Hotel"
            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-green-400 bg-canvas" />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">To</label>
          <input value={to} onChange={e => setTo(e.target.value)} placeholder="Venue / Hotel"
            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-green-400 bg-canvas" />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">Pickup Time</label>
          <input type="datetime-local" value={pickupTime} onChange={e => setPickupTime(e.target.value)}
            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-green-400 bg-canvas" />
        </div>
      </div>
      <div className="flex gap-2 mb-3">
        <button
          onClick={doSearch}
          disabled={searching}
          className="px-3 py-1.5 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
        >
          {searching ? 'Searching…' : 'Find Options'}
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">Cancel</button>
        <div className="ml-auto text-[10px] text-gray-400 italic self-center">Demo — shows sample options</div>
      </div>
      {results && (
        <div className="space-y-2">
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => pickResult(r)}
              className="w-full text-left border border-gray-200 rounded-lg p-3 bg-canvas hover:border-green-400 hover:bg-green-50/30 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-gray-800">{r.type}</div>
                  <div className="text-[11px] text-gray-400">{r.provider} · Up to {r.capacity} passengers</div>
                </div>
                <div className="text-sm font-bold text-gray-900">${r.price}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Cost summary ─────────────────────────────────────────────
function CostSummary({ items }: { items: TravelItem[] }) {
  const booked = items.filter(i => i.status === 'booked' || i.status === 'pending')
  const total = booked.reduce((sum, i) => sum + (i.cost ?? 0), 0)
  if (!total) return null
  return (
    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
      <span className="text-xs text-gray-400">
        Total booked/pending ({booked.length} item{booked.length !== 1 ? 's' : ''})
      </span>
      <span className="text-sm font-semibold text-gray-800">${total.toLocaleString()}</span>
    </div>
  )
}

// ── Main view ────────────────────────────────────────────────
export function TravelView() {
  const client = useStore(s => s.getClient())
  const { data, clientId } = useStore()
  const [selectedShowId, setSelectedShowId] = useState<string | null>(null)
  const [addMode, setAddMode] = useState<AddMode>(null)

  if (!client) return null

  const shows = client.tour.shows
  const allTravel = client.tour.travel ?? []

  const show: Show | undefined = selectedShowId
    ? shows.find(s => s.id === selectedShowId)
    : shows[0]

  const showTravel = show ? allTravel.filter(t => t.showId === show.id) : []
  const flights = showTravel.filter((t): t is TravelFlight => t.kind === 'flight')
  const hotels  = showTravel.filter((t): t is TravelHotel  => t.kind === 'hotel')
  const ground  = showTravel.filter((t): t is TravelGround => t.kind === 'ground')

  function saveTravelItem(item: TravelItem) {
    if (!clientId) return
    // Optimistic update to store (mutate client.tour.travel in-place)
    const clients = data.clients.map(c => {
      if (c.id !== clientId) return c
      return { ...c, tour: { ...c.tour, travel: [...(c.tour.travel ?? []), item] } }
    })
    useStore.setState({ data: { ...data, clients } })
    setAddMode(null)
  }

  function removeTravelItem(itemId: string) {
    if (!clientId) return
    const clients = data.clients.map(c => {
      if (c.id !== clientId) return c
      return { ...c, tour: { ...c.tour, travel: (c.tour.travel ?? []).filter(t => t.id !== itemId) } }
    })
    useStore.setState({ data: { ...data, clients } })
  }

  const showDate = show ? new Date(show.date) : null
  const dateStr = showDate?.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* ── Sidebar: show list ── */}
      <div className="w-[220px] flex-shrink-0 border-r border-gray-100 flex flex-col">
        <div className="px-4 py-3 border-b border-gray-100">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Shows</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {shows.map(s => {
            const items = allTravel.filter(t => t.showId === s.id)
            const tStatus = showTravelStatus(items)
            const d = new Date(s.date)
            const needed = items.filter(i => i.status === 'needed').length
            const total = items.length
            return (
              <button
                key={s.id}
                onClick={() => { setSelectedShowId(s.id); setAddMode(null) }}
                className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${show?.id === s.id ? 'bg-blue-50' : ''}`}
              >
                <div className="flex items-start gap-2">
                  <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${SHOW_DOT[tStatus]}`} />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-gray-800 truncate">{s.venue}</div>
                    <div className="text-[11px] text-gray-400">
                      {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {s.city}
                    </div>
                    <div className="text-[10px] mt-0.5">
                      {tStatus === 'none' && <span className="text-gray-300">No travel added</span>}
                      {tStatus === 'all' && <span className="text-green-600">All booked ({total})</span>}
                      {tStatus === 'partial' && <span className="text-amber-600">{needed} needed · {total} total</span>}
                      {tStatus === 'needed' && <span className="text-red-500">{needed} item{needed !== 1 ? 's' : ''} needed</span>}
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Totals across all shows */}
        <div className="px-4 py-3 border-t border-gray-100">
          <div className="text-[10px] text-gray-400 mb-1 font-medium uppercase tracking-wide">All Shows</div>
          <div className="text-xs text-gray-600">
            {allTravel.filter(t => t.status === 'booked').length} booked ·{' '}
            <span className="text-red-500">{allTravel.filter(t => t.status === 'needed').length} needed</span>
          </div>
        </div>
      </div>

      {/* ── Main panel ── */}
      <div className="flex-1 overflow-y-auto">
        {!show ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">No shows available</div>
        ) : (
          <div className="max-w-2xl mx-auto py-6 px-6">
            {/* Show header */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{show.venue}</h2>
                <div className="text-sm text-gray-400">{dateStr} · {show.city}</div>
              </div>
              <div className="flex items-center gap-2">
                {flights.length + hotels.length + ground.length > 0 && (
                  <div className="text-xs text-gray-400">
                    {[
                      flights.length > 0 && `${flights.length} flight${flights.length !== 1 ? 's' : ''}`,
                      hotels.length > 0 && `${hotels.length} hotel${hotels.length !== 1 ? 's' : ''}`,
                      ground.length > 0 && `${ground.length} ground`,
                    ].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
            </div>

            {/* ── Flights section ── */}
            <div className="mb-6">
              <SectionHeader
                icon="✈️" title="Flights" count={flights.length}
                onAdd={() => setAddMode(addMode === 'flight' ? null : 'flight')}
              />
              <div className="space-y-2">
                {flights.map(f => (
                  <FlightCard key={f.id} item={f} onRemove={() => removeTravelItem(f.id)} />
                ))}
                {flights.length === 0 && addMode !== 'flight' && (
                  <EmptySlot kind="flight" onAdd={() => setAddMode('flight')} />
                )}
                {addMode === 'flight' && (
                  <AddFlightForm
                    showId={show.id}
                    onSave={item => saveTravelItem(item)}
                    onCancel={() => setAddMode(null)}
                  />
                )}
              </div>
            </div>

            {/* ── Hotels section ── */}
            <div className="mb-6">
              <SectionHeader
                icon="🏨" title="Hotel" count={hotels.length}
                onAdd={() => setAddMode(addMode === 'hotel' ? null : 'hotel')}
              />
              <div className="space-y-2">
                {hotels.map(h => (
                  <HotelCard key={h.id} item={h} onRemove={() => removeTravelItem(h.id)} />
                ))}
                {hotels.length === 0 && addMode !== 'hotel' && (
                  <EmptySlot kind="hotel" onAdd={() => setAddMode('hotel')} />
                )}
                {addMode === 'hotel' && (
                  <AddHotelForm
                    showId={show.id}
                    onSave={item => saveTravelItem(item)}
                    onCancel={() => setAddMode(null)}
                  />
                )}
              </div>
            </div>

            {/* ── Ground section ── */}
            <div className="mb-6">
              <SectionHeader
                icon="🚐" title="Ground Transport" count={ground.length}
                onAdd={() => setAddMode(addMode === 'ground' ? null : 'ground')}
              />
              <div className="space-y-2">
                {ground.map(g => (
                  <GroundCard key={g.id} item={g} onRemove={() => removeTravelItem(g.id)} />
                ))}
                {ground.length === 0 && addMode !== 'ground' && (
                  <EmptySlot kind="ground transport" onAdd={() => setAddMode('ground')} />
                )}
                {addMode === 'ground' && (
                  <AddGroundForm
                    showId={show.id}
                    onSave={item => saveTravelItem(item)}
                    onCancel={() => setAddMode(null)}
                  />
                )}
              </div>
            </div>

            <CostSummary items={showTravel} />

            {/* Push to advance banner */}
            <div className="mt-6 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-gray-700">Push to Advance</div>
                <div className="text-xs text-gray-400">Sync hotel + flight details into the show's advance → logistics</div>
              </div>
              <button className="px-3 py-1.5 text-xs font-semibold bg-gray-900 text-canvas rounded-lg hover:bg-gray-700 transition-colors">
                Sync to Advance →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
