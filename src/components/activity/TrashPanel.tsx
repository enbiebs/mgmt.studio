'use client'
// ──────────────────────────────────────────────────────────
//  The Trash for one artist: what was deleted in the last 30 days, who deleted it, and how long it is kept. The database shows a copy only
//  to someone who can open every part of the app it touches (a show's copy carries fee terms and bills, a person's carries crew rates),
//  and lets them put it back or delete it for good with edit access to the item's own part. A teammate with less than that does not see
//  it here; a manager does.
// ──────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react'
import { useStore } from '@/lib/store'
import { Modal } from '@/components/ui/Modal'
import { askConfirm } from '@/lib/confirm'
import { notify } from '@/lib/notify'
import { TRASH_DAYS, daysLeft, daysLeftText, kindNoun } from '@/lib/trash'
import { deleteTrashItemForever, loadTrash, type TrashItem } from '@/lib/trash-db'
import { fromDateStr, localDateOf } from '@/lib/utils'

const shortDate = (ts: string) => fromDateStr(localDateOf(ts)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

export function TrashPanel({ onClose }: { onClose: () => void }) {
  const clientId = useStore(s => s.clientId)
  const clientName = useStore(s => s.getClient()?.name)
  const myId = useStore(s => s.userId)
  const logins = useStore(s => s.workspacePeople)
  const restoreBy = useStore(s => s.restoreBy)
  const restoreFromTrash = useStore(s => s.restoreFromTrash)
  const [items, setItems] = useState<TrashItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  // Reads the list again (after putting something back or deleting it for good).
  const load = useCallback(async () => {
    if (!clientId) return
    try { setItems(await loadTrash(clientId)); setError('') } catch (e) { console.error(e); setError("Couldn't load the trash. Please try again.") }
  }, [clientId])

  // What has expired is not shown (the database hides it) and is cleared out by the daily job.
  useEffect(() => {
    if (!clientId) return
    let live = true
    loadTrash(clientId).then(list => { if (live) { setItems(list); setLoading(false) } }, e => { console.error(e); if (live) { setError("Couldn't load the trash. Please try again."); setLoading(false) } })
    return () => { live = false }
  }, [clientId])

  const who = (item: TrashItem) => (item.deletedBy && item.deletedBy === myId ? 'You' : logins.find(p => p.userId === item.deletedBy)?.label ?? 'Someone')

  async function restore(item: TrashItem) {
    setBusy(item.id)
    await restoreFromTrash(item.id)
    await load()
    setBusy(null)
  }

  async function removeForever(item: TrashItem) {
    const ok = await askConfirm({
      title: `Delete "${item.label}" for good?`,
      body: item.files.length > 0 ? 'Its attached file goes too.' : undefined,
      confirmLabel: 'Delete for good',
      note: 'This cannot be undone.',
    })
    if (!ok) return
    setBusy(item.id)
    try {
      if (!(await deleteTrashItemForever(item))) notify("Couldn't delete that for good. It is still in the trash. Please try again.")
    } catch (e) { console.error(e); notify("Couldn't delete that. Please try again.") }
    await load()
    setBusy(null)
  }

  return (
    <Modal title={`Trash${clientName ? ` — ${clientName}` : ''}`} onClose={onClose} wide footer={
      <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Close</button>
    }>
      <p className="text-sm text-gray-500">Things deleted from this artist are kept here for {TRASH_DAYS} days, then removed for good. Putting one back also puts back what was deleted with it.</p>
      {error && <div className="rounded-lg border border-red-200 text-red-600 text-xs px-3 py-2">{error}</div>}
      {loading && <div className="py-6 text-center text-xs text-gray-400">Loading…</div>}
      {!loading && !error && items.length === 0 && <div className="py-8 text-center text-sm text-gray-400">The trash is empty.</div>}
      <ul className="divide-y divide-gray-100">
        {items.map(item => {
          const mayRestore = restoreBy(item.kind, item.clientId) === 'you'
          const left = daysLeft(item.expiresAt)
          return (
            <li key={item.id} className="flex items-start gap-3 py-3">
              <span className="mt-0.5 shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">{kindNoun(item.kind)}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{item.label}</div>
                {item.detail && <div className="truncate text-xs text-gray-500">{item.detail}</div>}
                <div className="text-[11px] text-gray-400">{who(item)} deleted it {shortDate(item.deletedAt)} · {daysLeftText(left)}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => void restore(item)} disabled={!mayRestore || busy !== null}
                  title={mayRestore ? undefined : 'You can look at this, but you don’t have edit access to put it back.'}
                  className="px-2.5 py-1 bg-accent text-white rounded-lg text-xs font-medium hover:bg-accent-hover disabled:opacity-50"
                >
                  {busy === item.id ? 'Working…' : 'Restore'}
                </button>
                <button
                  onClick={() => void removeForever(item)} disabled={!mayRestore || busy !== null}
                  className="px-2 py-1 text-xs text-gray-400 hover:text-red-500 disabled:opacity-50"
                >
                  Delete for good
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}
