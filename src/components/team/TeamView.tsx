'use client'
import { useState } from 'react'
import { useStore } from '@/lib/store'
import { uid } from '@/lib/utils'
import { Modal, FormField, inputClass } from '@/components/ui/Modal'
import { CREW_ROLE_LABEL } from '@/components/tour/CrewView'
import { ROLE_LABEL as STAKEHOLDER_ROLE_LABEL } from '@/components/songs/StatusView'
import { AccessPanel } from '@/components/team/AccessPanel'
import type { Person, TravelItem } from '@/types'

function travelLabel(item: TravelItem): string {
  if (item.kind === 'flight') {
    const first = item.legs[0], last = item.legs[item.legs.length - 1]
    return `Flight ${first?.from ?? ''}→${last?.to ?? ''}`.trim()
  }
  if (item.kind === 'hotel') return `Hotel${item.name ? ` — ${item.name}` : ''}`
  return `Ground${item.provider ? ` — ${item.provider}` : ''}`
}

export function TeamView() {
  const client = useStore(s => s.getClient())
  const editable = useStore(s => s.canEdit('team'))
  const { deletePerson } = useStore()
  const [addOpen, setAddOpen] = useState(false)
  const [openPersonId, setOpenPersonId] = useState<string | null>(null)

  if (!client) return null
  const people = client.people ?? []
  const openPerson = openPersonId ? people.find(p => p.id === openPersonId) ?? null : null

  function linksFor(personId: string) {
    const crewLinks = (client!.tour.crew ?? [])
      .filter(cm => cm.personId === personId)
      .map(cm => `Crew — ${CREW_ROLE_LABEL[cm.role]}`)
    const stakeholderLinks = client!.songs.albums.flatMap(a =>
      (a.stakeholders ?? [])
        .filter(s => s.personId === personId)
        .map(s => `${a.title} — ${STAKEHOLDER_ROLE_LABEL[s.role]}`)
    )
    const travelLinks = (client!.tour.travel ?? [])
      .filter(t => t.personIds?.includes(personId))
      .map(t => `Travel — ${travelLabel(t)}`)
    return [...crewLinks, ...stakeholderLinks, ...travelLinks]
  }

  return (
    <div className="flex-1 overflow-auto p-6 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="font-serif text-2xl font-medium">Team</div>
          <div className="text-sm text-gray-400 mt-1">
            One record per person, shared across the whole app — crew, stakeholders, travel, and more all point back here
          </div>
        </div>
        {editable && (
          <button
            onClick={() => setAddOpen(true)}
            className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors flex-shrink-0"
          >
            + Add team member
          </button>
        )}
      </div>

      {people.length === 0 && (
        <div className="text-sm text-gray-300 text-center py-12">No team members added yet</div>
      )}

      <div className="flex flex-col gap-2">
        {people.map(p => {
          const links = linksFor(p.id)
          return (
            <div
              key={p.id}
              onClick={() => setOpenPersonId(p.id)}
              className="group border border-gray-100 rounded-xl px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{p.name}{p.org && <span className="text-gray-400 font-normal"> · {p.org}</span>}</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {[p.email, p.phone].filter(Boolean).join(' · ') || '—'}
                </div>
                {links.length > 0 ? (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {links.map((l, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700">{l}</span>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-gray-300 mt-1">Not linked anywhere yet</div>
                )}
              </div>
              {editable && (
                <button
                  onClick={(e) => { e.stopPropagation(); if (confirm(`Delete ${p.name}? This also removes them from anywhere they're linked (crew, stakeholders).`)) deletePerson(p.id) }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-400 text-xs flex-shrink-0"
                >
                  ✕
                </button>
              )}
            </div>
          )
        })}
      </div>

      {addOpen && <PersonModal onClose={() => setAddOpen(false)} />}
      {openPerson && <PersonModal person={openPerson} links={linksFor(openPerson.id)} onClose={() => setOpenPersonId(null)} />}
    </div>
  )
}

function PersonModal({ person, links, onClose }: { person?: Person; links?: string[]; onClose: () => void }) {
  const editable = useStore(s => s.canEdit('team'))
  const { addPerson, updatePerson } = useStore()
  const [name, setName] = useState(person?.name ?? '')
  const [email, setEmail] = useState(person?.email ?? '')
  const [phone, setPhone] = useState(person?.phone ?? '')
  const [org, setOrg] = useState(person?.org ?? '')
  const [notes, setNotes] = useState(person?.notes ?? '')
  const [newLog, setNewLog] = useState('')

  function handleSave() {
    if (!name.trim()) return
    const patch = {
      name: name.trim(),
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      org: org.trim() || undefined,
      notes: notes.trim() || undefined,
    }
    if (person) updatePerson(person.id, patch)
    else addPerson(patch)
    onClose()
  }

  function handleLogEntry() {
    if (!person || !newLog.trim()) return
    const entry = { id: 'act-' + uid(), date: new Date().toISOString().slice(0, 10), text: newLog.trim() }
    updatePerson(person.id, { activity: [entry, ...(person.activity ?? [])] })
    setNewLog('')
  }

  return (
    <Modal title={person ? person.name : 'Add a team member'} onClose={onClose} footer={
      editable ? (
        <>
          <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} className="px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600">Save</button>
        </>
      ) : (
        <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Close</button>
      )
    }>
      <FormField label="Name">
        <input className={inputClass} placeholder="Full name" value={name} onChange={e => setName(e.target.value)} autoFocus disabled={!editable} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Email">
          <input className={inputClass} type="email" value={email} onChange={e => setEmail(e.target.value)} disabled={!editable} />
        </FormField>
        <FormField label="Phone">
          <input className={inputClass} value={phone} onChange={e => setPhone(e.target.value)} disabled={!editable} />
        </FormField>
      </div>
      <FormField label="Org / company">
        <input className={inputClass} value={org} onChange={e => setOrg(e.target.value)} disabled={!editable} />
      </FormField>
      <FormField label="Notes">
        <input className={inputClass} value={notes} onChange={e => setNotes(e.target.value)} disabled={!editable} />
      </FormField>

      {person && (
        <>
          {links && links.length > 0 && (
            <div className="pt-1 border-t border-gray-100 mt-1">
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5 mt-3">Linked everywhere</div>
              <div className="flex flex-wrap gap-1">
                {links.map((l, i) => <span key={i} className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700">{l}</span>)}
              </div>
            </div>
          )}

          <div className="pt-1 border-t border-gray-100 mt-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5 mt-3">Comms log</div>
            {editable && (
              <div className="flex gap-2 mb-2">
                <input
                  className={inputClass}
                  placeholder="e.g. Reminded her to confirm the flight"
                  value={newLog}
                  onChange={e => setNewLog(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleLogEntry() } }}
                />
                <button type="button" onClick={handleLogEntry} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 flex-shrink-0">Log</button>
              </div>
            )}
            <div className="flex flex-col gap-1.5 max-h-32 overflow-auto">
              {(person.activity ?? []).length === 0 && (
                <div className="text-xs text-gray-300">Nothing logged yet</div>
              )}
              {(person.activity ?? []).map(a => (
                <div key={a.id} className="text-xs text-gray-500">
                  <span className="text-gray-300">{a.date}</span> — {a.text}
                </div>
              ))}
            </div>
          </div>

          <AccessPanel person={person} />
        </>
      )}
    </Modal>
  )
}
