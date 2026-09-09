'use client'
import { useState } from 'react'
import { useStore } from '@/lib/store'
import { Modal, FormField, inputClass, selectClass } from '@/components/ui/Modal'
import type { Show, GuestListCategory, GuestListEntry } from '@/types'

const CATEGORY_STYLES: Record<GuestListCategory, string> = {
  artist:     'bg-blue-50 text-blue-700',
  vip:        'bg-purple-50 text-purple-700',
  label:      'bg-amber-50 text-amber-700',
  management: 'bg-gray-100 text-gray-600',
  media:      'bg-pink-50 text-pink-700',
  family:     'bg-green-50 text-green-700',
  promo:      'bg-cyan-50 text-cyan-700',
  sponsor:    'bg-orange-50 text-orange-700',
}
const CATEGORY_LABEL: Record<GuestListCategory, string> = {
  artist: 'Artist', vip: 'VIP', label: 'Label', management: 'Mgmt',
  media: 'Media', family: 'Family', promo: 'Promo', sponsor: 'Sponsor',
}

export function GuestListView() {
  const client = useStore(s => s.getClient())
  const editable = useStore(s => s.canEdit('tour'))
  const { toggleGuestCheckedIn, deleteGuest } = useStore()
  const [selectedShowId, setSelectedShowId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [editGuest, setEditGuest] = useState<GuestListEntry | null>(null)

  if (!client) return null
  const shows = client.tour.shows
  const allGuests = client.tour.guestList ?? []
  const advances = client.tour.advances ?? []
  const show: Show | undefined = selectedShowId ? shows.find(s => s.id === selectedShowId) : shows[0]
  const guests = show ? allGuests.filter(g => g.showId === show.id) : []
  const totalQty = guests.reduce((sum, g) => sum + g.qty, 0)
  const checkedInQty = guests.filter(g => g.checkedIn).reduce((sum, g) => sum + g.qty, 0)
  const cap = show ? parseInt(advances.find(a => a.showId === show.id)?.guestListCap ?? '', 10) : NaN
  const overCap = !isNaN(cap) && totalQty > cap

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
            const items = allGuests.filter(g => g.showId === s.id)
            const qty = items.reduce((sum, g) => sum + g.qty, 0)
            const d = new Date(s.date)
            return (
              <button
                key={s.id}
                onClick={() => setSelectedShowId(s.id)}
                className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${(show?.id === s.id) ? 'bg-blue-50' : ''}`}
              >
                <div className="text-xs font-semibold text-gray-800 truncate">{s.venue}</div>
                <div className="text-[11px] text-gray-400">
                  {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {s.city}
                </div>
                <div className="text-[10px] mt-0.5 text-gray-400">
                  {qty > 0 ? `${qty} on list` : 'No guests added'}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Main panel ── */}
      <div className="flex-1 overflow-y-auto">
        {!show ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">No shows available</div>
        ) : (
          <div className="max-w-2xl mx-auto py-6 px-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{show.venue}</h2>
                <div className="text-sm text-gray-400">{dateStr} · {show.city}</div>
                <div className="text-xs text-gray-400 mt-1">
                  {checkedInQty} of {totalQty} checked in · {guests.length} {guests.length === 1 ? 'entry' : 'entries'}
                  {!isNaN(cap) && (
                    <span className={overCap ? 'text-red-500 font-medium' : ''}> · {totalQty} / {cap} on cap{overCap ? ' — over cap' : ''}</span>
                  )}
                </div>
              </div>
              {editable && (
                <button
                  onClick={() => setAddOpen(true)}
                  className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors flex-shrink-0"
                >
                  + Add guest
                </button>
              )}
            </div>

            <div className="flex flex-col gap-2">
              {guests.map(g => (
                <div
                  key={g.id}
                  onClick={() => setEditGuest(g)}
                  className="group border border-gray-100 rounded-xl px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={g.checkedIn}
                    onChange={() => toggleGuestCheckedIn(g.id)}
                    onClick={e => e.stopPropagation()}
                    disabled={!editable}
                    className="w-4 h-4 flex-shrink-0 disabled:cursor-not-allowed"
                    title="Checked in"
                  />
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium ${g.checkedIn ? 'text-gray-400' : 'text-gray-900'}`}>
                      {g.name} {g.qty > 1 && <span className="text-xs text-gray-400">×{g.qty}</span>}
                    </div>
                    {(g.credential || g.notes) && (
                      <div className="text-xs text-gray-400 mt-0.5">
                        {g.credential}{g.credential && g.notes ? ' · ' : ''}{g.notes}
                      </div>
                    )}
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold flex-shrink-0 ${CATEGORY_STYLES[g.category]}`}>
                    {CATEGORY_LABEL[g.category]}
                  </span>
                  {editable && (
                    <button
                      onClick={(e) => { e.stopPropagation(); if (confirm(`Remove "${g.name}" from the guest list?`)) deleteGuest(g.id) }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-400 text-xs flex-shrink-0"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {guests.length === 0 && (
                <div className="text-sm text-gray-300 text-center py-8">No guests added for this show yet</div>
              )}
            </div>
          </div>
        )}
      </div>

      {addOpen && show && (
        <GuestModal showId={show.id} onClose={() => setAddOpen(false)} />
      )}
      {editGuest && (
        <GuestModal showId={editGuest.showId} guest={editGuest} onClose={() => setEditGuest(null)} />
      )}
    </div>
  )
}

function GuestModal({ showId, guest, onClose }: { showId: string; guest?: GuestListEntry; onClose: () => void }) {
  const editable = useStore(s => s.canEdit('tour'))
  const { addGuest, updateGuest, deleteGuest } = useStore()
  const [name, setName] = useState(guest?.name ?? '')
  const [qty, setQty] = useState(guest?.qty ?? 1)
  const [category, setCategory] = useState<GuestListCategory>(guest?.category ?? 'vip')
  const [credential, setCredential] = useState(guest?.credential ?? '')
  const [notes, setNotes] = useState(guest?.notes ?? '')

  function handleSave() {
    if (!name.trim()) return
    if (guest) {
      updateGuest(guest.id, { name: name.trim(), qty, category, credential: credential.trim() || undefined, notes: notes.trim() || undefined })
    } else {
      addGuest(showId, name.trim(), qty, category, credential.trim() || undefined, notes.trim() || undefined)
    }
    onClose()
  }

  function handleDelete() {
    if (!guest) return
    if (!confirm(`Remove "${guest.name}" from the guest list?`)) return
    deleteGuest(guest.id)
    onClose()
  }

  return (
    <Modal title={guest ? 'Edit guest' : 'Add to guest list'} onClose={onClose} footer={
      editable ? (
        <>
          {guest && (
            <button onClick={handleDelete} className="px-3 py-1.5 border border-red-200 text-red-500 rounded-lg text-sm hover:bg-red-50 mr-auto">
              Remove
            </button>
          )}
          <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} className="px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600">
            {guest ? 'Save' : 'Add guest'}
          </button>
        </>
      ) : (
        <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Close</button>
      )
    }>
      <FormField label="Name">
        <input className={inputClass} placeholder="Guest name" value={name} onChange={e => setName(e.target.value)} autoFocus disabled={!editable} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Party size">
          <input type="number" min={1} className={inputClass} value={qty} onChange={e => setQty(Math.max(1, Number(e.target.value)))} disabled={!editable} />
        </FormField>
        <FormField label="Category">
          <select className={selectClass} value={category} onChange={e => setCategory(e.target.value as GuestListCategory)} disabled={!editable}>
            {(['vip', 'artist', 'label', 'management', 'media', 'family', 'promo', 'sponsor'] as GuestListCategory[]).map(c => (
              <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
            ))}
          </select>
        </FormField>
      </div>
      <FormField label="Credential">
        <input className={inputClass} placeholder="e.g. All Access, VIP, Press" value={credential} onChange={e => setCredential(e.target.value)} disabled={!editable} />
      </FormField>
      <FormField label="Notes">
        <input className={inputClass} placeholder="Optional" value={notes} onChange={e => setNotes(e.target.value)} disabled={!editable} />
      </FormField>
    </Modal>
  )
}
