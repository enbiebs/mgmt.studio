'use client'
// ──────────────────────────────────────────────────────────
//  Advance Template Creator
//  One advance per show — filled in by tour manager,
//  then sent to venue PM, hospitality, and logistics contacts.
//  Drives the Day Sheet and calendar sync.
// ──────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { useStore } from '@/lib/store'
import type { ShowAdvance, AdvanceStatus, AdvanceContact, AdvanceSchedule, Show, Venue } from '@/types'
import { uid, shiftTime } from '@/lib/utils'

// Fields shared between a Venue and a ShowAdvance — copied straight across
// in both directions when saving to or loading from the venue library.
const VENUE_FIELD_MAP: { advanceSection: 'production' | 'hospitality' | 'logistics'; key: string; venueKey: keyof Venue }[] = [
  { advanceSection: 'production',  key: 'stageWidth',           venueKey: 'stageWidth' },
  { advanceSection: 'production',  key: 'stageDepth',           venueKey: 'stageDepth' },
  { advanceSection: 'production',  key: 'roofHeight',           venueKey: 'roofHeight' },
  { advanceSection: 'production',  key: 'fohPosition',          venueKey: 'fohPosition' },
  { advanceSection: 'production',  key: 'monPosition',          venueKey: 'monPosition' },
  { advanceSection: 'production',  key: 'powerSupply',          venueKey: 'powerSupply' },
  { advanceSection: 'production',  key: 'riserCount',           venueKey: 'riserCount' },
  { advanceSection: 'production',  key: 'merchandiseLocation',  venueKey: 'merchandiseLocation' },
  { advanceSection: 'hospitality',  key: 'dressingRooms',        venueKey: 'dressingRooms' },
  { advanceSection: 'hospitality',  key: 'dressingRoomNotes',    venueKey: 'dressingRoomNotes' },
  { advanceSection: 'hospitality',  key: 'cateringCompany',      venueKey: 'cateringCompany' },
  { advanceSection: 'logistics',    key: 'parkingInstructions',  venueKey: 'parkingInstructions' },
  { advanceSection: 'logistics',    key: 'busParking',           venueKey: 'busParking' },
  { advanceSection: 'logistics',    key: 'loadingDockAddress',   venueKey: 'loadingDockAddress' },
  { advanceSection: 'logistics',    key: 'loadingDockNotes',     venueKey: 'loadingDockNotes' },
  { advanceSection: 'logistics',    key: 'nearestAirport',       venueKey: 'nearestAirport' },
  { advanceSection: 'logistics',    key: 'distanceToAirport',    venueKey: 'distanceToAirport' },
]

// ── Status config ───────────────────────────────────────────
const STATUS: Record<AdvanceStatus, { label: string; dot: string; badge: string }> = {
  draft:       { label: 'Draft',       dot: 'bg-gray-300',   badge: 'bg-gray-100 text-gray-500'   },
  sent:        { label: 'Sent',        dot: 'bg-blue-400',   badge: 'bg-blue-50 text-blue-600'    },
  'in-progress':{ label: 'In Progress',dot: 'bg-amber-400',  badge: 'bg-amber-50 text-amber-700'  },
  complete:    { label: 'Complete',    dot: 'bg-green-500',  badge: 'bg-green-50 text-green-700'  },
}

// Chronological order of the schedule's time fields — matches the Grid
// below and is what "shift everything after this by N minutes" walks.
const SCHEDULE_FIELD_ORDER: { key: keyof AdvanceSchedule; label: string }[] = [
  { key: 'busCall',          label: 'Bus / Lobby Call'    },
  { key: 'lobbyCall',        label: 'Lobby Call (Hotel)'  },
  { key: 'loadIn',           label: 'Load In'             },
  { key: 'lineCheck',        label: 'Line Check'          },
  { key: 'soundcheck',       label: 'Soundcheck'          },
  { key: 'artistSoundcheck', label: 'Artist Soundcheck'   },
  { key: 'doorsOpen',        label: 'Doors Open'          },
  { key: 'supportOn',        label: 'Support On'          },
  { key: 'supportOff',       label: 'Support Off'         },
  { key: 'headlineOn',       label: 'Headline On'         },
  { key: 'curfew',           label: 'Curfew'              },
  { key: 'loadOut',          label: 'Load Out'            },
  { key: 'departureTime',    label: 'Bus Departure'       },
]

type Tab = 'schedule' | 'production' | 'hospitality' | 'logistics' | 'contacts' | 'notes'
const TABS: { key: Tab; label: string }[] = [
  { key: 'schedule',    label: 'Schedule'     },
  { key: 'production',  label: 'Production'   },
  { key: 'hospitality', label: 'Hospitality'  },
  { key: 'logistics',   label: 'Logistics'    },
  { key: 'contacts',    label: 'Contacts'     },
  { key: 'notes',       label: 'Notes'        },
]

// ── Helper components ───────────────────────────────────────
// Both read edit access directly (rather than threading a prop through
// every one of their ~40 call sites below) since they're only ever used
// for the 'tour' section within this file.
function Field({ label, value, onChange, placeholder, mono }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean
}) {
  const editable = useStore(s => s.canEdit('tour'))
  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={!editable}
        className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed ${mono ? 'font-mono' : ''}`}
      />
    </div>
  )
}

function TextArea({ label, value, onChange, placeholder, rows = 3 }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number
}) {
  const editable = useStore(s => s.canEdit('tour'))
  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        disabled={!editable}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed resize-none"
      />
    </div>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-4">{children}</div>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 pt-2 border-t border-gray-100 mt-2">{title}</h3>
      {children}
    </div>
  )
}

// ── Main component ──────────────────────────────────────────
export function AdvanceView() {
  const client = useStore(s => s.getClient())
  const editable = useStore(s => s.canEdit('tour'))
  const { setTourSub, saveAdvance: persistAdvance, addVenue, updateVenue } = useStore()
  const sharedSelectedShowId = useStore(s => s.selectedShowId)
  const [selectedShowId, setSelectedShowId] = useState<string | null>(null)
  const [advance, setAdvance] = useState<ShowAdvance | null>(null)
  const [tab, setTab] = useState<Tab>('schedule')
  const [sendOpen, setSendOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const [bumpFrom, setBumpFrom] = useState('')
  const [bumpCustom, setBumpCustom] = useState('')
  const [bumpMessage, setBumpMessage] = useState('')
  const [venueMessage, setVenueMessage] = useState('')

  // Jumping here from elsewhere (e.g. Tour's "Advance" quick link) sets the
  // shared selectedShowId — adopt it once, without fighting this view's own
  // sidebar clicks afterward.
  useEffect(() => {
    if (!client) return
    if (sharedSelectedShowId && sharedSelectedShowId !== selectedShowId) {
      const show = client.tour.shows.find(s => s.id === sharedSelectedShowId)
      if (show) selectShow(show)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedSelectedShowId])

  if (!client) return null

  const shows = client.tour.shows
  const advances = client.tour.advances ?? []
  const guestList = client.tour.guestList ?? []
  const venues = client.tour.venues ?? []

  function getAdvance(showId: string): ShowAdvance {
    return advances.find(a => a.showId === showId) ?? {
      id: 'adv-' + uid(),
      showId,
      status: 'draft',
      schedule: {}, production: {}, hospitality: {}, logistics: {},
      contacts: [],
    }
  }

  function selectShow(show: Show) {
    setSelectedShowId(show.id)
    setAdvance(getAdvance(show.id))
    setTab('schedule')
    setSaved(false)
  }

  // Mutate helpers — update nested path in advance
  function updateSchedule(key: string, val: string) {
    if (!advance) return
    setAdvance({ ...advance, schedule: { ...advance.schedule, [key]: val } })
    setSaved(false)
  }

  // Shifts every parseable time from `bumpFrom` onward by `minutes` — the
  // real-world "doors moved back 30, move everything after it" moment.
  // Anything that isn't a clean HH:MM (blank, "TBC", freeform text) is
  // left exactly as-is rather than erroring.
  function bumpSchedule(minutes: number) {
    if (!advance || !bumpFrom || !minutes) return
    const startIdx = SCHEDULE_FIELD_ORDER.findIndex(f => f.key === bumpFrom)
    if (startIdx === -1) return
    const nextSchedule = { ...advance.schedule }
    let shifted = 0
    for (let i = startIdx; i < SCHEDULE_FIELD_ORDER.length; i++) {
      const key = SCHEDULE_FIELD_ORDER[i].key
      const current = nextSchedule[key]
      if (typeof current !== 'string') continue
      const next = shiftTime(current, minutes)
      if (next !== null) {
        nextSchedule[key] = next
        shifted++
      }
    }
    setAdvance({ ...advance, schedule: nextSchedule })
    setSaved(false)
    setBumpMessage(shifted > 0 ? `Shifted ${shifted} time${shifted === 1 ? '' : 's'} — remember to Save` : 'Nothing after there to shift')
    setTimeout(() => setBumpMessage(''), 3500)
  }
  function updateProduction(key: string, val: string) {
    if (!advance) return
    setAdvance({ ...advance, production: { ...advance.production, [key]: val } })
    setSaved(false)
  }
  function updateHospitality(key: string, val: string) {
    if (!advance) return
    setAdvance({ ...advance, hospitality: { ...advance.hospitality, [key]: val } })
    setSaved(false)
  }
  function updateLogistics(key: string, val: string) {
    if (!advance) return
    setAdvance({ ...advance, logistics: { ...advance.logistics, [key]: val } })
    setSaved(false)
  }

  function addContact() {
    if (!advance) return
    const newContact: AdvanceContact = { id: 'ct-' + uid(), role: '', name: '' }
    setAdvance({ ...advance, contacts: [...advance.contacts, newContact] })
    setSaved(false)
  }

  function updateContact(id: string, key: keyof AdvanceContact, val: string) {
    if (!advance) return
    setAdvance({
      ...advance,
      contacts: advance.contacts.map(c => c.id === id ? { ...c, [key]: val } : c),
    })
    setSaved(false)
  }

  function removeContact(id: string) {
    if (!advance) return
    setAdvance({ ...advance, contacts: advance.contacts.filter(c => c.id !== id) })
    setSaved(false)
  }

  function saveAdvance() {
    if (!advance) return
    // Writes through the store: optimistic state + localStorage + Supabase
    persistAdvance(advance)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function markStatus(status: AdvanceStatus) {
    if (!advance) return
    setAdvance({ ...advance, status, sentAt: status === 'sent' ? new Date().toISOString().slice(0, 10) : advance.sentAt })
  }

  const selectedShow = shows.find(s => s.id === selectedShowId)
  const matchingVenue = selectedShow
    ? venues.find(v => v.name.trim().toLowerCase() === selectedShow.venue.trim().toLowerCase())
    : undefined

  // Copies this venue's saved details into the current (unsaved) advance
  // draft — the "we've played here before" shortcut.
  function loadVenueDetails() {
    if (!advance || !matchingVenue) return
    let next = { ...advance }
    for (const f of VENUE_FIELD_MAP) {
      const value = matchingVenue[f.venueKey]
      if (typeof value === 'string' && value) {
        next = { ...next, [f.advanceSection]: { ...next[f.advanceSection], [f.key]: value } }
      }
    }
    if (matchingVenue.wifi) next.wifi = matchingVenue.wifi
    if (matchingVenue.wifiPassword) next.wifiPassword = matchingVenue.wifiPassword
    if (matchingVenue.contacts?.length) next.contacts = [...next.contacts, ...matchingVenue.contacts.map(c => ({ ...c, id: 'ct-' + uid() }))]
    setAdvance(next)
    setSaved(false)
    setVenueMessage('Venue details loaded — remember to Save')
    setTimeout(() => setVenueMessage(''), 3500)
  }

  // Captures the venue-specific fields on this advance into the venue
  // library, so the next show booked here starts from real data instead
  // of a blank form. Matches an existing venue by name, else creates one.
  function saveToVenueLibrary() {
    if (!advance || !selectedShow) return
    const patch: Omit<Venue, 'id' | 'createdAt'> = {
      name: selectedShow.venue, city: selectedShow.city,
      wifi: advance.wifi, wifiPassword: advance.wifiPassword,
      contacts: advance.contacts,
    }
    for (const f of VENUE_FIELD_MAP) {
      const value = advance[f.advanceSection][f.key as keyof typeof advance[typeof f.advanceSection]]
      if (typeof value === 'string' && value) {
        (patch as Record<string, unknown>)[f.venueKey] = value
      }
    }
    if (matchingVenue) updateVenue(matchingVenue.id, patch)
    else addVenue(patch)
    setVenueMessage('Saved to venue library!')
    setTimeout(() => setVenueMessage(''), 2000)
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* ── Show list ── */}
      <div className="w-[260px] flex-shrink-0 border-r border-gray-100 flex flex-col">
        <div className="px-4 py-3 border-b border-gray-100">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Shows</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {shows.length === 0 ? (
            <div className="px-4 py-8 text-sm text-gray-400 text-center">No shows scheduled</div>
          ) : (
            shows.map(show => {
              const adv = advances.find(a => a.showId === show.id)
              const st = adv?.status ?? 'draft'
              const cfg = STATUS[st]
              const d = new Date(show.date)
              const isSelected = show.id === selectedShowId
              return (
                <button
                  key={show.id}
                  onClick={() => selectShow(show)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${isSelected ? 'bg-blue-50' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full mt-[5px] flex-shrink-0 ${cfg.dot}`} />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-900 truncate">{show.venue}</div>
                      <div className="text-xs text-gray-500 truncate">{show.city}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                      <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.badge}`}>
                        {cfg.label}
                      </span>
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ── Advance editor ── */}
      {!advance ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          Select a show to view or create its advance
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100">
            <div>
              <div className="font-semibold text-gray-900">
                {selectedShow?.venue} · {selectedShow?.city}
              </div>
              <div className="text-xs text-gray-400">
                {selectedShow && new Date(selectedShow.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Status selector */}
              <div className="flex items-center bg-gray-100 rounded-full p-0.5 text-xs gap-0.5">
                {(Object.keys(STATUS) as AdvanceStatus[]).map(s => (
                  <button
                    key={s}
                    onClick={() => markStatus(s)}
                    disabled={!editable}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors disabled:cursor-not-allowed ${
                      advance.status === s ? 'bg-gray-900 text-canvas shadow-sm' : 'text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    {STATUS[s].label}
                  </button>
                ))}
              </div>
              {editable && (
                <button
                  onClick={() => setSendOpen(true)}
                  className="px-3 py-1.5 text-xs font-semibold bg-gray-900 text-canvas rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Send to Venue ↗
                </button>
              )}
              <button
                onClick={() => setTourSub('daysheet')}
                className="px-3 py-1.5 text-xs font-semibold bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Day Sheet →
              </button>
            </div>
          </div>

          {/* ── Venue library banner ── */}
          {editable && (
            <div className="flex items-center gap-2 px-6 py-2 border-b border-gray-100 bg-gray-50 text-xs">
              {matchingVenue && (
                <button
                  onClick={loadVenueDetails}
                  className="px-2.5 py-1 border border-gray-200 rounded-lg font-medium text-gray-600 hover:bg-canvas transition-colors"
                >
                  📍 We have this venue on file — Load venue details
                </button>
              )}
              <button
                onClick={saveToVenueLibrary}
                className="px-2.5 py-1 border border-gray-200 rounded-lg font-medium text-gray-500 hover:bg-canvas transition-colors ml-auto"
              >
                Save to venue library
              </button>
              {venueMessage && <span className="text-green-600 font-medium">{venueMessage}</span>}
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-0.5 px-6 py-2 border-b border-gray-100">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  tab === t.key
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                }`}
              >
                {t.label}
              </button>
            ))}
            {saved && (
              <span className="ml-auto self-center text-xs text-green-600 font-medium">Saved ✓</span>
            )}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {tab === 'schedule' && (
              <div className="space-y-5 max-w-2xl">
                {editable && (
                  <div className="flex items-center gap-2 flex-wrap bg-gray-50 rounded-xl px-3 py-2.5">
                    <span className="text-xs font-semibold text-gray-500 flex-shrink-0">Shift schedule</span>
                    <select
                      value={bumpFrom}
                      onChange={e => setBumpFrom(e.target.value)}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-canvas"
                    >
                      <option value="">from…</option>
                      {SCHEDULE_FIELD_ORDER.map(f => (
                        <option key={f.key} value={f.key}>{f.label}</option>
                      ))}
                    </select>
                    <span className="text-xs text-gray-400 flex-shrink-0">onward by</span>
                    {[-30, -15, 15, 30, 60].map(min => (
                      <button
                        key={min}
                        onClick={() => bumpSchedule(min)}
                        disabled={!bumpFrom}
                        className="px-2 py-1 text-xs border border-gray-200 rounded-lg hover:bg-canvas disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {min > 0 ? `+${min}` : min}m
                      </button>
                    ))}
                    <input
                      type="number"
                      placeholder="custom"
                      value={bumpCustom}
                      onChange={e => setBumpCustom(e.target.value)}
                      className="w-16 text-xs border border-gray-200 rounded-lg px-2 py-1 bg-canvas"
                    />
                    <button
                      onClick={() => { bumpSchedule(Number(bumpCustom)); setBumpCustom('') }}
                      disabled={!bumpFrom || !bumpCustom}
                      className="px-2 py-1 text-xs border border-gray-200 rounded-lg hover:bg-canvas disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Go
                    </button>
                    {bumpMessage && <span className="text-xs text-green-600 ml-auto flex-shrink-0">{bumpMessage}</span>}
                  </div>
                )}
                <Grid>
                  <Field label="Bus / Lobby Call"      value={advance.schedule.busCall ?? ''}        onChange={v => updateSchedule('busCall', v)}        placeholder="08:00" />
                  <Field label="Lobby Call (Hotel)"    value={advance.schedule.lobbyCall ?? ''}      onChange={v => updateSchedule('lobbyCall', v)}      placeholder="09:00" />
                  <Field label="Load In"               value={advance.schedule.loadIn ?? ''}         onChange={v => updateSchedule('loadIn', v)}         placeholder="13:00" />
                  <Field label="Line Check"            value={advance.schedule.lineCheck ?? ''}      onChange={v => updateSchedule('lineCheck', v)}      placeholder="16:00" />
                  <Field label="Soundcheck"            value={advance.schedule.soundcheck ?? ''}     onChange={v => updateSchedule('soundcheck', v)}     placeholder="17:00" />
                  <Field label="Artist Soundcheck"     value={advance.schedule.artistSoundcheck ?? ''} onChange={v => updateSchedule('artistSoundcheck', v)} placeholder="18:00" />
                  <Field label="Doors Open"            value={advance.schedule.doorsOpen ?? ''}      onChange={v => updateSchedule('doorsOpen', v)}      placeholder="21:00" />
                  <Field label="Support On"            value={advance.schedule.supportOn ?? ''}      onChange={v => updateSchedule('supportOn', v)}      placeholder="22:00" />
                  <Field label="Support Off"           value={advance.schedule.supportOff ?? ''}     onChange={v => updateSchedule('supportOff', v)}     placeholder="23:00" />
                  <Field label="Headline On"           value={advance.schedule.headlineOn ?? ''}     onChange={v => updateSchedule('headlineOn', v)}     placeholder="23:00" />
                  <Field label="Curfew"                value={advance.schedule.curfew ?? ''}         onChange={v => updateSchedule('curfew', v)}         placeholder="02:00" />
                  <Field label="Load Out"              value={advance.schedule.loadOut ?? ''}        onChange={v => updateSchedule('loadOut', v)}        placeholder="02:30" />
                  <Field label="Bus Departure"         value={advance.schedule.departureTime ?? ''}  onChange={v => updateSchedule('departureTime', v)}  placeholder="03:00" />
                </Grid>
                <TextArea label="Schedule Notes" value={advance.schedule.notes ?? ''} onChange={v => updateSchedule('notes', v)} placeholder="Any schedule-specific notes, curfew restrictions, etc." />
              </div>
            )}

            {tab === 'production' && (
              <div className="space-y-5 max-w-2xl">
                <Section title="Stage">
                  <Grid>
                    <Field label="Stage Width"    value={advance.production.stageWidth ?? ''}    onChange={v => updateProduction('stageWidth', v)}    placeholder="40ft" />
                    <Field label="Stage Depth"    value={advance.production.stageDepth ?? ''}    onChange={v => updateProduction('stageDepth', v)}    placeholder="24ft" />
                    <Field label="Roof Height"    value={advance.production.roofHeight ?? ''}    onChange={v => updateProduction('roofHeight', v)}    placeholder="22ft" />
                    <Field label="Riser Count"    value={advance.production.riserCount ?? ''}    onChange={v => updateProduction('riserCount', v)}    placeholder="1 × 4ft center" />
                    <Field label="FOH Position"   value={advance.production.fohPosition ?? ''}   onChange={v => updateProduction('fohPosition', v)}   placeholder="Center, 60ft from stage" />
                    <Field label="MON Position"   value={advance.production.monPosition ?? ''}   onChange={v => updateProduction('monPosition', v)}   placeholder="Stage left wing" />
                  </Grid>
                </Section>
                <Section title="Technical">
                  <Grid>
                    <Field label="Power Supply"   value={advance.production.powerSupply ?? ''}   onChange={v => updateProduction('powerSupply', v)}   placeholder="3-phase 200A per side" />
                    <Field label="Local Crew"     value={advance.production.localCrewCount ?? ''} onChange={v => updateProduction('localCrewCount', v)} placeholder="6 (2 stage, 2 audio, 2 lighting)" />
                    <Field label="Merch Location" value={advance.production.merchandiseLocation ?? ''} onChange={v => updateProduction('merchandiseLocation', v)} placeholder="Foyer, north entrance" />
                  </Grid>
                </Section>
                <TextArea label="Backline Notes" value={advance.production.backlineNotes ?? ''} onChange={v => updateProduction('backlineNotes', v)} placeholder="CDJ-3000s × 4, DJM-V10, turntables available..." rows={2} />
                <TextArea label="Production Notes" value={advance.production.notes ?? ''} onChange={v => updateProduction('notes', v)} placeholder="Any other production details, stage wet warning, etc." />
              </div>
            )}

            {tab === 'hospitality' && (
              <div className="space-y-5 max-w-2xl">
                <Section title="Hotel">
                  <Grid>
                    <Field label="Hotel Name"         value={advance.hospitality.hotel ?? ''}               onChange={v => updateHospitality('hotel', v)}               placeholder="Williamsburg Hotel" />
                    <Field label="Hotel Phone"        value={advance.hospitality.hotelPhone ?? ''}          onChange={v => updateHospitality('hotelPhone', v)}          placeholder="+1 718-362-8100" />
                    <Field label="Confirmation #"     value={advance.hospitality.hotelConfirmation ?? ''}   onChange={v => updateHospitality('hotelConfirmation', v)}   placeholder="WH-44821" />
                    <Field label="Room Count"         value={advance.hospitality.roomCount ?? ''}           onChange={v => updateHospitality('roomCount', v)}           placeholder="3" />
                    <Field label="Check-In"           value={advance.hospitality.checkIn ?? ''}             onChange={v => updateHospitality('checkIn', v)}             placeholder="15:00" />
                    <Field label="Check-Out"          value={advance.hospitality.checkOut ?? ''}            onChange={v => updateHospitality('checkOut', v)}            placeholder="11:00" />
                  </Grid>
                  <Field label="Hotel Address" value={advance.hospitality.hotelAddress ?? ''} onChange={v => updateHospitality('hotelAddress', v)} placeholder="96 Wythe Ave, Brooklyn, NY 11249" />
                  <TextArea label="Room Notes / Assignments" value={advance.hospitality.roomNotes ?? ''} onChange={v => updateHospitality('roomNotes', v)} placeholder="Artist - King Suite 401. TM - King 312. FOH - Double 310." rows={2} />
                </Section>
                <Section title="Dressing Rooms">
                  <Field label="Dressing Rooms" value={advance.hospitality.dressingRooms ?? ''} onChange={v => updateHospitality('dressingRooms', v)} placeholder="1 artist room (stage right), 1 support room (stage left)" />
                  <TextArea label="Dressing Room Notes" value={advance.hospitality.dressingRoomNotes ?? ''} onChange={v => updateHospitality('dressingRoomNotes', v)} placeholder="Green room code, private bathroom, etc." rows={2} />
                </Section>
                <Section title="Catering">
                  <Grid>
                    <Field label="Catering Company" value={advance.hospitality.cateringCompany ?? ''} onChange={v => updateHospitality('cateringCompany', v)} placeholder="Venue in-house" />
                    <Field label="Runner Name"       value={advance.hospitality.runnerName ?? ''}      onChange={v => updateHospitality('runnerName', v)}      placeholder="Alex Torres" />
                    <Field label="Runner Phone"      value={advance.hospitality.runnerPhone ?? ''}     onChange={v => updateHospitality('runnerPhone', v)}     placeholder="+1 917-555-0193" />
                    <Field label="Meal Times"        value={advance.hospitality.mealTimes ?? ''}       onChange={v => updateHospitality('mealTimes', v)}       placeholder="Dinner 19:00, Buyout $250 post-show" />
                  </Grid>
                  <TextArea label="Dietary Restrictions" value={advance.hospitality.dietaryNotes ?? ''} onChange={v => updateHospitality('dietaryNotes', v)} placeholder="Gluten-free required. No shellfish." rows={2} />
                </Section>
                <TextArea label="Hospitality Notes" value={advance.hospitality.notes ?? ''} onChange={v => updateHospitality('notes', v)} placeholder="Rider details, any outstanding items, etc." />
              </div>
            )}

            {tab === 'logistics' && (
              <div className="space-y-5 max-w-2xl">
                <Section title="Venue Access">
                  <Field label="Loading Dock Address" value={advance.logistics.loadingDockAddress ?? ''} onChange={v => updateLogistics('loadingDockAddress', v)} placeholder="66 N 10th St, Brooklyn, NY 11211" />
                  <TextArea label="Parking Instructions" value={advance.logistics.parkingInstructions ?? ''} onChange={v => updateLogistics('parkingInstructions', v)} placeholder="Artist van: Stage door on N 10th St. Loading dock code: 7744." rows={2} />
                  <Field label="Bus Parking"          value={advance.logistics.busParking ?? ''}             onChange={v => updateLogistics('busParking', v)}             placeholder="N 10th St — confirmed with venue" />
                  <TextArea label="Loading Dock Notes" value={advance.logistics.loadingDockNotes ?? ''} onChange={v => updateLogistics('loadingDockNotes', v)} placeholder="Freight elevator, max 2,000 lbs." rows={2} />
                </Section>
                <Section title="Travel">
                  <Grid>
                    <Field label="Nearest Airport"    value={advance.logistics.nearestAirport ?? ''}    onChange={v => updateLogistics('nearestAirport', v)}    placeholder="JFK (18mi) / LGA (12mi)" />
                    <Field label="Distance"           value={advance.logistics.distanceToAirport ?? ''}  onChange={v => updateLogistics('distanceToAirport', v)}  placeholder="35 min to JFK" />
                  </Grid>
                  <Field label="Ground Transport"     value={advance.logistics.groundTransport ?? ''}    onChange={v => updateLogistics('groundTransport', v)}    placeholder="Black car via venue. Confirmation pending." />
                  <TextArea label="Flights" value={advance.logistics.flights ?? ''} onChange={v => updateLogistics('flights', v)} placeholder="DL 447 → JFK Dep 08:30 | Return open" rows={2} />
                </Section>
                <TextArea label="Logistics Notes" value={advance.logistics.notes ?? ''} onChange={v => updateLogistics('notes', v)} placeholder="No-fly zone, noise restrictions, etc." />
              </div>
            )}

            {tab === 'contacts' && (
              <div className="space-y-4 max-w-2xl">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Venue &amp; Show Contacts</span>
                  {editable && (
                    <button
                      onClick={addContact}
                      className="px-3 py-1 text-xs font-semibold bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      + Add Contact
                    </button>
                  )}
                </div>

                {advance.contacts.length === 0 && (
                  <div className="text-sm text-gray-400 py-4 text-center border border-dashed border-gray-200 rounded-xl">
                    No contacts added yet. Click "Add Contact" to start.
                  </div>
                )}

                {advance.contacts.map((contact, i) => (
                  <div key={contact.id} className="bg-gray-50 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-500">Contact {i + 1}</span>
                      {editable && (
                        <button onClick={() => removeContact(contact.id)} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                      )}
                    </div>
                    <Grid>
                      <Field label="Role"  value={contact.role}         onChange={v => updateContact(contact.id, 'role', v)}  placeholder="Production Manager" />
                      <Field label="Name"  value={contact.name}         onChange={v => updateContact(contact.id, 'name', v)}  placeholder="Jamie Chen" />
                      <Field label="Phone" value={contact.phone ?? ''}  onChange={v => updateContact(contact.id, 'phone', v)} placeholder="+1 718-555-0122" />
                      <Field label="Email" value={contact.email ?? ''}  onChange={v => updateContact(contact.id, 'email', v)} placeholder="jamie@venue.com" />
                    </Grid>
                    {contact.notes !== undefined && (
                      <TextArea label="Notes" value={contact.notes} onChange={v => updateContact(contact.id, 'notes', v)} placeholder="" rows={2} />
                    )}
                  </div>
                ))}
              </div>
            )}

            {tab === 'notes' && (
              <div className="space-y-5 max-w-2xl">
                <Grid>
                  <Field label="WiFi Network"        value={advance.wifi ?? ''}              onChange={v => setAdvance({ ...advance, wifi: v })}              placeholder="VENUE_ARTIST" />
                  <Field label="WiFi Password"       value={advance.wifiPassword ?? ''}      onChange={v => setAdvance({ ...advance, wifiPassword: v })}      placeholder="Pass2026!" mono />
                  <div>
                    <Field label="Guest List Cap"      value={advance.guestListCap ?? ''}      onChange={v => setAdvance({ ...advance, guestListCap: v })}      placeholder="20" />
                    {advance.guestListCap && (() => {
                      const cap = parseInt(advance.guestListCap, 10)
                      if (!cap) return null
                      const used = guestList.filter(g => g.showId === selectedShow?.id).reduce((sum, g) => sum + g.qty, 0)
                      const over = used > cap
                      return (
                        <div className={`text-[11px] mt-1 font-medium ${over ? 'text-red-500' : 'text-gray-400'}`}>
                          {used} / {cap} used{over ? ' — over cap' : ''}
                        </div>
                      )
                    })()}
                  </div>
                </Grid>
                <TextArea label="Weather Notes"      value={advance.weatherNotes ?? ''}      onChange={v => setAdvance({ ...advance, weatherNotes: v })}      placeholder="Clear, 72°F. No rain expected." rows={2} />
                <TextArea label="Guest List Notes"   value={advance.guestListNotes ?? ''}    onChange={v => setAdvance({ ...advance, guestListNotes: v })}    placeholder="Submit names by 18:00 day-of to production manager." rows={2} />
                <TextArea label="General Notes"      value={advance.generalNotes ?? ''}      onChange={v => setAdvance({ ...advance, generalNotes: v })}      placeholder="Any overall notes, security alerts, VIP info, etc." rows={4} />
              </div>
            )}
          </div>

          {/* Bottom bar */}
          <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-t border-gray-100 bg-gray-50">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <div className={`w-2 h-2 rounded-full ${STATUS[advance.status].dot}`} />
              {STATUS[advance.status].label}
              {advance.sentAt && <span className="text-gray-300">· Sent {advance.sentAt}</span>}
            </div>
            {editable && (
              <button
                onClick={saveAdvance}
                className="px-4 py-1.5 text-sm font-semibold bg-gray-900 text-canvas rounded-lg hover:bg-gray-700 transition-colors"
              >
                Save Advance
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Send Modal ── */}
      {sendOpen && advance && selectedShow && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSendOpen(false)}>
          <div className="bg-canvas rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Send Advance to Venue</h2>
              <button onClick={() => setSendOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <p className="text-sm text-gray-500">
              This will send the advance template to the following contacts at <strong>{selectedShow.venue}</strong>. They'll receive a link to fill in their sections.
            </p>
            <div className="space-y-2">
              {advance.contacts.filter(c => c.email).map(c => (
                <div key={c.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
                  <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-600">
                    {c.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-800">{c.name}</div>
                    <div className="text-xs text-gray-400">{c.role} · {c.email}</div>
                  </div>
                </div>
              ))}
              {advance.contacts.filter(c => c.email).length === 0 && (
                <div className="text-sm text-gray-400 py-2 text-center">
                  No contacts with email addresses. Add emails in the Contacts tab first.
                </div>
              )}
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
              <strong>Note:</strong> Google Calendar sync and email delivery require connecting your Google account. Coming soon.
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setSendOpen(false)} className="flex-1 py-2 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50">Cancel</button>
              <button
                onClick={() => { markStatus('sent'); setSendOpen(false) }}
                className="flex-1 py-2 text-sm font-semibold bg-gray-900 text-canvas rounded-xl hover:bg-gray-700 transition-colors"
              >
                Mark as Sent
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
