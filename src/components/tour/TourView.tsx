'use client'
import { useState } from 'react'
import { useStore } from '@/lib/store'
import { Modal, FormField, inputClass } from '@/components/ui/Modal'
import { MONTH_NAMES, MONTH_SHORT } from '@/lib/utils'

export function TourView() {
  const client = useStore(s => s.getClient())
  const editable = useStore(s => s.canEdit('tour'))
  const { selectedShowId, setSelectedShow, addShow, updateShowStatus, deleteShow } = useStore()
  const [addOpen, setAddOpen] = useState(false)
  const [f, setF] = useState({ date: '', city: '', venue: '', time: '20:00' })

  if (!client) return null
  const shows    = client.tour.shows
  const upcoming = shows.filter(s => new Date(s.date) >= new Date())
  const selected = shows.find(s => s.id === selectedShowId)

  function handleAdd() {
    if (!f.date || !f.city || !f.venue) return
    addShow(f.date, f.city, f.venue, f.time)
    setF({ date: '', city: '', venue: '', time: '20:00' })
    setAddOpen(false)
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
        {/* Stats */}
        <div className="flex gap-3.5 mb-6">
          {[[String(shows.length), 'Shows'],[String(upcoming.length), 'Upcoming'],[String(shows.filter(s => s.status === 'confirmed').length), 'Confirmed']].map(([n, l]) => (
            <div key={l} className="bg-gray-50 rounded-xl px-5 py-4 flex-1">
              <div className="text-2xl font-bold font-serif">{n}</div>
              <div className="text-xs text-gray-400 mt-1">{l}</div>
            </div>
          ))}
        </div>

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
            <div className="flex gap-2 flex-wrap mb-4">
              {['Maps ↗', 'Advance', 'Day Sheet', 'Stage Plot', 'Hotels', 'Flights'].map(l => (
                <span key={l} className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium text-gray-500 cursor-pointer hover:bg-gray-50 transition-colors">{l}</span>
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
      {addOpen && (
        <Modal title="Add a show" onClose={() => setAddOpen(false)} footer={
          <>
            <button onClick={() => setAddOpen(false)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
            <button onClick={handleAdd} className="px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600">Add show</button>
          </>
        }>
          <FormField label="Date"><input type="date" className={inputClass} value={f.date} onChange={e => setF(p => ({...p, date: e.target.value}))} /></FormField>
          <FormField label="City"><input type="text" className={inputClass} placeholder="City" value={f.city} onChange={e => setF(p => ({...p, city: e.target.value}))} /></FormField>
          <FormField label="Venue"><input type="text" className={inputClass} placeholder="Venue name" value={f.venue} onChange={e => setF(p => ({...p, venue: e.target.value}))} /></FormField>
          <FormField label="Set time"><input type="time" className={inputClass} value={f.time} onChange={e => setF(p => ({...p, time: e.target.value}))} /></FormField>
        </Modal>
      )}
    </div>
  )
}
