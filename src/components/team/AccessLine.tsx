'use client'
// ──────────────────────────────────────────────────────────
//  The access half of a person on the Team page: what they can do for THIS artist, a role menu that changes it, and the
//  small actions under it (choose pages, preview, remove or cancel the invite, send it again). Shown to managers and to
//  this artist's Point People only. The same piece draws a team card's access and a login that has no card.
// ──────────────────────────────────────────────────────────
import { Badge } from '@/components/ui/Badge'
import { ADMIN_KEY, levelsOf, otherAccess, type SectionKey } from '@/lib/access-presets'
import { describeRow, levelLabel, resendWording, type SharingRow } from '@/lib/sharing'
import type { Client } from '@/types'
import { RoleMenu } from './RoleMenu'
import { PagesPanel } from './PagesPanel'
import type { ArtistSharing, PersonRow } from './useArtistSharing'

export function AccessLine({ row, client, sharing: s, showName = false }: { row: SharingRow; client: Client; sharing: ArtistSharing; showName?: boolean }) {
  const id = row.person.memberId
  const me = id === s.myMemberId
  const waiting = row.kind === 'person' && !!row.person.invited
  const shared = row.kind === 'person' && row.grants.length > 0
  const pending = s.confirm?.memberId === id ? s.confirm : null
  const extras = s.isManager && row.kind === 'person' ? otherAccess(row.grants, client.id) : []
  const working = s.working

  const text =
    row.kind === 'manager' ? 'Manager: sees and changes everything, for every artist.'
    : row.kind === 'company' ? 'Can open every artist. This was set by a manager for the whole company.'
    : shared ? describeRow(row, client.id)
    : `Has a login, but cannot open ${client.name} yet. Choose a role to share it.`

  return (
    <div>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-48">
          {(showName || waiting || me) && (
            <div className="flex flex-wrap items-center gap-2">
              {showName && <span className="truncate text-sm font-semibold">{row.person.label}</span>}
              {me && <span className="text-[11px] text-gray-400">(you)</span>}
              {waiting && <Badge variant="amber">Invited, waiting to accept</Badge>}
            </div>
          )}
          <div className="text-xs text-gray-500">{text}</div>
          {row.kind === 'person' && row.alsoCompanyWide && shared && <div className="text-[11px] text-amber-700">Also has company-wide access, set by a manager.</div>}
          {extras.length > 0 && <div className="text-[11px] text-amber-700">Also has: {extras.join(', ')}.</div>}
        </div>

        {row.kind === 'person' ? (
          <div className="w-full sm:w-72 sm:flex-none">
            <RoleMenu
              ariaLabel={`Role for ${row.person.label}`} busy={working}
              value={row.levelKey} shownAs={!shared ? 'Not shared yet' : row.levelKey === 'none' || row.levelKey === 'custom' ? levelLabel(row.levelKey) : undefined}
              onChange={key => s.chooseLevel(row, key)}
            />
          </div>
        ) : (
          <Badge variant="gray">{row.kind === 'manager' ? 'Manager' : 'All artists'}</Badge>
        )}
      </div>

      {row.kind === 'person' && <Actions row={row} client={client} sharing={s} waiting={waiting} shared={shared} />}

      {row.kind === 'person' && s.openPages === id && row.levelKey !== ADMIN_KEY && (
        <div className="mt-3">
          <PagesPanel
            levels={levelsOf(row.grants, client.id)} pointPerson={false} disabled={working}
            onCycle={(sec: SectionKey) => s.cycle(row, sec, levelsOf(row.grants, client.id))}
            onSetAll={level => s.setAll(row, levelsOf(row.grants, client.id), level)}
            onPointPerson={() => s.chooseLevel(row, ADMIN_KEY)}
          />
          <p className="mt-1 text-[11px] text-gray-500">Taking away their last page removes them from this artist.</p>
        </div>
      )}

      {row.kind === 'person' && pending && (
        <div role="alert" className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p>{pending.text}</p>
          <div className="mt-2 flex gap-2">
            <button
              disabled={working}
              onClick={() => pending.kind === 'level' ? void s.commitLevel(row, pending.key) : pending.kind === 'cancel' ? void s.commitCancel(row) : void s.commitRemove(row)}
              className="rounded-lg bg-accent px-2.5 py-1 font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {pending.kind === 'remove' ? 'Remove' : pending.kind === 'cancel' ? 'Cancel invite' : pending.key === ADMIN_KEY ? 'Make Point Person' : 'Continue'}
            </button>
            <button disabled={working} onClick={() => s.setConfirm(null)} className="rounded-lg border border-amber-200 px-2.5 py-1 font-medium hover:bg-amber-100 disabled:opacity-50">Keep</button>
          </div>
        </div>
      )}
      {s.notice[id] && <p role="status" className="mt-2 text-xs text-green-700">{s.notice[id]}</p>}
      {s.problem[id] && <p role="alert" className="mt-2 text-xs text-red-600">{s.problem[id]}</p>}
    </div>
  )
}

function Actions({ row, client, sharing: s, waiting, shared }: { row: PersonRow; client: Client; sharing: ArtistSharing; waiting: boolean; shared: boolean }) {
  const id = row.person.memberId
  const label = row.person.label
  const link = 'font-medium text-gray-500 hover:text-gray-900 disabled:opacity-50'
  // Sending an email is a manager's job (the route enforces it). Anyone with a login can be sent one, pages or not:
  // someone who could not get in must be reachable from wherever they are listed.
  const canResend = s.isManager && row.person.memberId !== s.myMemberId
  if (!shared && !waiting && !canResend) return null
  return (
    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
      {shared && row.levelKey !== ADMIN_KEY && (
        <button
          onClick={() => s.setOpenPages(s.openPages === id ? null : id)} aria-expanded={s.openPages === id}
          aria-label={`${s.openPages === id ? 'Hide' : 'Choose'} pages for ${label}`} className={link}
        >
          {s.openPages === id ? 'Hide pages' : 'Choose pages'}
        </button>
      )}
      {s.canPreview(id) && !waiting && shared && (
        <button onClick={() => void s.previewAs(id)} aria-label={`Preview what ${label} sees`} className={link}>Preview what they see</button>
      )}
      {canResend && (
        <button onClick={() => void s.resend(row)} disabled={s.working} aria-label={`${resendWording(waiting).button} to ${label}`} className={link}>
          {resendWording(waiting).button}
        </button>
      )}
      {waiting && s.isManager ? (
        <button onClick={() => s.askCancel(row)} disabled={s.working} aria-label={`Cancel the invitation to ${label}`} className="font-medium text-red-600 hover:underline disabled:opacity-50">
          Cancel invite
        </button>
      ) : shared ? (
        <button onClick={() => s.askRemove(row)} disabled={s.working} aria-label={`Remove ${label} from ${client.name}`} className="font-medium text-red-600 hover:underline disabled:opacity-50">
          Remove
        </button>
      ) : null}
      {s.busy === id && <span className="text-gray-400">Saving…</span>}
    </div>
  )
}
