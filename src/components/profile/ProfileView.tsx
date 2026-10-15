'use client'
// ──────────────────────────────────────────────────────────
//  Artist profile — the information pool the team looks things up in.
//  Open details are ordinary data. Private details (birth date, home address, travel IDs, health, tax ID)
//  are fetched from the server only when someone clicks Reveal, and every reveal is recorded.
// ──────────────────────────────────────────────────────────
import { useState } from 'react'
import { useStore } from '@/lib/store'
import { PersonPicker } from '@/components/people/PersonPicker'
import { inputClass, selectClass } from '@/components/ui/Modal'
import { uid } from '@/lib/utils'
import { SEAT_OPTIONS, SIZE_FIELDS, SOCIAL_FIELDS } from '@/lib/profile-fields'
import type { ArtistProfile, Client, ProfileContact, TravelPrefs } from '@/types'
import { AccessLog } from './AccessLog'
import { AccountsTab } from './AccountsTab'
import { Card, FieldsCard, type FieldDef } from './FieldsCard'
import { PrivateBlock } from './PrivateBlock'
import { useProfileSecure } from './useProfileSecure'

const TABS = [['overview', 'Overview'], ['travel', 'Travel'], ['team', 'Team'], ['accounts', 'Accounts'], ['log', 'Who looked']] as const
type Tab = (typeof TABS)[number][0]

const CONTACT_ROLES = ['Agent', 'Business manager', 'Lawyer', 'Label', 'Publisher', 'Publicist', 'Tour manager', 'Artwork / design', 'Website developer', 'Booking assistant', 'Other']
const CORE_ROLES = ['Agent', 'Business manager', 'Lawyer', 'Label', 'Publicist', 'Tour manager']

const CONTACT_FIELDS: FieldDef[] = [
  { key: 'legalName', label: 'Legal name' }, { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' }, { key: 'altEmail', label: 'Other email' }, { key: 'website', label: 'Website', placeholder: 'https://' },
]
const BUSINESS_FIELDS: FieldDef[] = [
  { key: 'businessName', label: 'Business or company name' }, { key: 'businessAddress', label: 'Business address', multiline: true },
]
const BIO_FIELDS: FieldDef[] = [
  { key: 'bioShort', label: 'Short bio', multiline: true, placeholder: 'One or two sentences, for line-ups and listings' },
  { key: 'bioLong', label: 'Long bio', multiline: true },
]
const NOTE_FIELDS: FieldDef[] = [{ key: 'notes', label: 'Notes for the team', multiline: true, placeholder: 'Anything someone new on the team should know' }]
const TRAVEL_FIELDS: FieldDef[] = [
  { key: 'legalName', label: 'Name exactly as on their ID' }, { key: 'homeAirport', label: 'Home airport', placeholder: 'Los Angeles (LAX)' },
  { key: 'seat', label: 'Seat', options: SEAT_OPTIONS }, { key: 'roomType', label: 'Room type', placeholder: 'King bed' },
  { key: 'hotelPrefs', label: 'Hotel preferences', multiline: true }, { key: 'dietary', label: 'Food and diet', multiline: true },
  { key: 'requests', label: 'Anything else to ask for', multiline: true },
]

/** Empty text becomes "not set", so clearing a field really clears it. */
const clean = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== ''))
const unset = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === '' ? undefined : v]))

export function ProfileView() {
  const client = useStore(s => s.getClient())
  const canEdit = useStore(s => s.canEdit('profile'))
  const saveProfile = useStore(s => s.saveProfile)
  const [tab, setTab] = useState<Tab>('overview')
  const secure = useProfileSecure(client?.id ?? '')
  if (!client) return null

  const p: ArtistProfile = client.profile ?? {}
  const flat = Object.fromEntries(Object.entries(p).filter(([, v]) => typeof v === 'string')) as Record<string, string>   // just the plain-text details
  const save = async (patch: Partial<ArtistProfile>) => {
    const r = await saveProfile(patch)
    return r.ok ? { ok: true } : { ok: false, error: r.error }
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 md:py-8">
        <div className="mb-5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Profile</div>
          <h1 className="mt-1 font-serif text-[28px] font-medium leading-tight">{client.name}</h1>
          <p className="mt-1 text-sm text-gray-500">Everything the team needs to look up in one place. Private details stay hidden until revealed.</p>
        </div>

        <div role="tablist" className="mb-6 flex gap-1 border-b border-gray-100">
          {TABS.map(([key, label]) => (
            <button
              key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
              className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${tab === key ? 'border-accent text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-900'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {tab === 'overview' && (
            <>
              <FieldsCard title="Contact" fields={CONTACT_FIELDS} values={flat} canEdit={canEdit} onSave={next => save(unset(next))} />
              <FieldsCard title="Business" hint="The company the artist contracts through. The tax ID is under Private details." fields={BUSINESS_FIELDS} values={flat} canEdit={canEdit} onSave={next => save(unset(next))} />
              <FieldsCard
                title="Social and streaming" fields={SOCIAL_FIELDS.map(([key, label]) => ({ key, label, placeholder: 'Handle or link' }))}
                values={{ ...p.social }} canEdit={canEdit} onSave={next => save({ social: clean(next) })}
              />
              <FieldsCard
                title="Sizes" hint="For wardrobe, merch, and hospitality requests." fields={SIZE_FIELDS.map(([key, label]) => ({ key, label }))}
                values={{ ...p.sizes }} canEdit={canEdit} onSave={next => save({ sizes: clean(next) })}
              />
              <FieldsCard title="Bio" fields={BIO_FIELDS} values={flat} canEdit={canEdit} onSave={next => save(unset(next))} />
              <FieldsCard title="Notes" fields={NOTE_FIELDS} values={flat} canEdit={canEdit} onSave={next => save(unset(next))} />
              <PrivateBlock clientId={client.id} subject="artist" title="Private details" canEdit={canEdit} secure={secure} />
            </>
          )}

          {tab === 'travel' && <TravelTab client={client} p={p} canEdit={canEdit} save={save} secure={secure} />}
          {tab === 'team' && <TeamTab client={client} p={p} canEdit={canEdit} save={save} />}
          {tab === 'accounts' && <AccountsTab client={client} canEdit={canEdit} />}
          {tab === 'log' && <AccessLog client={client} />}
        </div>
      </div>
    </div>
  )
}

// ── Travel ───────────────────────────────────────────────────
type Save = (patch: Partial<ArtistProfile>) => Promise<{ ok: boolean; error?: string }>

function TravelTab({ client, p, canEdit, save, secure }: { client: Client; p: ArtistProfile; canEdit: boolean; save: Save; secure: ReturnType<typeof useProfileSecure> }) {
  const party = p.party ?? []
  const [adding, setAdding] = useState(false)

  const savePrefs = (id: string, next: Record<string, string>) =>
    id === 'artist' ? save({ travel: clean(next) as TravelPrefs }) : save({ partyTravel: { ...p.partyTravel, [id]: clean(next) as TravelPrefs } })

  return (
    <>
      <FieldsCard
        title={`${client.name}`} hint="Their own travel preferences. Travel IDs, health, and emergency contact are under Private details on Overview."
        fields={TRAVEL_FIELDS} values={{ ...p.travel }} canEdit={canEdit} onSave={next => savePrefs('artist', next)}
      />

      {party.map(id => {
        const person = client.people.find(x => x.id === id)
        const name = person?.name ?? 'Removed person'
        return (
          <div key={id} className="space-y-4">
            <FieldsCard
              title={name} hint={person?.org ? `Travels with ${client.name} · ${person.org}` : `Travels with ${client.name}`}
              fields={TRAVEL_FIELDS} values={{ ...p.partyTravel?.[id] }} canEdit={canEdit} onSave={next => savePrefs(id, next)}
            />
            <PrivateBlock clientId={client.id} subject={id} title={`${name} · private details`} canEdit={canEdit} secure={secure} />
            {canEdit && (
              <div className="-mt-2 text-right">
                <button
                  onClick={() => { if (confirm(`Take ${name} off the travel party? Their saved details are kept.`)) save({ party: party.filter(x => x !== id) }) }}
                  className="text-xs text-gray-400 hover:text-red-500"
                >
                  Take off the travel party
                </button>
              </div>
            )}
          </div>
        )
      })}

      {canEdit && (
        <Card title="Add someone to the travel party" hint="Anyone who regularly travels with the artist. Pick them from the team list, or add them.">
          {adding ? (
            <PersonPicker value="" onChange={id => { if (!party.includes(id)) save({ party: [...party, id] }); setAdding(false) }} />
          ) : (
            <button onClick={() => setAdding(true)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium hover:bg-gray-50">+ Add a person</button>
          )}
        </Card>
      )}
    </>
  )
}

// ── Team contacts ────────────────────────────────────────────
function TeamTab({ client, p, canEdit, save }: { client: Client; p: ArtistProfile; canEdit: boolean; save: Save }) {
  const contacts = p.contacts ?? []
  const [form, setForm] = useState<ProfileContact | null>(null)
  const [error, setError] = useState('')
  const missing = CORE_ROLES.filter(r => !contacts.some(c => c.role === r))

  async function commit(next: ProfileContact[]) {
    setError('')
    const r = await save({ contacts: next })
    if (r.ok) setForm(null); else setError(r.error ?? "Couldn't save. Please try again.")
  }

  return (
    <>
      <Card title="Key contacts" hint="The people around the artist. Their email and phone come from the team list, so they are only kept in one place.">
        {contacts.length === 0 && !form && <p className="text-sm text-gray-500">No contacts yet.</p>}
        <ul className="divide-y divide-gray-100">
          {contacts.map(c => {
            const person = client.people.find(x => x.id === c.personId)
            return (
              <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{c.role}</div>
                  <div className="text-sm font-medium">{person?.name ?? <span className="text-gray-400">No one chosen</span>}{(c.firm || person?.org) && <span className="font-normal text-gray-500"> · {c.firm || person?.org}</span>}</div>
                  <div className="text-xs text-gray-500">{[person?.email, person?.phone].filter(Boolean).join(' · ')}</div>
                  {c.notes && <div className="mt-1 text-xs text-gray-600">{c.notes}</div>}
                </div>
                {canEdit && (
                  <div className="flex gap-3 text-xs">
                    <button onClick={() => { setError(''); setForm(c) }} className="text-gray-500 hover:text-gray-900">Edit</button>
                    <button onClick={() => commit(contacts.filter(x => x.id !== c.id))} className="text-gray-400 hover:text-red-500">Remove</button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        {canEdit && !form && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button onClick={() => { setError(''); setForm({ id: 'contact-' + uid(), role: 'Agent' }) }} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium hover:bg-gray-50">+ Add a contact</button>
            {missing.length > 0 && <span className="text-xs text-gray-400">Missing:</span>}
            {missing.map(r => (
              <button key={r} onClick={() => { setError(''); setForm({ id: 'contact-' + uid(), role: r }) }} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200">{r}</button>
            ))}
          </div>
        )}
      </Card>

      {form && (
        <Card title={contacts.some(c => c.id === form.id) ? 'Edit contact' : 'Add a contact'}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-500">Role</span>
              <select className={selectClass} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                {CONTACT_ROLES.map(r => <option key={r}>{r}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-500">Firm (if different from their company)</span>
              <input className={inputClass} value={form.firm ?? ''} onChange={e => setForm({ ...form, firm: e.target.value })} />
            </label>
            <div className="sm:col-span-2"><PersonPicker value={form.personId ?? ''} onChange={id => setForm({ ...form, personId: id })} /></div>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold text-gray-500">Notes</span>
              <textarea className={`${inputClass} min-h-[64px]`} value={form.notes ?? ''} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </label>
          </div>
          {error && <p role="alert" className="mt-3 text-xs text-red-600">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setForm(null)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium hover:bg-gray-50">Cancel</button>
            <button
              disabled={!form.personId}
              onClick={() => commit(contacts.some(c => c.id === form.id)
                ? contacts.map(c => c.id === form.id ? { ...form, firm: form.firm?.trim() || undefined, notes: form.notes?.trim() || undefined } : c)
                : [...contacts, { ...form, firm: form.firm?.trim() || undefined, notes: form.notes?.trim() || undefined }])}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </Card>
      )}
    </>
  )
}
