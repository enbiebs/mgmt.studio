'use client'
import { useState } from 'react'
import { useStore } from '@/lib/store'
import { defaultChecklist, isStale, stageLabel, resolveActiveAlbum } from '@/lib/utils'
import { Modal, FormField, inputClass } from '@/components/ui/Modal'
import { PersonPicker } from '@/components/people/PersonPicker'
import { ReleasePicker } from './ReleasePicker'
import type { Album, Client, Person, StakeholderRole } from '@/types'

export const ROLE_ORDER: StakeholderRole[] = [
  'management', 'label-am', 'label-legal', 'label-marketing',
  'featured-artist-rep', 'featured-artist-label', 'publisher', 'video', 'distributor', 'other',
]
export const ROLE_LABEL: Record<StakeholderRole, string> = {
  management:             'Management',
  'label-am':              'Label — A&R / Product',
  'label-legal':           'Label — Legal / Business Affairs',
  'label-marketing':       'Label — Marketing / Digital',
  'featured-artist-rep':   "Featured Artist's Rep",
  'featured-artist-label': "Featured Artist's Label (Waiver)",
  publisher:               'Publisher / PRO',
  video:                   'Video / Treatment',
  distributor:             'Distributor',
  other:                   'Other',
}

function findPerson(client: Client, personId: string): Person | undefined {
  return (client.people ?? []).find(p => p.id === personId)
}

function buildSummary(client: Client, album: Album): string {
  const items = album.checklist && album.checklist.length ? album.checklist : defaultChecklist()
  const done = items.filter(i => i.done).length
  const stale = album.tracks.filter(t => isStale(t.stage, t.touched))
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const lc = album.labelCopy

  const lines: string[] = []
  lines.push(`${client.name} — ${album.title}`)
  lines.push(`Release status · ${dateStr}`)
  lines.push('')

  lines.push(`TRACKS — ${album.tracks.filter(t => t.stage === 'done').length}/${album.tracks.length} done`)
  album.tracks.forEach(t => {
    const bits = [stageLabel(t.stage)]
    if (t.priority === 'lead-single') bits.push('LEAD SINGLE')
    if (t.priority === 'single') bits.push('SINGLE')
    if (isStale(t.stage, t.touched)) bits.push(`⚠ no update in ${t.touched}`)
    if (t.owner) bits.push(`next: ${t.owner}`)
    lines.push(`  • ${t.title} — ${bits.join(' · ')}`)
  })
  lines.push('')

  lines.push(`RELEASE CHECKLIST — ${done}/${items.length} complete`)
  const openByPhase = new Map<string, string[]>()
  items.filter(i => !i.done).forEach(i => {
    const list = openByPhase.get(i.phase) ?? []
    list.push(i.label)
    openByPhase.set(i.phase, list)
  })
  if (openByPhase.size === 0) {
    lines.push('  All items complete.')
  } else {
    for (const [phase, labels] of openByPhase) {
      lines.push(`  ${phase}:`)
      labels.forEach(l => lines.push(`    ☐ ${l}`))
    }
  }
  lines.push('')

  lines.push('LABEL COPY')
  lines.push(`  UPC: ${lc?.upc || 'not assigned'} · Label: ${lc?.label || '—'} · ${lc?.copyrightP || 'no ℗ line yet'}`)
  const missingIsrc = album.tracks.filter(t => !t.labelCopy?.isrc).length
  lines.push(`  ISRC: ${album.tracks.length - missingIsrc}/${album.tracks.length} tracks assigned`)
  lines.push('')

  if (stale.length > 0) {
    lines.push(`⚠ ${stale.length} track${stale.length !== 1 ? 's' : ''} stalled 10d+ — needs attention`)
    lines.push('')
  }

  const stakeholders = album.stakeholders ?? []
  if (stakeholders.length > 0) {
    lines.push('STAKEHOLDERS')
    ROLE_ORDER.forEach(role => {
      stakeholders.filter(s => s.role === role).forEach(s => {
        const person = findPerson(client, s.personId)
        if (!person) return
        lines.push(`  ${ROLE_LABEL[role]}: ${person.name}${person.org ? ` (${person.org})` : ''}${person.email ? ` — ${person.email}` : ''}`)
      })
    })
  }

  return lines.join('\n')
}

export function StatusView() {
  const client = useStore(s => s.getClient())
  const editable = useStore(s => s.canEdit('songs'))
  const selectedAlbumId = useStore(s => s.selectedAlbumId)
  const { deleteStakeholder } = useStore()
  const [addOpen, setAddOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!client) return null
  const albums = client.songs.albums
  const album = resolveActiveAlbum(albums, selectedAlbumId)
  const stakeholders = album.stakeholders ?? []

  async function handleCopy() {
    if (!client) return
    const summary = buildSummary(client, album)
    await navigator.clipboard.writeText(summary)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex-1 overflow-auto p-6 max-w-2xl">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <div className="font-serif text-2xl font-medium">{album.title}</div>
          <ReleasePicker albums={albums} activeId={album.id} />
        </div>
        <div className="text-sm text-gray-400 mt-1">One consolidated view of the release — for sharing with everyone at once</div>
      </div>

      {/* Status summary */}
      <div className="bg-gray-50 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Status Update</div>
          <button
            onClick={handleCopy}
            className="px-2.5 py-1 bg-blue-500 text-white text-xs font-medium rounded-lg hover:bg-blue-600 transition-colors"
          >
            {copied ? 'Copied!' : 'Copy status update'}
          </button>
        </div>
        <pre className="text-xs text-gray-500 whitespace-pre-wrap font-sans leading-relaxed max-h-64 overflow-auto">
          {buildSummary(client, album)}
        </pre>
      </div>

      {/* Stakeholders */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Stakeholders</div>
        {editable && (
          <button
            onClick={() => setAddOpen(true)}
            className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
          >
            + Add stakeholder
          </button>
        )}
      </div>

      {stakeholders.length === 0 && (
        <div className="text-sm text-gray-300 text-center py-8">No stakeholders added yet</div>
      )}

      {ROLE_ORDER.map(role => {
        const roleStakeholders = stakeholders.filter(s => s.role === role)
        if (roleStakeholders.length === 0) return null
        return (
          <div key={role} className="mb-4">
            <div className="text-[11px] font-semibold text-gray-400 mb-1.5">{ROLE_LABEL[role]}</div>
            <div className="flex flex-col gap-1.5">
              {roleStakeholders.map(s => {
                const person = findPerson(client, s.personId)
                if (!person) return null
                return (
                  <div key={s.id} className="group border border-gray-100 rounded-xl px-3 py-2 flex items-center gap-3 hover:bg-gray-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{person.name}{person.org && <span className="text-gray-400 font-normal"> · {person.org}</span>}</div>
                      {(person.email || person.phone || s.notes) && (
                        <div className="text-xs text-gray-400 mt-0.5">
                          {[person.email, person.phone, s.notes].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>
                    {editable && (
                      <button
                        onClick={() => { if (confirm(`Remove ${person.name} as a stakeholder?`)) deleteStakeholder(s.id) }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-400 text-xs flex-shrink-0"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {addOpen && <AddStakeholderModal albumId={album.id} onClose={() => setAddOpen(false)} />}
    </div>
  )
}

function AddStakeholderModal({ albumId, onClose }: { albumId: string; onClose: () => void }) {
  const { addStakeholder } = useStore()
  const [personId, setPersonId] = useState('')
  const [role, setRole] = useState<StakeholderRole>('label-am')
  const [notes, setNotes] = useState('')

  function handleAdd() {
    if (!personId) return
    addStakeholder(albumId, { personId, role, notes: notes.trim() || undefined })
    onClose()
  }

  return (
    <Modal title="Add a stakeholder" onClose={onClose} footer={
      <>
        <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
        <button onClick={handleAdd} disabled={!personId} className="px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:opacity-40">Add</button>
      </>
    }>
      <PersonPicker value={personId} onChange={setPersonId} />
      <FormField label="Role on this release">
        <select className={inputClass} value={role} onChange={e => setRole(e.target.value as StakeholderRole)}>
          {ROLE_ORDER.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
      </FormField>
      <FormField label="Notes">
        <input className={inputClass} placeholder="e.g. handles label waiver / legal sign-off" value={notes} onChange={e => setNotes(e.target.value)} />
      </FormField>
    </Modal>
  )
}
