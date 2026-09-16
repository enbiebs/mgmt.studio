'use client'
import { useState } from 'react'
import { useStore } from '@/lib/store'
import { Modal, FormField, inputClass, selectClass } from '@/components/ui/Modal'
import { MONTH_NAMES, MONTH_SHORT } from '@/lib/utils'
import type { Currency, Show } from '@/types'

export function TourView() {
  const client = useStore(s => s.getClient())
  const editable = useStore(s => s.canEdit('tour'))
  const {
    selectedShowId, setSelectedShow, setTourSub, updateShowStatus, deleteShow,
    enableCalendarFeed, disableCalendarFeed,
  } = useStore()
  const [addOpen, setAddOpen] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!client) return null
  const shows    = client.tour.shows
  const upcoming = shows.filter(s => new Date(s.date) >= new Date())
  const selected = shows.find(s => s.id === selectedShowId)

  // "Advance Dashboard" lite — flags upcoming shows with something outstanding,
  // computed entirely from data already in the store (no new tables).
  const advances  = client.tour.advances ?? []
  const travel    = client.tour.travel ?? []
  const guestList = client.tour.guestList ?? []
  const needsAttention = upcoming
    .map(s => {
      const advance = advances.find(a => a.showId === s.id)
      const cap = parseInt(advance?.guestListCap ?? '', 10)
      const used = guestList.filter(g => g.showId === s.id).reduce((sum, g) => sum + g.qty, 0)
      const issues = [
        (!advance || advance.status !== 'complete') && 'Advance incomplete',
        travel.some(t => t.showIds?.includes(s.id) && (t.status === 'needed' || t.status === 'pending')) && 'Travel pending',
        !isNaN(cap) && used > cap && 'Over guest cap',
      ].filter((x): x is string => Boolean(x))
      return { show: s, issues }
    })
    .filter(x => x.issues.length > 0)
    .sort((a, b) => a.show.date.localeCompare(b.show.date))
    .slice(0, 5)

  async function copyFeedLink() {
    if (!client?.calendarToken) return
    await navigator.clipboard.writeText(`${window.location.origin}/api/calendar/${client.calendarToken}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Sidebar */}
      <div className="w-[272px] flex-shrink-0 border-r border-gray-100 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Tour</span>
          {editable && (
            <button
              onClick={() => setAddOpen(true)}
              className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
            >
              + Show
            </button>
          )}
        </div>

        <div className="flex-1 overflow-auto">
          {shows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-gray-300">
              <span className="text-4xl">🎤</span>
              <span className="text-sm">No shows yet</span>
            </div>
          ) : shows.map(s => {
            const d = new Date(s.date + 'T00:00:00')
            return (
              <button
                key={s.id}
                onClick={() => setSelectedShow(s.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 border-b border-gray-100 text-left transition-colors ${
                  selectedShowId === s.id ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}
              >
                <div className={`w-10 flex-shrink-0 text-center rounded-lg py-1 ${selectedShowId === s.id ? 'bg-blue-100' : 'bg-gray-100'}`}>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400">{MONTH_SHORT[d.getMonth()]}</div>
                  <div className="text-lg font-bold font-serif leading-none">{d.getDate()}</div>
                </div>
                <div>
                  <div className="text-sm font-medium leading-tight">{s.venue}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{s.city}</div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 overflow-auto p-6">
        {editable && (
          <div className="flex justify-end mb-3 relative">
            <button
              onClick={() => setCalendarOpen(v => !v)}
              className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"
            >
              📅 Calendar feed
            </button>
            {calendarOpen && (
              <div className="absolute right-0 top-full mt-1 bg-canvas border border-gray-100 rounded-xl shadow-lg p-3 w-80 z-50 text-xs">
                {!client.calendarToken ? (
                  <>
                    <div className="text-gray-500 mb-2">
                      Get a private link to subscribe to {client.name}&apos;s show dates in Google or Apple Calendar. It updates automatically whenever a show changes.
                    </div>
                    <button
                      onClick={() => enableCalendarFeed(client.id)}
                      className="w-full px-2.5 py-1.5 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition-colors"
                    >
                      Enable calendar feed
                    </button>
                  </>
                ) : (
                  <>
                    <div className="text-gray-500 mb-2">
                      Treat this link like a password — anyone who has it can see {client.name}&apos;s show dates.
                    </div>
                    <div className="font-mono text-[11px] bg-gray-50 rounded-lg px-2 py-1.5 mb-2 break-all text-gray-600">
                      {typeof window !== 'undefined' ? `${window.location.origin}/api/calendar/${client.calendarToken}` : ''}
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={copyFeedLink}
                        className="flex-1 px-2.5 py-1.5 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition-colors"
                      >
                        {copied ? 'Copied!' : 'Copy link'}
                      </button>
                      <button
                        onClick={() => enableCalendarFeed(client.id)}
                        className="px-2.5 py-1.5 border border-gray-200 rounded-lg font-medium text-gray-500 hover:bg-gray-50 transition-colors"
                      >
                        Regenerate
                      </button>
                      <button
                        onClick={() => disableCalendarFeed(client.id)}
                        className="px-2.5 py-1.5 border border-gray-200 rounded-lg font-medium text-red-400 hover:bg-red-50 transition-colors"
                      >
                        Turn off
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="flex gap-3.5 mb-6">
          {[[String(shows.length), 'Shows'],[String(upcoming.length), 'Upcoming'],[String(shows.filter(s => s.status === 'confirmed').length), 'Confirmed']].map(([n, l]) => (
            <div key={l} className="bg-gray-50 rounded-xl px-5 py-4 flex-1">
              <div className="text-2xl font-bold font-serif">{n}</div>
              <div className="text-xs text-gray-400 mt-1">{l}</div>
            </div>
          ))}
        </div>

        {/* Needs Attention */}
        {needsAttention.length > 0 && (
          <div className="mb-6">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Needs Attention</div>
            <div className="flex flex-col gap-1.5">
              {needsAttention.map(({ show, issues }) => (
                <button
                  key={show.id}
                  onClick={() => { setSelectedShow(show.id); setTourSub('advance') }}
                  className="w-full flex items-center gap-3 border border-amber-200 bg-amber-50/40 rounded-xl px-3.5 py-2 text-left hover:bg-amber-50 transition-colors"
                >
                  <span className="text-sm font-medium flex-shrink-0">{show.venue} · {show.city}</span>
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {new Date(show.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  <span className="text-xs text-amber-700 ml-auto truncate">{issues.join(' · ')}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Show detail */}
        {selected ? (
          <div className="border border-gray-100 rounded-2xl p-5">
            <div className="font-serif text-xl font-medium mb-4">{selected.city} · {selected.venue}</div>
            <div className="grid grid-cols-2 gap-4 mb-5">
              {[
                ['Date', (() => { const d = new Date(selected.date+'T00:00:00'); return `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}` })()],
                ['Set Time', selected.time],
                ['City', selected.city],
              ].map(([lbl, val]) => (
                <div key={lbl}>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">{lbl}</div>
                  <div className="text-sm font-medium">{val}</div>
                </div>
              ))}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Status</div>
                {editable ? (
                  <div className="flex items-center bg-gray-100 rounded-full p-0.5 text-xs gap-0.5 w-fit">
                    {(['hold', 'confirmed', 'cancelled'] as const).map(s => (
                      <button
                        key={s}
                        onClick={() => updateShowStatus(selected.id, s)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                          selected.status === s
                            ? s === 'confirmed' ? 'bg-green-600 text-white' : s === 'cancelled' ? 'bg-red-500 text-white' : 'bg-gray-900 text-canvas'
                            : 'text-gray-400 hover:text-gray-600'
                        }`}
                      >
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className={`text-sm font-medium ${selected.status === 'confirmed' ? 'text-green-600' : selected.status === 'cancelled' ? 'text-red-500' : 'text-amber-500'}`}>
                    {selected.status.charAt(0).toUpperCase() + selected.status.slice(1)}
                  </div>
                )}
              </div>
            </div>

            <ShowFinancials key={selected.id} show={selected} editable={editable} onViewOffer={() => setTourSub('offers')} />

            <div className="flex gap-2 flex-wrap mb-4">
              {[
                ['Maps ↗', () => window.open(`https://maps.google.com/?q=${encodeURIComponent(`${selected.venue}, ${selected.city}`)}`, '_blank')],
                ['Advance', () => { setSelectedShow(selected.id); setTourSub('advance') }],
                ['Day Sheet', () => { setSelectedShow(selected.id); setTourSub('daysheet') }],
                ['Hotels', () => { setSelectedShow(selected.id); setTourSub('travel') }],
                ['Flights', () => { setSelectedShow(selected.id); setTourSub('travel') }],
              ].map(([l, fn]) => (
                <button
                  key={l as string}
                  onClick={fn as () => void}
                  className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium text-gray-500 cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  {l as string}
                </button>
              ))}
            </div>
            {editable && (
              <button
                onClick={() => deleteShow(selected.id)}
                className="text-sm text-red-400 hover:text-red-500 transition-colors"
              >
                Remove show
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-gray-300">
            <span className="text-4xl">📍</span>
            <span className="text-sm">Select a show for details</span>
          </div>
        )}
      </div>

      {/* Add show modal */}
      {addOpen && <AddShowModal onClose={() => setAddOpen(false)} />}
    </div>
  )
}

// ── Add Show Modal ──────────────────────────────────────────
export function AddShowModal({ defaultDate, onClose }: { defaultDate?: string; onClose: () => void }) {
  const addShow = useStore(s => s.addShow)
  const [f, setF] = useState({ date: defaultDate ?? '', city: '', venue: '', time: '20:00' })

  function handleAdd() {
    if (!f.date || !f.city || !f.venue) return
    addShow(f.date, f.city, f.venue, f.time)
    onClose()
  }

  return (
    <Modal title="Add a show" onClose={onClose} footer={
      <>
        <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
        <button onClick={handleAdd} className="px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600">Add show</button>
      </>
    }>
      <FormField label="Date"><input type="date" className={inputClass} value={f.date} onChange={e => setF(p => ({...p, date: e.target.value}))} /></FormField>
      <FormField label="City"><input type="text" className={inputClass} placeholder="City" value={f.city} onChange={e => setF(p => ({...p, city: e.target.value}))} /></FormField>
      <FormField label="Venue"><input type="text" className={inputClass} placeholder="Venue name" value={f.venue} onChange={e => setF(p => ({...p, venue: e.target.value}))} /></FormField>
      <FormField label="Set time"><input type="time" className={inputClass} value={f.time} onChange={e => setF(p => ({...p, time: e.target.value}))} /></FormField>
    </Modal>
  )
}

// ── Show financials ─────────────────────────────────────────
function ShowFinancials({ show, editable, onViewOffer }: { show: Show; editable: boolean; onViewOffer: () => void }) {
  const updateShowFinancials = useStore(s => s.updateShowFinancials)
  const [guarantee, setGuarantee] = useState(String(show.guarantee ?? ''))
  const [deposit, setDeposit] = useState(String(show.deposit ?? ''))
  const [currency, setCurrency] = useState<Currency>(show.currency ?? 'USD')

  function commit(patch: { guarantee?: number; deposit?: number; currency?: Currency }) {
    updateShowFinancials(show.id, {
      guarantee: guarantee ? Number(guarantee) : undefined,
      deposit: deposit ? Number(deposit) : undefined,
      currency,
      ...patch,
    })
  }

  if (!editable && !show.guarantee && !show.deposit) return null

  return (
    <div className="border-t border-gray-100 pt-4 mb-4">
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Financials</div>
      {editable ? (
        <div className="grid grid-cols-3 gap-3 mb-2">
          <FormField label="Guarantee">
            <input type="number" className={inputClass} value={guarantee}
              onChange={e => setGuarantee(e.target.value)}
              onBlur={() => commit({ guarantee: guarantee ? Number(guarantee) : undefined })} />
          </FormField>
          <FormField label="Deposit">
            <input type="number" className={inputClass} value={deposit}
              onChange={e => setDeposit(e.target.value)}
              onBlur={() => commit({ deposit: deposit ? Number(deposit) : undefined })} />
          </FormField>
          <FormField label="Currency">
            <select className={selectClass} value={currency}
              onChange={e => { const c = e.target.value as Currency; setCurrency(c); commit({ currency: c }) }}>
              <option value="USD">USD</option>
              <option value="GBP">GBP</option>
              <option value="EUR">EUR</option>
            </select>
          </FormField>
        </div>
      ) : (
        <div className="flex gap-4 text-sm mb-2">
          {show.guarantee != null && <span><span className="text-gray-400">Guarantee</span> <span className="font-semibold">{show.guarantee} {show.currency ?? 'USD'}</span></span>}
          {show.deposit != null && <span><span className="text-gray-400">Deposit</span> <span className="font-semibold">{show.deposit} {show.currency ?? 'USD'}</span></span>}
        </div>
      )}
      {show.tourOfferId && (
        <button onClick={onViewOffer} className="text-xs text-blue-500 hover:text-blue-600">
          From offer — view in Offers →
        </button>
      )}
    </div>
  )
}
