'use client'
// ──────────────────────────────────────────────────────────
//  Team: ONE list of the people around an artist. Each card is a person's contact details, with what they can open for
//  this artist underneath (role, pages, invite, resend), so adding someone and sharing with them are the same thing.
//  Contact details are for everyone who can open the page; the access half is for managers and this artist's Point People.
// ──────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { uid, today as localToday } from '@/lib/utils'
import { Modal, FormField, inputClass } from '@/components/ui/Modal'
import { CREW_ROLE_LABEL } from '@/components/tour/CrewView'
import { ROLE_LABEL as STAKEHOLDER_ROLE_LABEL } from '@/components/songs/StatusView'
import { AccessLine } from '@/components/team/AccessLine'
import { AddPersonModal } from '@/components/team/AddPersonModal'
import { useArtistSharing } from '@/components/team/useArtistSharing'
import { InviteStepModal } from '@/components/team/InviteStepModal'
import { Badge } from '@/components/ui/Badge'
import { STATUS_LABEL, buildTeamList, pointPeopleCount, unsharedRow, type PersonStatus, type TeamCard } from '@/lib/sharing'
import { KEY_ROLES, MAX_TITLE_CHARS, TITLE_SUGGESTIONS, cleanTitle, holdersOf } from '@/lib/team-roles'
import type { Person, TravelItem } from '@/types'

const STATUS_VARIANT: Record<PersonStatus, 'gray' | 'amber' | 'green' | 'blue'> = { 'no-login': 'gray', waiting: 'amber', 'has-access': 'green', 'not-shared': 'blue' }

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
  // The access half is for managers and for this artist's Point People (the database enforces it; this just hides it from everyone else).
  const canShare = useStore(s => s.myMemberId !== null && s.previewMemberId === null && (s.role === 'manager' || s.grants.some(g => g.section === 'admin' && g.clientId === s.clientId)))
  const [addOpen, setAddOpen] = useState(false)
  const [addTitle, setAddTitle] = useState<string | undefined>(undefined)   // a key role clicked on the strip pre-fills the new person's title
  const isManager = useStore(s => s.role === 'manager')
  const logins = useStore(s => s.workspacePeople)
  const showStatus = useStore(s => s.role !== 'artist' && s.workspacePeople.length > 0)
  const [inviteFor, setInviteFor] = useState<string | null>(null)   // the person just added (or picked) who is being sent an invite
  const [openPersonId, setOpenPersonId] = useState<string | null>(null)

  const showSharing = !!client && canShare && !client.isDemo
  const sharing = useArtistSharing(client?.id ?? '', client?.name ?? '', showSharing)
  const contacts = client?.people
  const list = useMemo(() => client ? buildTeamList(contacts ?? [], logins, sharing.rows, client.id) : null, [client, contacts, logins, sharing.rows])

  if (!client || !list) return null
  const people = contacts ?? []
  // a crew role counts as a title for the key-roles strip, so nothing has to be typed twice
  const crewRolesOf = (p: Person) => (client.tour.crew ?? []).filter(cm => cm.personId === p.id).map(cm => CREW_ROLE_LABEL[cm.role])
  const openPerson = openPersonId ? people.find(p => p.id === openPersonId) ?? null : null
  // Until the access rows have loaded every login would look "not shared", so the cards stay in the order they were added.
  const ready = showSharing && sharing.grants !== null
  const cards = ready ? list.cards : people.map(p => list.cards.find(c => c.contact.id === p.id)!)

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

  const openAdd = () => { setAddTitle(undefined); setAddOpen(true) }

  /** The bottom half of a card: what this person can open for this artist. */
  function access(card: TeamCard) {
    if (!ready) return <div className="text-xs text-gray-300">{sharing.loadError ? 'Access could not be loaded.' : 'Loading access…'}</div>
    if (card.row) return <AccessLine row={card.row} client={client!} sharing={sharing} />
    if (card.login) return <Badge variant={STATUS_VARIANT[card.status]}>{STATUS_LABEL[card.status]}</Badge>
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="gray">{STATUS_LABEL['no-login']}</Badge>
        {isManager
          ? <button onClick={() => setInviteFor(card.contact.id)} className="rounded-lg border border-accent/40 bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent hover:bg-accent-soft/70">Invite →</button>
          : <span className="text-xs text-gray-400">Only a manager can send an invite.</span>}
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto p-6 max-w-2xl mx-auto w-full">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="min-w-0 flex-1 basis-60">
          <div className="font-serif text-2xl font-medium">Team</div>
          <div className="text-sm text-gray-400 mt-1">
            {showSharing
              ? `Everyone around ${client.name}, and what each person can open.`
              : 'One record per person, shared across the whole app — crew, stakeholders, travel, and more all point back here'}
          </div>
        </div>
        {editable && (
          <button
            onClick={openAdd}
            className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors flex-shrink-0"
          >
            + Add team member
          </button>
        )}
      </div>

      {showSharing && sharing.loadError && (
        <p role="alert" className="mb-3 text-xs text-red-600">The access list could not be loaded. <button onClick={() => void sharing.reload()} className="font-medium underline">Try again</button></p>
      )}
      {ready && isManager && pointPeopleCount(sharing.rows) === 0 && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          No Point Person yet. Choose &ldquo;Point Person&rdquo; in someone&apos;s role menu, so this artist has an admin besides you.
        </p>
      )}

      <section aria-label="Key roles" className="mb-4 rounded-xl border border-gray-100 p-3">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">Key roles</div>
        <div className="flex flex-wrap gap-1.5">
          {KEY_ROLES.map(role => {
            const holders = holdersOf(people, role, crewRolesOf)
            if (holders.length > 0) {
              return (
                <button key={role} onClick={() => setOpenPersonId(holders[0].id)} className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100">
                  {role} · {holders.map(h => h.name).join(', ')}
                </button>
              )
            }
            return editable ? (
              <button key={role} onClick={() => { setAddTitle(role); setAddOpen(true) }} className="rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-50">
                + {role}
              </button>
            ) : (
              <span key={role} className="rounded-full border border-gray-100 px-2.5 py-1 text-xs text-gray-400">{role} · nobody yet</span>
            )
          })}
        </div>
      </section>

      {people.length === 0 && (
        <div className="text-sm text-gray-300 text-center py-12">No team members added yet</div>
      )}

      <div className="flex flex-col gap-2">
        {cards.map(card => {
          const p = card.contact
          const links = linksFor(p.id)
          return (
            <div key={p.id} className="group border border-gray-100 rounded-xl overflow-hidden">
              <div
                onClick={() => setOpenPersonId(p.id)}
                className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{p.name}{p.org && <span className="text-gray-400 font-normal"> · {p.org}</span>}</div>
                  {p.title && <div className="text-xs text-gray-600 mt-0.5">{p.title}</div>}
                  <div className="text-xs text-gray-400 mt-0.5">
                    {[p.email, p.phone].filter(Boolean).join(' · ') || '—'}
                  </div>
                  {!showSharing && showStatus && !client.isDemo && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <Badge variant={STATUS_VARIANT[card.status]}>{STATUS_LABEL[card.status]}</Badge>
                      {card.status === 'no-login' && isManager && (
                        <button
                          onClick={e => { e.stopPropagation(); setInviteFor(p.id) }}
                          className="rounded-lg border border-accent/40 bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent hover:bg-accent-soft/70"
                        >
                          Invite →
                        </button>
                      )}
                    </div>
                  )}
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
                    onClick={(e) => { e.stopPropagation(); if (confirm(card.login
                      ? `Delete ${p.name}'s card? This removes them from anywhere they're linked (crew, stakeholders). Their login stays, and so does what they can open: use their role menu first if you want them off ${client.name}.`
                      : `Delete ${p.name}? This also removes them from anywhere they're linked (crew, stakeholders).`)) deletePerson(p.id) }}
                    className="md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 focus-visible:opacity-100 transition-opacity text-gray-300 hover:text-red-400 text-xs flex-shrink-0"
                  >
                    ✕
                  </button>
                )}
              </div>
              {showSharing && <div className="border-t border-gray-100 bg-gray-50/40 px-4 py-3">{access(card)}</div>}
            </div>
          )
        })}
      </div>

      {ready && list.logins.length > 0 && (
        <section aria-label="Logins without a team card" className="mt-6">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">Also can open {client.name}</div>
          <p className="mb-2 text-xs text-gray-400">These logins are not on the team list above.</p>
          <div className="flex flex-col gap-2">
            {list.logins.map(row => (
              <div key={row.person.memberId} className="rounded-xl border border-gray-100 px-4 py-3">
                <AccessLine row={row} client={client} sharing={sharing} showName />
              </div>
            ))}
          </div>
        </section>
      )}

      {ready && list.others.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-medium text-gray-500 hover:text-gray-900">
            {list.others.length} {list.others.length === 1 ? 'person' : 'people'} in your company can&apos;t open {client.name} yet — share it with them
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            {list.others.map(person => (
              <div key={person.memberId} className="rounded-xl border border-gray-100 px-4 py-3">
                <AccessLine row={unsharedRow(person)} client={client} sharing={sharing} showName />
              </div>
            ))}
          </div>
        </details>
      )}

      {addOpen && <AddPersonModal initialTitle={addTitle} sharing={sharing} canInvite={isManager && !client.isDemo} onInvite={id => setInviteFor(id)} onOpenCard={id => setOpenPersonId(id)} onClose={() => setAddOpen(false)} />}
      {inviteFor && <InviteStepModal personId={inviteFor} onClose={() => setInviteFor(null)} />}
      {openPerson && <PersonModal person={openPerson} links={linksFor(openPerson.id)} onClose={() => setOpenPersonId(null)} />}
    </div>
  )
}

/** A team card, opened to read or change. (Adding someone new has its own screen: AddPersonModal.) */
function PersonModal({ person, links, onClose }: { person: Person; links?: string[]; onClose: () => void }) {
  const editable = useStore(s => s.canEdit('team'))
  const isManager = useStore(s => s.role === 'manager')
  const goToCompany = useStore(s => s.goToCompany)
  const { updatePerson } = useStore()
  const [name, setName] = useState(person.name)
  const [email, setEmail] = useState(person.email ?? '')
  const [phone, setPhone] = useState(person.phone ?? '')
  const [org, setOrg] = useState(person.org ?? '')
  const [title, setTitle] = useState(person.title ?? '')
  const [notes, setNotes] = useState(person.notes ?? '')
  const [newLog, setNewLog] = useState('')

  function handleSave() {
    if (!name.trim()) return
    const patch = {
      name: name.trim(),
      title: cleanTitle(title),
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      org: org.trim() || undefined,
      notes: notes.trim() || undefined,
    }
    updatePerson(person.id, patch)
    onClose()
  }

  function handleLogEntry() {
    if (!newLog.trim()) return
    const entry = { id: 'act-' + uid(), date: localToday(), text: newLog.trim() }
    updatePerson(person.id, { activity: [entry, ...(person.activity ?? [])] })
    setNewLog('')
  }

  return (
    <Modal title={person.name} onClose={onClose} footer={
      editable ? (
        <>
          <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} className="px-3 py-1.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover">Save</button>
        </>
      ) : (
        <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Close</button>
      )
    }>
      <FormField label="Name">
        <input className={inputClass} placeholder="Full name" value={name} onChange={e => setName(e.target.value)} autoFocus disabled={!editable} />
      </FormField>
      <FormField label="Title / role">
        <input
          className={inputClass} list="team-title-suggestions" placeholder="e.g. Tour Manager, Stylist, Business manager"
          maxLength={MAX_TITLE_CHARS} value={title} onChange={e => setTitle(e.target.value)} disabled={!editable}
        />
        <datalist id="team-title-suggestions">{TITLE_SUGGESTIONS.map(t => <option key={t} value={t} />)}</datalist>
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

      {isManager && (
        <div className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-500">
          What they can open is set on their card on the Team page (this artist) or on the{' '}
          <button type="button" onClick={() => { onClose(); goToCompany() }} className="font-medium text-accent hover:underline">Company page</button> (every artist at once).
        </div>
      )}
    </Modal>
  )
}
