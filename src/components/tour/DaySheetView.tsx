'use client'
// ──────────────────────────────────────────────────────────
//  Day Sheet Generator
//  Auto-generated from the advance data for a selected show.
//  Professional format — same as what tour managers distribute
//  to crew every morning on tour.
// ──────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { useStore } from '@/lib/store'
import type { ShowAdvance, Show } from '@/types'

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div className="flex py-1.5 border-b border-gray-100 last:border-0">
      <span className="w-36 flex-shrink-0 text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</span>
      <span className="text-sm text-gray-800">{value}</span>
    </div>
  )
}

function Block({ title, children, accent }: { title: string; children: React.ReactNode; accent?: string }) {
  return (
    <div className="mb-5">
      <div className={`text-[10px] font-bold uppercase tracking-widest mb-2 pb-1 border-b-2 ${accent ?? 'border-gray-200 text-gray-400'}`}>
        {title}
      </div>
      <div>{children}</div>
    </div>
  )
}

export function DaySheetView() {
  const client = useStore(s => s.getClient())
  const { setTourSub } = useStore()
  const sharedSelectedShowId = useStore(s => s.selectedShowId)
  const [selectedShowId, setSelectedShowId] = useState<string | null>(null)

  // Jumping here from elsewhere (e.g. Tour's "Day Sheet" quick link) sets the
  // shared selectedShowId — adopt it once, without disturbing this view's own
  // "most in-progress advance" fallback when arriving directly.
  useEffect(() => {
    if (sharedSelectedShowId && sharedSelectedShowId !== selectedShowId) {
      selectShow(sharedSelectedShowId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedSelectedShowId])

  function selectShow(id: string) {
    setSelectedShowId(id)
  }

  if (!client) return null

  const shows = client.tour.shows
  const advances = client.tour.advances ?? []

  const show: Show | undefined = selectedShowId
    ? shows.find(s => s.id === selectedShowId)
    : shows.find(s => {
        const adv = advances.find(a => a.showId === s.id)
        return adv?.status === 'complete' || adv?.status === 'in-progress'
      }) ?? shows[0]

  const advance: ShowAdvance | undefined = show
    ? advances.find(a => a.showId === show.id)
    : undefined

  const showDate = show ? new Date(show.date) : new Date()
  const dateStr = showDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Show selector sidebar */}
      <div className="w-[200px] flex-shrink-0 border-r border-gray-100 flex flex-col">
        <div className="px-4 py-3 border-b border-gray-100">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Select Show</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {shows.map(s => {
            const adv = advances.find(a => a.showId === s.id)
            const d = new Date(s.date)
            return (
              <button
                key={s.id}
                onClick={() => selectShow(s.id)}
                className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                  show?.id === s.id ? 'bg-blue-50' : ''
                }`}
              >
                <div className="text-xs font-semibold text-gray-800 truncate">{s.venue}</div>
                <div className="text-[11px] text-gray-400">{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                {!adv || adv.status === 'draft' ? (
                  <span className="text-[10px] text-gray-300">No advance yet</span>
                ) : (
                  <span className={`text-[10px] font-medium ${adv.status === 'complete' ? 'text-green-600' : 'text-amber-600'}`}>
                    {adv.status === 'complete' ? 'Complete' : 'In Progress'}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <div className="p-3 border-t border-gray-100">
          <button
            onClick={() => setTourSub('advance')}
            className="w-full text-xs font-medium text-gray-500 hover:text-gray-800 text-center py-1"
          >
            ← Edit Advance
          </button>
        </div>
      </div>

      {/* Day sheet */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {!show ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">No shows available</div>
        ) : (
          <div className="max-w-2xl mx-auto py-8 px-6">
            {/* Header */}
            <div className="bg-gray-900 text-canvas rounded-2xl px-8 py-6 mb-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Day Sheet</div>
                  <div className="text-2xl font-bold">{client.name}</div>
                  <div className="text-lg text-gray-300 mt-1">{show.venue}</div>
                  <div className="text-sm text-gray-400">{show.city}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-gray-300">{dateStr}</div>
                  {advance?.weatherNotes && (
                    <div className="text-xs text-gray-400 mt-1">{advance.weatherNotes}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Schedule */}
            {advance?.schedule && Object.values(advance.schedule).some(Boolean) && (
              <div className="bg-canvas rounded-2xl px-6 py-5 mb-4 shadow-sm">
                <Block title="Schedule" accent="border-blue-400 text-blue-500">
                  <Row label="Bus Call"         value={advance.schedule.busCall} />
                  <Row label="Lobby Call"       value={advance.schedule.lobbyCall} />
                  <Row label="Load In"          value={advance.schedule.loadIn} />
                  <Row label="Line Check"       value={advance.schedule.lineCheck} />
                  <Row label="Soundcheck"       value={advance.schedule.soundcheck} />
                  <Row label="Artist SC"        value={advance.schedule.artistSoundcheck} />
                  <Row label="Doors"            value={advance.schedule.doorsOpen} />
                  <Row label="Support On"       value={advance.schedule.supportOn} />
                  <Row label="Support Off"      value={advance.schedule.supportOff} />
                  <Row label="Headline On"      value={advance.schedule.headlineOn} />
                  <Row label="Curfew"           value={advance.schedule.curfew} />
                  <Row label="Load Out"         value={advance.schedule.loadOut} />
                  <Row label="Bus Departure"    value={advance.schedule.departureTime} />
                  {advance.schedule.notes && (
                    <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500 italic">{advance.schedule.notes}</div>
                  )}
                </Block>
              </div>
            )}

            {/* Hotel */}
            {advance?.hospitality?.hotel && (
              <div className="bg-canvas rounded-2xl px-6 py-5 mb-4 shadow-sm">
                <Block title="Hotel" accent="border-purple-400 text-purple-500">
                  <Row label="Hotel"        value={advance.hospitality.hotel} />
                  <Row label="Address"      value={advance.hospitality.hotelAddress} />
                  <Row label="Phone"        value={advance.hospitality.hotelPhone} />
                  <Row label="Confirmation" value={advance.hospitality.hotelConfirmation} />
                  <Row label="Check-In"     value={advance.hospitality.checkIn} />
                  <Row label="Check-Out"    value={advance.hospitality.checkOut} />
                  <Row label="Rooms"        value={advance.hospitality.roomCount} />
                  {advance.hospitality.roomNotes && (
                    <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">{advance.hospitality.roomNotes}</div>
                  )}
                </Block>
              </div>
            )}

            {/* Venue / Production */}
            {advance?.production && Object.values(advance.production).some(Boolean) && (
              <div className="bg-canvas rounded-2xl px-6 py-5 mb-4 shadow-sm">
                <Block title="Venue / Production" accent="border-orange-400 text-orange-500">
                  <Row label="Address"      value={advance.logistics?.loadingDockAddress} />
                  <Row label="Stage"        value={[advance.production.stageWidth, advance.production.stageDepth, advance.production.roofHeight].filter(Boolean).join(' × ')} />
                  <Row label="FOH"          value={advance.production.fohPosition} />
                  <Row label="Monitors"     value={advance.production.monPosition} />
                  <Row label="Power"        value={advance.production.powerSupply} />
                  <Row label="Local Crew"   value={advance.production.localCrewCount} />
                  <Row label="Parking"      value={advance.logistics?.parkingInstructions} />
                  <Row label="Bus Parking"  value={advance.logistics?.busParking} />
                  {advance.production.backlineNotes && (
                    <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">{advance.production.backlineNotes}</div>
                  )}
                </Block>
              </div>
            )}

            {/* Catering */}
            {(advance?.hospitality?.cateringCompany || advance?.hospitality?.mealTimes) && (
              <div className="bg-canvas rounded-2xl px-6 py-5 mb-4 shadow-sm">
                <Block title="Catering" accent="border-green-400 text-green-600">
                  <Row label="Catering"     value={advance.hospitality.cateringCompany} />
                  <Row label="Meal Times"   value={advance.hospitality.mealTimes} />
                  <Row label="Dietary"      value={advance.hospitality.dietaryNotes} />
                  <Row label="Runner"       value={advance.hospitality.runnerName ? `${advance.hospitality.runnerName} ${advance.hospitality.runnerPhone ?? ''}`.trim() : undefined} />
                  <Row label="Dressing Rm"  value={advance.hospitality.dressingRooms} />
                </Block>
              </div>
            )}

            {/* Travel */}
            {(advance?.logistics?.flights || advance?.logistics?.groundTransport) && (
              <div className="bg-canvas rounded-2xl px-6 py-5 mb-4 shadow-sm">
                <Block title="Travel" accent="border-sky-400 text-sky-600">
                  <Row label="Flights"      value={advance.logistics.flights} />
                  <Row label="Airport"      value={advance.logistics.nearestAirport} />
                  <Row label="Ground"       value={advance.logistics.groundTransport} />
                </Block>
              </div>
            )}

            {/* Contacts */}
            {advance?.contacts && advance.contacts.length > 0 && (
              <div className="bg-canvas rounded-2xl px-6 py-5 mb-4 shadow-sm">
                <Block title="Contacts" accent="border-red-400 text-red-500">
                  {advance.contacts.map(c => (
                    <div key={c.id} className="flex py-1.5 border-b border-gray-100 last:border-0">
                      <span className="w-36 flex-shrink-0 text-xs font-semibold text-gray-400 uppercase tracking-wide">{c.role}</span>
                      <div>
                        <div className="text-sm text-gray-800">{c.name}</div>
                        {(c.phone || c.email) && (
                          <div className="text-xs text-gray-400">{[c.phone, c.email].filter(Boolean).join(' · ')}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </Block>
              </div>
            )}

            {/* Notes */}
            {(advance?.wifi || advance?.guestListCap || advance?.generalNotes) && (
              <div className="bg-canvas rounded-2xl px-6 py-5 mb-4 shadow-sm">
                <Block title="Notes" accent="border-gray-300 text-gray-400">
                  {advance?.wifi && (
                    <Row label="WiFi" value={`${advance.wifi}${advance.wifiPassword ? ` / ${advance.wifiPassword}` : ''}`} />
                  )}
                  <Row label="Guest List" value={advance?.guestListCap ? `Cap: ${advance.guestListCap}` : undefined} />
                  {advance?.guestListNotes && (
                    <div className="text-xs text-gray-500 mt-1">{advance.guestListNotes}</div>
                  )}
                  {advance?.generalNotes && (
                    <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-600 leading-relaxed">{advance.generalNotes}</div>
                  )}
                </Block>
              </div>
            )}

            {/* No advance data */}
            {!advance && (
              <div className="bg-canvas rounded-2xl px-6 py-10 text-center text-gray-400 shadow-sm">
                <div className="text-sm mb-2">No advance data for this show yet.</div>
                <button onClick={() => setTourSub('advance')} className="text-sm text-blue-500 hover:underline">
                  Create advance →
                </button>
              </div>
            )}

            {/* Footer */}
            <div className="text-center text-[10px] uppercase tracking-widest text-gray-300 mt-6">
              Generated by Studio · {new Date().toLocaleDateString()}
            </div>

            {/* Google Calendar banner */}
            <div className="mt-4 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-blue-700">Sync to Google Calendar</div>
                <div className="text-xs text-blue-500">Push the show details and schedule to the artist's calendar</div>
              </div>
              <button className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors opacity-60 cursor-not-allowed" disabled>
                Connect Google →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
