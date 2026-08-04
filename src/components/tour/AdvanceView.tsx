'use client'
// ──────────────────────────────────────────────────────────
//  Advance Template Creator
//  One advance per show — filled in by tour manager,
//  then sent to venue PM, hospitality, and logistics contacts.
//  Drives the Day Sheet and calendar sync.
// ──────────────────────────────────────────────────────────

import { useState } from 'react'
import { useStore } from '@/lib/store'
import type { ShowAdvance, AdvanceStatus, AdvanceContact, Show } from '@/types'
import { uid } from '@/lib/utils'

// ── Status config ───────────────────────────────────────────
const STATUS: Record<AdvanceStatus, { label: string; dot: string; badge: string }> = {
  draft:       { label: 'Draft',       dot: 'bg-gray-300',   badge: 'bg-gray-100 text-gray-500'   },
  sent:        { label: 'Sent',        dot: 'bg-blue-400',   badge: 'bg-blue-50 text-blue-600'    },
  'in-progress':{ label: 'In Progress',dot: 'bg-amber-400',  badge: 'bg-amber-50 text-amber-700'  },
  complete:    { label: 'Complete',    dot: 'bg-green-500',  badge: 'bg-green-50 text-green-700'  },
}

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
function Field({ label, value, onChange, placeholder, mono }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean
}) {
  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent ${mono ? 'font-mono' : ''}`}
      />
    </div>
  )
}

function TextArea({ label, value, onChange, placeholder, rows = 3 }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number
}) {
  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent resize-none"
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
  const { setBizSub, setTourSub } = useStore()
  const [selectedShowId, setSelectedShowId] = useState<string | null>(null)
  const [advance, setAdvance] = useState<ShowAdvance | null>(null)
  const [tab, setTab] = useState<Tab>('schedule')
  const [sendOpen, setSendOpen] = useState(false)
  const [saved, setSaved] = useState(false)

  if (!client) return null

  const shows = client.tour.shows
  const advances = client.tour.advances ?? []

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
    // In a real app this would persist to Supabase
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function markStatus(status: AdvanceStatus) {
    if (!advance) return
    setAdvance({ ...advance, status, sentAt: status === 'sent' ? new Date().toISOString().slice(0, 10) : advance.sentAt })
  }

  const selectedShow = shows.find(s => s.id === selectedShowId)

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
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                      advance.status === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    {STATUS[s].label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setSendOpen(true)}
                className="px-3 py-1.5 text-xs font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Send to Venue ↗
              </button>
              <button
                onClick={() => setTourSub('daysheet')}
                className="px-3 py-1.5 text-xs font-semibold bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Day Sheet →
              </button>
            </div>
          </div>

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
                  <button
                    onClick={addContact}
                    className="px-3 py-1 text-xs font-semibold bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    + Add Contact
                  </button>
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
                      <button onClick={() => removeContact(contact.id)} className="text-xs text-red-400 hover:text-red-600">Remove</button>
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
                  <Field label="Guest List Cap"      value={advance.guestListCap ?? ''}      onChange={v => setAdvance({ ...advance, guestListCap: v })}      placeholder="20" />
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
            <button
              onClick={saveAdvance}
              className="px-4 py-1.5 text-sm font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Save Advance
            </button>
          </div>
        </div>
      )}

      {/* ── Send Modal ── */}
      {sendOpen && advance && selectedShow && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSendOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
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
                className="flex-1 py-2 text-sm font-semibold bg-gray-900 text-white rounded-xl hover:bg-gray-700 transition-colors"
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
