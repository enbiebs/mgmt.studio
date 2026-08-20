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

export function CrewView() {
  const client = useStore(s => s.getClient())
  const editable = useStore(s => s.canEdit('tour'))
  const { deleteCrewMember } = useStore()
  const [addOpen, setAddOpen] = useState(false)

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
            <div key={cm.id} className="group border border-gray-100 rounded-xl px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{person.name}</div>
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
                  onClick={() => { if (confirm(`Remove ${person.name} from crew?`)) deleteCrewMember(cm.id) }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-400 text-xs flex-shrink-0"
                >
                  ✕
                </button>
              )}
            </div>
          )
        })}
      </div>

      {addOpen && <AddCrewModal onClose={() => setAddOpen(false)} />}
    </div>
  )
}

function AddCrewModal({ onClose }: { onClose: () => void }) {
  const { saveCrewMember } = useStore()
  const [personId, setPersonId] = useState('')
  const [role, setRole] = useState<CrewRole>('other')
  const [emergencyName, setEmergencyName] = useState('')
  const [emergencyPhone, setEmergencyPhone] = useState('')
  const [passport, setPassport] = useState('')
  const [notes, setNotes] = useState('')

  function handleAdd() {
    if (!personId) return
    const member: CrewMember = {
      id: 'crew-' + uid(), personId, role,
      emergencyName: emergencyName.trim() || undefined,
      emergencyPhone: emergencyPhone.trim() || undefined,
      passport: passport.trim() || undefined,
      notes: notes.trim() || undefined,
    }
    saveCrewMember(member)
    onClose()
  }

  return (
    <Modal title="Add a crew member" onClose={onClose} footer={
      <>
        <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
        <button onClick={handleAdd} disabled={!personId} className="px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:opacity-40">Add</button>
      </>
    }>
      <PersonPicker value={personId} onChange={setPersonId} />
      <FormField label="Role">
        <select className={selectClass} value={role} onChange={e => setRole(e.target.value as CrewRole)}>
          {CREW_ROLE_ORDER.map(r => <option key={r} value={r}>{CREW_ROLE_LABEL[r]}</option>)}
        </select>
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Emergency contact">
          <input className={inputClass} placeholder="Name" value={emergencyName} onChange={e => setEmergencyName(e.target.value)} />
        </FormField>
        <FormField label="Emergency phone">
          <input className={inputClass} value={emergencyPhone} onChange={e => setEmergencyPhone(e.target.value)} />
        </FormField>
      </div>
      <FormField label="Passport expiry">
        <input className={inputClass} placeholder="e.g. 2029-04" value={passport} onChange={e => setPassport(e.target.value)} />
      </FormField>
      <FormField label="Notes">
        <input className={inputClass} value={notes} onChange={e => setNotes(e.target.value)} />
      </FormField>
    </Modal>
  )
}
