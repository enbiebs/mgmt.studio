'use client'
// ──────────────────────────────────────────────────────────
//  OffersView — Tour subtab: booking offer pipeline, routing
//  calendar, and settlements (pre-Shows negotiation stage).
// ──────────────────────────────────────────────────────────

import { useState } from 'react'
import { useStore } from '@/lib/store'
import { Modal, FormField, inputClass } from '@/components/ui/Modal'
import type { TourOffer, OfferStatus } from '@/types'

const ALL_STATUSES: OfferStatus[] = ['inquiry', 'hold', 'confirmed', 'settled', 'cancelled']

const STATUS_CONFIG: Record<OfferStatus, { label: string; color: string; bg: string; dot: string }> = {
  inquiry:   { label: 'Inquiry',   color: 'text-gray-500',  bg: 'bg-gray-50',   dot: 'bg-gray-400'  },
  hold:      { label: 'Hold',      color: 'text-amber-700', bg: 'bg-amber-50',  dot: 'bg-amber-400' },
  confirmed: { label: 'Confirmed', color: 'text-green-700', bg: 'bg-green-50',  dot: 'bg-green-500' },
  settled:   { label: 'Settled',   color: 'text-blue-700',  bg: 'bg-blue-50',   dot: 'bg-blue-500'  },
  cancelled: { label: 'Cancelled', color: 'text-red-500',   bg: 'bg-red-50',    dot: 'bg-red-400'   },
}

const PIPELINE_STAGES: OfferStatus[] = ['inquiry', 'hold', 'confirmed']

function fmt(n: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

type AgentTab = 'pipeline' | 'settled' | 'routing'

export function OffersView() {
  const client = useStore(s => s.getClient())
  const editable = useStore(s => s.canEdit('tour'))
  const [tab, setTab] = useState<AgentTab>('pipeline')
  const [addOpen, setAddOpen] = useState(false)
  const [editingOffer, setEditingOffer] = useState<TourOffer | null>(null)

  if (!client) return null
  const offers = client.agentData?.offers ?? []

  const pipeline   = offers.filter(o => PIPELINE_STAGES.includes(o.status))
  const settled    = offers.filter(o => o.status === 'settled')
  const cancelled  = offers.filter(o => o.status === 'cancelled')
  const confirmed  = offers.filter(o => o.status === 'confirmed')

  // Stats
  const totalGuarantee = confirmed.reduce((s, o) => s + o.guarantee + (o.buyout ?? 0), 0)
  const settledTotal   = settled.reduce((s, o) => s + (o.netPayout ?? o.guarantee), 0)
  const pendingCount   = offers.filter(o => o.status === 'inquiry' || o.status === 'hold').length

  return (
    <div className="flex-1 overflow-auto">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-gray-100">
        <div className="flex items-end justify-between mb-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Booking</div>
            <h2 className="text-xl font-semibold">{client.name} — Tour Offers</h2>
          </div>
          <div className="flex items-end gap-4">
            <div className="flex gap-3">
              <StatPill label="Confirmed value" value={fmt(totalGuarantee)} color="text-green-700" />
              <StatPill label="Pending decisions" value={String(pendingCount)} color="text-amber-700" />
              <StatPill label="Settled YTD" value={fmt(settledTotal)} color="text-blue-700" />
            </div>
            {editable && (
              <button
                onClick={() => setAddOpen(true)}
                className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
              >
                + Add offer
              </button>
            )}
          </div>
        </div>
        {/* Tabs */}
        <div className="flex gap-0.5">
          {([['pipeline', 'Active Pipeline'], ['routing', 'Routing Calendar'], ['settled', 'Settled / History']] as const).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t ? 'bg-gray-900 text-canvas' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {tab === 'pipeline' && <PipelineTab offers={pipeline} editable={editable} onEdit={setEditingOffer} />}
        {tab === 'routing'  && <RoutingTab  offers={offers.filter(o => o.status !== 'cancelled')} editable={editable} onEdit={setEditingOffer} />}
        {tab === 'settled'  && <HistoryTab  settled={settled} cancelled={cancelled} />}
      </div>

      {(addOpen || editingOffer) && (
        <OfferFormModal
          initial={editingOffer}
          onClose={() => { setAddOpen(false); setEditingOffer(null) }}
        />
      )}
    </div>
  )
}

// ── Add / Edit offer modal ──────────────────────────────────
function OfferFormModal({ initial, onClose }: { initial: TourOffer | null; onClose: () => void }) {
  const { addOffer, updateOffer, deleteOffer } = useStore()
  const [f, setF] = useState({
    venue: initial?.venue ?? '', city: initial?.city ?? '', country: initial?.country ?? '',
    date: initial?.date ?? '', promoter: initial?.promoter ?? '',
    guarantee: String(initial?.guarantee ?? ''), door: String(initial?.door ?? ''), buyout: String(initial?.buyout ?? ''),
    notes: initial?.notes ?? '',
  })

  function handleSave() {
    if (!f.venue || !f.city || !f.date || !f.promoter || !f.guarantee) return
    const patch = {
      venue: f.venue, city: f.city, country: f.country, date: f.date, promoter: f.promoter,
      guarantee: Number(f.guarantee), door: f.door ? Number(f.door) : undefined, buyout: f.buyout ? Number(f.buyout) : undefined,
      notes: f.notes || undefined,
    }
    if (initial) updateOffer(initial.id, patch)
    else addOffer(patch)
    onClose()
  }

  function handleStatusChange(status: OfferStatus) {
    if (!initial) return
    updateOffer(initial.id, { status })
  }

  function handleDelete() {
    if (!initial) return
    deleteOffer(initial.id)
    onClose()
  }

  return (
    <Modal title={initial ? 'Edit offer' : 'Add an offer'} onClose={onClose} footer={
      <>
        {initial && (
          <button onClick={handleDelete} className="px-3 py-1.5 text-sm text-red-400 hover:text-red-500 mr-auto">Delete</button>
        )}
        <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
        <button onClick={handleSave} className="px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600">
          {initial ? 'Save' : 'Add offer'}
        </button>
      </>
    }>
      {initial && (
        <FormField label="Status">
          <div className="flex items-center bg-gray-100 rounded-full p-0.5 text-xs gap-0.5 w-fit flex-wrap">
            {ALL_STATUSES.map(s => (
              <button
                key={s}
                onClick={() => handleStatusChange(s)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                  initial.status === s ? `${STATUS_CONFIG[s].bg} ${STATUS_CONFIG[s].color}` : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {STATUS_CONFIG[s].label}
              </button>
            ))}
          </div>
          {initial.status !== 'confirmed' && !initial.showId && (
            <div className="text-[11px] text-gray-400 mt-1">Moving this to Confirmed will automatically create the Show.</div>
          )}
        </FormField>
      )}
      <FormField label="Venue"><input type="text" className={inputClass} value={f.venue} onChange={e => setF(p => ({...p, venue: e.target.value}))} /></FormField>
      <FormField label="City"><input type="text" className={inputClass} value={f.city} onChange={e => setF(p => ({...p, city: e.target.value}))} /></FormField>
      <FormField label="Country"><input type="text" className={inputClass} value={f.country} onChange={e => setF(p => ({...p, country: e.target.value}))} /></FormField>
      <FormField label="Date"><input type="date" className={inputClass} value={f.date} onChange={e => setF(p => ({...p, date: e.target.value}))} /></FormField>
      <FormField label="Promoter"><input type="text" className={inputClass} value={f.promoter} onChange={e => setF(p => ({...p, promoter: e.target.value}))} /></FormField>
      <FormField label="Guarantee ($)"><input type="number" className={inputClass} value={f.guarantee} onChange={e => setF(p => ({...p, guarantee: e.target.value}))} /></FormField>
      <FormField label="Door split (%)"><input type="number" className={inputClass} value={f.door} onChange={e => setF(p => ({...p, door: e.target.value}))} /></FormField>
      <FormField label="Buyout ($)"><input type="number" className={inputClass} value={f.buyout} onChange={e => setF(p => ({...p, buyout: e.target.value}))} /></FormField>
      <FormField label="Notes"><input type="text" className={inputClass} value={f.notes} onChange={e => setF(p => ({...p, notes: e.target.value}))} /></FormField>
    </Modal>
  )
}

function StatPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-right">
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</div>
    </div>
  )
}

// ── Pipeline (kanban columns) ───────────────────────────────
function PipelineTab({ offers, editable, onEdit }: { offers: TourOffer[]; editable: boolean; onEdit: (o: TourOffer) => void }) {
  const byStatus = (s: OfferStatus) => offers.filter(o => o.status === s)

  return (
    <div className="grid grid-cols-3 gap-4">
      {PIPELINE_STAGES.map(status => {
        const cfg = STATUS_CONFIG[status]
        const items = byStatus(status)
        const total = items.reduce((s, o) => s + o.guarantee + (o.buyout ?? 0), 0)
        return (
          <div key={status}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                <span className="text-xs font-bold uppercase tracking-widest text-gray-500">{cfg.label}</span>
              </div>
              <span className="text-xs text-gray-400">{items.length} offer{items.length !== 1 ? 's' : ''}</span>
            </div>
            {items.length === 0 && (
              <div className="border-2 border-dashed border-gray-100 rounded-xl p-6 text-center text-xs text-gray-300">
                No offers
              </div>
            )}
            <div className="space-y-2">
              {items.map(o => <OfferCard key={o.id} offer={o} editable={editable} onEdit={onEdit} />)}
            </div>
            {items.length > 0 && (
              <div className="mt-3 text-right text-xs text-gray-400">
                Total: <span className="font-semibold text-gray-600">{fmt(total)}</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function OfferCard({ offer: o, editable, onEdit }: { offer: TourOffer; editable: boolean; onEdit: (o: TourOffer) => void }) {
  const cfg = STATUS_CONFIG[o.status]
  return (
    <div
      onClick={editable ? () => onEdit(o) : undefined}
      className={`border border-gray-100 rounded-xl p-4 bg-canvas hover:shadow-sm transition-shadow ${editable ? 'cursor-pointer' : ''}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="font-semibold text-sm leading-tight">{o.venue}</div>
          <div className="text-xs text-gray-400">{o.city}, {o.country}</div>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide flex-shrink-0 ${cfg.bg} ${cfg.color}`}>
          {cfg.label}
        </span>
      </div>
      <div className="text-xs text-gray-500 mb-3">{fmtDate(o.date)}</div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <span><span className="text-gray-400">Guarantee</span> <span className="font-semibold">{fmt(o.guarantee)}</span></span>
        {o.door   && <span><span className="text-gray-400">Door</span> <span className="font-semibold">{o.door}%</span></span>}
        {o.buyout && <span><span className="text-gray-400">Buyout</span> <span className="font-semibold">{fmt(o.buyout)}</span></span>}
      </div>
      <div className="mt-2 text-xs text-gray-400">{o.promoter}</div>
      {o.notes && (
        <div className="mt-2 text-xs text-amber-600 bg-amber-50 rounded-lg px-2 py-1">{o.notes}</div>
      )}
    </div>
  )
}

// ── Routing Calendar (chronological list) ──────────────────
function RoutingTab({ offers, editable, onEdit }: { offers: TourOffer[]; editable: boolean; onEdit: (o: TourOffer) => void }) {
  const sorted = [...offers].sort((a, b) => a.date.localeCompare(b.date))
  const past   = sorted.filter(o => o.date < new Date().toISOString().slice(0, 10))
  const future = sorted.filter(o => o.date >= new Date().toISOString().slice(0, 10))

  return (
    <div className="max-w-2xl space-y-8">
      {future.length > 0 && (
        <Section title="Upcoming">
          {future.map(o => <RoutingRow key={o.id} offer={o} editable={editable} onEdit={onEdit} />)}
        </Section>
      )}
      {past.length > 0 && (
        <Section title="Past">
          {past.reverse().map(o => <RoutingRow key={o.id} offer={o} editable={editable} onEdit={onEdit} />)}
        </Section>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function RoutingRow({ offer: o, editable, onEdit }: { offer: TourOffer; editable: boolean; onEdit: (o: TourOffer) => void }) {
  const cfg = STATUS_CONFIG[o.status]
  const date = new Date(o.date + 'T00:00:00')
  return (
    <div
      onClick={editable ? () => onEdit(o) : undefined}
      className={`flex items-center gap-4 p-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors ${editable ? 'cursor-pointer' : ''}`}
    >
      <div className="w-14 text-center flex-shrink-0">
        <div className="text-xs text-gray-400 uppercase">{date.toLocaleDateString('en-US', { month: 'short' })}</div>
        <div className="text-xl font-bold leading-none">{date.getDate()}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{o.venue}</div>
        <div className="text-xs text-gray-400">{o.city}, {o.country} · {o.promoter}</div>
      </div>
      <div className="text-right">
        <div className="text-sm font-semibold">{fmt(o.guarantee + (o.buyout ?? 0))}</div>
        {o.door && <div className="text-xs text-gray-400">+ {o.door}% door</div>}
      </div>
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide flex-shrink-0 ${cfg.bg} ${cfg.color}`}>
        {cfg.label}
      </span>
    </div>
  )
}

// ── Settled & History ───────────────────────────────────────
function HistoryTab({ settled, cancelled }: { settled: TourOffer[]; cancelled: TourOffer[] }) {
  const totalNet = settled.reduce((s, o) => s + (o.netPayout ?? o.guarantee), 0)
  const totalGross = settled.reduce((s, o) => s + o.guarantee + (o.buyout ?? 0), 0)

  return (
    <div className="max-w-2xl space-y-8">
      {settled.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Settled Shows</div>
            <div className="text-xs text-gray-500">Net: <span className="font-semibold text-blue-700">{fmt(totalNet)}</span> / Gross: <span className="font-semibold">{fmt(totalGross)}</span></div>
          </div>
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2 text-xs text-gray-400 font-medium">Date</th>
                  <th className="text-left px-4 py-2 text-xs text-gray-400 font-medium">Venue / City</th>
                  <th className="text-left px-4 py-2 text-xs text-gray-400 font-medium">Promoter</th>
                  <th className="text-right px-4 py-2 text-xs text-gray-400 font-medium">Guarantee</th>
                  <th className="text-right px-4 py-2 text-xs text-gray-400 font-medium">Net Payout</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[...settled].sort((a, b) => (b.settledAt ?? b.date).localeCompare(a.settledAt ?? a.date)).map(o => (
                  <tr key={o.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(o.date)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{o.venue}</div>
                      <div className="text-xs text-gray-400">{o.city}, {o.country}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-sm">{o.promoter}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{fmt(o.guarantee + (o.buyout ?? 0))}</td>
                    <td className="px-4 py-3 text-right font-semibold text-blue-700">{fmt(o.netPayout ?? o.guarantee)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {cancelled.length > 0 && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Cancelled</div>
          <div className="space-y-2">
            {cancelled.map(o => (
              <div key={o.id} className="flex items-center gap-4 p-3 border border-gray-100 rounded-xl opacity-60">
                <div className="flex-1">
                  <div className="text-sm font-medium line-through">{o.venue} — {o.city}</div>
                  <div className="text-xs text-gray-400">{fmtDate(o.date)} · {o.promoter}</div>
                </div>
                {o.notes && <div className="text-xs text-red-500">{o.notes}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
      {settled.length === 0 && cancelled.length === 0 && (
        <div className="text-center text-gray-400 py-12 text-sm">No history yet</div>
      )}
    </div>
  )
}
