'use client'
// ──────────────────────────────────────────────────────────
//  Who is handling an offer or a show: a picker (a teammate, or nobody), a small chip for cards and lists, and the
//  "Just mine" switch. The rules live in lib/item-owner.ts. None of this shows for the artist's own login, or when
//  there are no teammates to choose from (the practice mode with no sign-in).
// ──────────────────────────────────────────────────────────

import { useStore } from '@/lib/store'
import { useMe } from '@/lib/useToday'
import { ownerChoices, ownerName, ownerWords, resolveOwner, showNeedsOwner } from '@/lib/item-owner'
import { today } from '@/lib/utils'
import type { Show } from '@/types'
import { FormField, selectClass } from '@/components/ui/Modal'

/** The teammates and who "me" is, or null when owners are not shown here at all. */
function useOwnerPeople() {
  const role = useStore(s => s.role)
  const people = useStore(s => s.workspacePeople)
  const me = useMe()
  return role === 'artist' || people.length === 0 ? null : { people, me }
}

/** The owner's name as it reads in a sentence ("You", "Jen"), or null when nobody (valid) owns it. */
export function useOwnerLabel(ownerId: string | undefined, clientId: string): string | null {
  const ctx = useOwnerPeople()
  if (!ctx) return null
  const o = resolveOwner(ownerId, ctx.people, clientId)
  return o.state === 'set' ? ownerWords(o.person, ctx.me) : null
}

/** The value to start a form with: the owner's login, or '' when nobody (a former owner who lost access counts as nobody). */
export function useStartingOwner(ownerId: string | undefined, clientId: string): string {
  const ctx = useOwnerPeople()
  if (!ctx) return ownerId ?? ''
  const o = resolveOwner(ownerId, ctx.people, clientId)
  return o.state === 'set' ? o.person.userId : ''
}

/** The picker. `value` is a login id or '' for nobody. */
export function OwnerSelect({ clientId, value, onChange, disabled, label = 'Owner' }: {
  clientId: string
  value: string
  onChange: (ownerId: string) => void
  disabled?: boolean
  label?: string
}) {
  const ctx = useOwnerPeople()
  if (!ctx) return null
  const choices = ownerChoices(ctx.people, clientId, ctx.me)
  const known = value === '' || choices.some(p => p.userId === value)
  return (
    <select
      aria-label={label} className={selectClass} disabled={disabled}
      value={known ? value : ''} onChange={e => onChange(e.target.value)}
    >
      <option value="">Nobody yet</option>
      {choices.map(p => <option key={p.userId} value={p.userId}>{p.userId === ctx.me ? `${ownerName(p)} (you)` : ownerName(p)}</option>)}
    </select>
  )
}

/**
 * A small chip for a card or list: who owns it, or (for something still live) that it needs an owner.
 * `live` says whether this is worth asking for an owner: a settled offer or a past show is not.
 */
export function OwnerChip({ clientId, ownerId, live }: { clientId: string; ownerId: string | undefined; live: boolean }) {
  const ctx = useOwnerPeople()
  if (!ctx) return null
  const o = resolveOwner(ownerId, ctx.people, clientId)
  if (o.state === 'set') {
    const mine = o.person.userId === ctx.me
    return (
      <span title="Who is handling this" className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${mine ? 'bg-accent-soft text-accent' : 'bg-gray-100 text-gray-600'}`}>
        Owner: {ownerWords(o.person, ctx.me)}
      </span>
    )
  }
  if (!live) return null
  return (
    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold border border-dashed border-gray-300 text-gray-400">
      {o.state === 'lost' ? 'Needs a new owner' : 'Needs an owner'}
    </span>
  )
}

/** The "Just mine" switch above a list. */
export function JustMineToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  const ctx = useOwnerPeople()
  if (!ctx) return null
  return (
    <button
      type="button" aria-pressed={on} onClick={() => onChange(!on)}
      className={`px-2.5 py-1 rounded-lg border text-xs font-medium whitespace-nowrap transition-colors ${on ? 'border-accent/40 bg-accent-soft text-accent' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
    >
      Just mine
    </button>
  )
}

/** Why an owner could not be picked, when there is a reason worth saying: the earlier owner can no longer open the artist. */
export function LostOwnerNote({ clientId, ownerId }: { clientId: string; ownerId: string | undefined }) {
  const ctx = useOwnerPeople()
  if (!ctx || !ownerId) return null
  return resolveOwner(ownerId, ctx.people, clientId).state === 'lost'
    ? <div className="text-[11px] text-gray-400 mt-1">The earlier owner can no longer open this artist.</div>
    : null
}

/** The picker as a labelled form row, with the note about a former owner. Nothing at all when owners are not shown here. */
export function OwnerFormField({ clientId, value, startedWith, onChange, disabled }: {
  clientId: string
  value: string
  /** What the item had saved before this form was opened (to say so when that person can no longer open the artist). */
  startedWith?: string
  onChange: (ownerId: string) => void
  disabled?: boolean
}) {
  const ctx = useOwnerPeople()
  if (!ctx) return null
  return (
    <FormField label="Owner">
      <OwnerSelect clientId={clientId} value={value} onChange={onChange} disabled={disabled} />
      {value === '' && <LostOwnerNote clientId={clientId} ownerId={startedWith} />}
    </FormField>
  )
}

/** The Owner cell on a show's page: a picker for someone who may edit the show, otherwise just the chip. */
export function ShowOwnerCell({ show, clientId, editable }: { show: Show; clientId: string; editable: boolean }) {
  const setShowOwner = useStore(s => s.setShowOwner)
  const start = useStartingOwner(show.ownerId, clientId)
  const ctx = useOwnerPeople()
  if (!ctx) return null
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Owner</div>
      {editable ? (
        <>
          <OwnerSelect clientId={clientId} value={start} onChange={v => setShowOwner(show.id, v || null)} />
          {start === '' && <LostOwnerNote clientId={clientId} ownerId={show.ownerId} />}
        </>
      ) : (
        <OwnerChip clientId={clientId} ownerId={show.ownerId} live={showNeedsOwner(show, today())} />
      )}
    </div>
  )
}
