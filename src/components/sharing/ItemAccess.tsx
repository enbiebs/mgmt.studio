'use client'
// ──────────────────────────────────────────────────────────
//  "Who can see this" — the manager's per-item sharing control.
//  A switch per person showing whether they can see the item right now.
//  Flipping a switch away from what their normal access gives them records
//  an exception: off = hidden from them completely, on = shared with them
//  (view-only) even if they have no access to that area. Flipping it back to
//  match their normal access removes the exception. The database enforces it
//  (supabase/migrations/021_item_access.sql); this is just the control.
// ──────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { useStore } from '@/lib/store'
import { Modal } from '@/components/ui/Modal'
import {
  ARTIST_PORTAL_ITEM_TYPES, ITEM_SECTION, baselineSees, effectiveSees, findException,
  type ItemType, type Viewer,
} from '@/lib/item-access'
import type { PreviewMember } from '@/lib/db'
import type { MainSection } from '@/types'

const NOUN: Record<ItemType, string> = {
  show: 'show', album: 'release', post: 'post', project: 'project',
  invoice: 'invoice', contract: 'contract', expense: 'bill',
}
const AREA: Partial<Record<MainSection, string>> = {
  tour: 'Tour', songs: 'Music', content: 'Content', projects: 'Projects', finance: 'Finance', legal: 'Legal',
}
const ROLE_LABEL: Record<string, string> = { agent: 'Agent', lawyer: 'Lawyer', team: 'Team', artist: 'Artist' }

export function ItemAccessButton({ itemType, itemId }: { itemType: ItemType; itemId: string }) {
  const role = useStore(s => s.role)
  const clientId = useStore(s => s.clientId)
  const changed = useStore(s => s.itemAccess.filter(e => e.itemType === itemType && e.itemId === itemId).length)
  const [open, setOpen] = useState(false)

  // Only a real manager sets this (a previewed identity has a different role).
  if (role !== 'manager' || !clientId) return null

  return (
    <>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setOpen(true) }}
        title={`Choose who can see this ${NOUN[itemType]}`}
        className={`px-2.5 py-1 border rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
          changed > 0 ? 'border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
        }`}
      >
        {changed > 0 ? `Who can see this · ${changed} changed` : 'Who can see this'}
      </button>
      {open && <ItemAccessModal itemType={itemType} itemId={itemId} clientId={clientId} onClose={() => setOpen(false)} />}
    </>
  )
}

function memberName(m: PreviewMember) {
  return m.role === 'artist' ? `${m.clientName ?? 'Artist'} (artist)` : (m.personName ?? ROLE_LABEL[m.role] ?? m.role)
}

function ItemAccessModal({ itemType, itemId, clientId, onClose }: { itemType: ItemType; itemId: string; clientId: string; onClose: () => void }) {
  const previewMembers = useStore(s => s.previewMembers)
  const memberGrants = useStore(s => s.memberGrants)
  const itemAccess = useStore(s => s.itemAccess)
  const loadMemberGrants = useStore(s => s.loadMemberGrants)
  const setItemEffect = useStore(s => s.setItemEffect)

  useEffect(() => { loadMemberGrants().catch(console.error) }, [loadMemberGrants])

  // Team logins can be given anything; this client's artist login only the
  // kinds of items its simplified portal can show.
  const members = previewMembers.filter(m =>
    m.role === 'artist'
      ? m.clientId === clientId && ARTIST_PORTAL_ITEM_TYPES.includes(itemType)
      : m.clientId === null
  )
  const area = AREA[ITEM_SECTION[itemType]] ?? 'this area'
  const artistNotListed = !ARTIST_PORTAL_ITEM_TYPES.includes(itemType)
    && previewMembers.some(m => m.role === 'artist' && m.clientId === clientId)

  return (
    <Modal title={`Who can see this ${NOUN[itemType]}`} onClose={onClose} footer={
      <button onClick={onClose} className="px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600">Done</button>
    }>
      <p className="text-xs text-gray-500">
        Managers always see everything. Switch someone off and it disappears for them completely.
        Switch someone on who has no {area} access and they can view just this one {NOUN[itemType]} (view only).
      </p>

      {members.length === 0 && (
        <div className="text-sm text-gray-400 py-4 text-center">
          No team members have a login yet. Invite people from the Team tab, then you can choose what each of them sees.
        </div>
      )}
      {artistNotListed && (
        <div className="text-xs text-gray-400">
          The artist&apos;s portal doesn&apos;t show {NOUN[itemType]}s, so the artist isn&apos;t listed here.
        </div>
      )}

      <div className="divide-y divide-gray-100">
        {members.map(m => {
          const grants = m.role === 'artist' ? [] : memberGrants[m.id]
          if (!grants) {
            return <div key={m.id} className="py-3 text-sm text-gray-400">{memberName(m)} — loading…</div>
          }
          const viewer: Viewer = { memberId: m.id, role: m.role, clientId: m.clientId, grants }
          const normally = baselineSees(viewer, itemType, clientId)
          const exception = findException(itemAccess, m.id, itemType, itemId)
          const on = effectiveSees(viewer, itemType, itemId, clientId, itemAccess)
          const note = exception
            ? (exception.effect === 'hide' ? 'Hidden from them' : 'Shared with them (view only)')
            : normally ? 'Can see it through their normal access' : `No ${area} access, so they can't see it`

          return (
            <div key={m.id} className="flex items-center gap-3 py-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{memberName(m)}</div>
                <div className="text-xs text-gray-400">
                  {m.role !== 'artist' && <span className="mr-1.5 uppercase tracking-wide text-[10px] font-bold">{ROLE_LABEL[m.role] ?? m.role}</span>}
                  {note}
                </div>
              </div>
              <button
                type="button" role="switch" aria-checked={on}
                aria-label={`${on ? 'Hide from' : 'Show to'} ${memberName(m)}`}
                onClick={() => {
                  const wantOn = !on
                  setItemEffect(clientId, itemType, itemId, m.id, wantOn === normally ? null : wantOn ? 'share' : 'hide')
                }}
                className={`relative w-10 h-6 rounded-full flex-shrink-0 transition-colors ${on ? 'bg-green-500' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
              </button>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
