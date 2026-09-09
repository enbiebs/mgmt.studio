'use client'
import { useState } from 'react'
import { useStore } from '@/lib/store'
import { uid } from '@/lib/utils'
import { Modal, FormField, inputClass, selectClass } from '@/components/ui/Modal'
import { PersonPicker } from '@/components/people/PersonPicker'
import type { CrewMember, CrewRole } from '@/types'

export const CREW_ROLE_ORDER: CrewRole[] = [
  'tour-manager', 'production-manager', 'foh', 'monitors', 'lighting',
  'video', 'backline', 'merch', 'security', 'driver', 'artist', 'other',
]
export const CREW_ROLE_LABEL: Record<CrewRole, string> = {
  'tour-manager': 'Tour Manager', 'production-manager': 'Production Manager',
  foh: 'FOH', monitors: 'Monitors', lighting: 'Lighting', video: 'Video',
  backline: 'Backline', merch: 'Merch', security: 'Security', driver: 'Driver',
  artist: 'Artist', other: 'Other',
}

// Passport expiry is free-typed as "YYYY-MM" or "YYYY-MM-DD" — anything else
// (blank, "n/a", freeform text) is silently ignored rather than flagged.
function passportWarning(passport?: string): 'expired' | 'soon' | null {
  if (!passport) return null
  const m = passport.trim().match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/)
  if (!m) return null
  const expiry = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3] ?? '1'))
  const sixMonthsOut = new Date()
  sixMonthsOut.setMonth(sixMonthsOut.getMonth() + 6)
  if (expiry < new Date()) return 'expired'
  if (expiry < sixMonthsOut) return 'soon'
  return null
}

export function CrewView() {
  const client = useStore(s => s.getClient())
  const editable = useStore(s => s.canEdit('tour'))
  const { deleteCrewMember } = useStore()
  const [addOpen, setAddOpen] = useState(false)
  const [editMember, setEditMember] = useState<CrewMember | null>(null)

  if (!client) return null
  const crew = client.tour.crew ?? []
  const people = client.people ?? []

  return (
    <div className="flex-1 overflow-auto p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="font-serif text-2xl font-medium">Tour Crew</div>
          <div className="text-sm text-gray-400 mt-1">{crew.length} on the roster</div>
        </div>
        {editable && (
          <button
            onClick={() => setAddOpen(true)}
            className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
          >
            + Add crew member
          </button>
        )}
      </div>

      {crew.length === 0 && (
        <div className="text-sm text-gray-300 text-center py-12">No crew added yet</div>
      )}

      <div className="flex flex-col gap-2">
        {crew.map(cm => {
          const person = people.find(p => p.id === cm.personId)
          if (!person) return null
          return (
            <div
              key={cm.id}
              onClick={() => setEditMember(cm)}
              className="group border border-gray-100 rounded-xl px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <div className="text-sm font-medium">{person.name}</div>
                  {passportWarning(cm.passport) && (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      passportWarning(cm.passport) === 'expired' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {passportWarning(cm.passport) === 'expired' ? 'PASSPORT EXPIRED' : 'PASSPORT EXPIRING SOON'}
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {[person.email, person.phone, cm.notes].filter(Boolean).join(' · ')}
                </div>
                {(cm.emergencyName || cm.passport) && (
                  <div className="text-[11px] text-gray-300 mt-0.5">
                    {cm.emergencyName && `Emergency: ${cm.emergencyName}${cm.emergencyPhone ? ` (${cm.emergencyPhone})` : ''}`}
                    {cm.emergencyName && cm.passport ? ' · ' : ''}
                    {cm.passport && `Passport exp. ${cm.passport}`}
                  </div>
                )}
              </div>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-gray-600 flex-shrink-0">
                {CREW_ROLE_LABEL[cm.role]}
              </span>
              {editable && (
                <button
                  onClick={(e) => { e.stopPropagation(); if (confirm(`Remove ${person.name} from crew?`)) deleteCrewMember(cm.id) }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-400 text-xs flex-shrink-0"
                >
                  ✕
                </button>
              )}
            </div>
          )
        })}
      </div>

      {addOpen && <CrewMemberModal onClose={() => setAddOpen(false)} />}
      {editMember && <CrewMemberModal member={editMember} onClose={() => setEditMember(null)} />}
    </div>
  )
}

function CrewMemberModal({ member, onClose }: { member?: CrewMember; onClose: () => void }) {
  const editable = useStore(s => s.canEdit('tour'))
  const client = useStore(s => s.getClient())
  const { saveCrewMember } = useStore()
  const [personId, setPersonId] = useState(member?.personId ?? '')
  const [role, setRole] = useState<CrewRole>(member?.role ?? 'other')
  const [emergencyName, setEmergencyName] = useState(member?.emergencyName ?? '')
  const [emergencyPhone, setEmergencyPhone] = useState(member?.emergencyPhone ?? '')
  const [passport, setPassport] = useState(member?.passport ?? '')
  const [notes, setNotes] = useState(member?.notes ?? '')
  const existingPerson = member ? client?.people?.find(p => p.id === member.personId) : undefined

  function handleSave() {
    if (!personId) return
    saveCrewMember({
      id: member?.id ?? 'crew-' + uid(), personId, role,
      emergencyName: emergencyName.trim() || undefined,
      emergencyPhone: emergencyPhone.trim() || undefined,
      passport: passport.trim() || undefined,
      notes: notes.trim() || undefined,
    })
    onClose()
  }

  return (
    <Modal title={member ? `Crew · ${existingPerson?.name ?? 'Member'}` : 'Add a crew member'} onClose={onClose} footer={
      editable ? (
        <>
          <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={!personId} className="px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:opacity-40">
            {member ? 'Save' : 'Add'}
          </button>
        </>
      ) : (
        <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Close</button>
      )
    }>
      {/* Reassigning who a crew record is about isn't supported here — remove and re-add instead */}
      {member ? (
        <FormField label="Person">
          <div className={`${inputClass} flex items-center bg-gray-50 text-gray-500`}>{existingPerson?.name ?? 'Unknown'}</div>
        </FormField>
      ) : (
        <PersonPicker value={personId} onChange={setPersonId} />
      )}
      <FormField label="Role">
        <select className={selectClass} value={role} onChange={e => setRole(e.target.value as CrewRole)} disabled={!editable}>
          {CREW_ROLE_ORDER.map(r => <option key={r} value={r}>{CREW_ROLE_LABEL[r]}</option>)}
        </select>
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Emergency contact">
          <input className={inputClass} placeholder="Name" value={emergencyName} onChange={e => setEmergencyName(e.target.value)} disabled={!editable} />
        </FormField>
        <FormField label="Emergency phone">
          <input className={inputClass} value={emergencyPhone} onChange={e => setEmergencyPhone(e.target.value)} disabled={!editable} />
        </FormField>
      </div>
      <FormField label="Passport expiry">
        <input className={inputClass} placeholder="e.g. 2029-04" value={passport} onChange={e => setPassport(e.target.value)} disabled={!editable} />
      </FormField>
      <FormField label="Notes">
        <input className={inputClass} value={notes} onChange={e => setNotes(e.target.value)} disabled={!editable} />
      </FormField>
    </Modal>
  )
}
