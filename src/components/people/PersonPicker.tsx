'use client'
import { useState } from 'react'
import { useStore } from '@/lib/store'
import { FormField, inputClass, selectClass } from '@/components/ui/Modal'

/**
 * Pick an existing person from the client's shared directory, or create a
 * new one inline without leaving the form. Used anywhere a real human gets
 * linked (crew, stakeholders, track credits) so nobody re-types a name that
 * already exists elsewhere.
 */
export function PersonPicker({ value, onChange }: { value: string; onChange: (personId: string) => void }) {
  const client = useStore(s => s.getClient())
  const { addPerson } = useStore()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newOrg, setNewOrg] = useState('')

  const people = client?.people ?? []

  if (creating) {
    return (
      <div className="border border-gray-200 rounded-lg p-3 flex flex-col gap-2">
        <input className={inputClass} placeholder="Full name" value={newName} onChange={e => setNewName(e.target.value)} autoFocus />
        <div className="grid grid-cols-2 gap-2">
          <input className={inputClass} placeholder="Email" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
          <input className={inputClass} placeholder="Phone" value={newPhone} onChange={e => setNewPhone(e.target.value)} />
        </div>
        <input className={inputClass} placeholder="Org / company" value={newOrg} onChange={e => setNewOrg(e.target.value)} />
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={() => setCreating(false)} className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs hover:bg-gray-50">Cancel</button>
          <button
            type="button"
            onClick={() => {
              if (!newName.trim()) return
              const id = addPerson({
                name: newName.trim(),
                email: newEmail.trim() || undefined,
                phone: newPhone.trim() || undefined,
                org: newOrg.trim() || undefined,
              })
              onChange(id)
              setCreating(false)
              setNewName(''); setNewEmail(''); setNewPhone(''); setNewOrg('')
            }}
            className="px-2.5 py-1 bg-blue-500 text-white rounded-lg text-xs font-medium hover:bg-blue-600"
          >
            Add person
          </button>
        </div>
      </div>
    )
  }

  return (
    <FormField label="Person">
      <select
        className={selectClass}
        value={value}
        onChange={e => e.target.value === '__new__' ? setCreating(true) : onChange(e.target.value)}
      >
        <option value="" disabled>Select a person…</option>
        {people.map(p => <option key={p.id} value={p.id}>{p.name}{p.org ? ` — ${p.org}` : ''}</option>)}
        <option value="__new__">+ New person…</option>
      </select>
    </FormField>
  )
}
