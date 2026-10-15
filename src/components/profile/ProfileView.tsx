'use client'
// ──────────────────────────────────────────────────────────
//  Artist profile — the information pool the team looks things up in.
//  Open details are ordinary data. Private details (birth date, home address, travel IDs, health, tax ID)
//  are fetched from the server only when someone clicks Reveal, and every reveal is recorded.
// ──────────────────────────────────────────────────────────
import { useState } from 'react'
import { useStore } from '@/lib/store'
import { PersonPicker } from '@/components/people/PersonPicker'
import { SEAT_OPTIONS, SIZE_FIELDS, SOCIAL_FIELDS } from '@/lib/profile-fields'
import type { ArtistProfile, Client, TravelPrefs } from '@/types'
import { AccessLog } from './AccessLog'
import { AccountsTab } from './AccountsTab'
import { BrandingCard } from './BrandingCard'
import { DriveLinksCard } from './DriveLinksCard'
import { Card, FieldsCard, type FieldDef } from './FieldsCard'
import { PrivateBlock } from './PrivateBlock'
import { useProfileSecure } from './useProfileSecure'

const TABS = [['overview', 'Overview'], ['travel', 'Travel'], ['accounts', 'Accounts'], ['log', 'Who looked']] as const
type Tab = (typeof TABS)[number][0]


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
              <BrandingCard client={client} canEdit={canEdit} />
              <DriveLinksCard client={client} canEdit={canEdit} />
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
