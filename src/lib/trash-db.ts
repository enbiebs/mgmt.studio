// ──────────────────────────────────────────────────────────
//  The trash, as far as the app is concerned: asking the database to delete something and keep a copy (one step), listing what is in the
//  trash, putting an item back, and deleting a copy for good. The deleting and the putting back are done by functions INSIDE the database
//  (supabase/tests/066_trash.sql), each as one all-or-nothing step that checks the person's access itself; this file only calls them.
//  What each kind saves is described in lib/trash.ts. Clearing out what has expired is the daily job in app/api/trash/purge.
// ──────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase/client'
import { rpcErrorCode, tableErrorCode } from '@/lib/trash-flow'
import type { TrashKind } from '@/lib/trash'

/** What the Trash list shows about a copy (the copy itself stays in the database). */
export interface TrashItem {
  id: string
  clientId: string
  kind: TrashKind
  /** The id the item had before it was deleted. */
  itemId: string
  label: string
  detail?: string
  files: string[]
  deletedBy?: string
  deletedAt: string
  expiresAt: string
}

interface TrashRow {
  id: string; client_id: string; kind: TrashKind; item_id: string; label: string; detail: string | null; files: string[]
  deleted_by: string | null; deleted_at: string; expires_at: string
}
const COLUMNS = 'id, client_id, kind, item_id, label, detail, files, deleted_by, deleted_at, expires_at'
const toItem = (r: TrashRow): TrashItem => ({
  id: r.id, clientId: r.client_id, kind: r.kind, itemId: r.item_id, label: r.label, detail: r.detail ?? undefined, files: r.files ?? [],
  deletedBy: r.deleted_by ?? undefined, deletedAt: r.deleted_at, expiresAt: r.expires_at,
})

/** An error that carries the short code trash-flow understands ('missing' when the trash is not set up in the database yet, 'forbidden'). */
function failure(error: { message: string; code?: string }): Error & { code?: string } {
  return Object.assign(new Error(error.message), { code: rpcErrorCode(error) })
}

// ── Deleting ───────────────────────────────────────────────

/** Deletes the item and keeps a copy of it and of everything that goes with it, in one step. Returns the copy's id; null when the item is not in the database. */
export async function trashDelete(a: { kind: TrashKind; id: string; label: string; detail?: string }): Promise<string | null> {
  const { data, error } = await createClient().rpc('trash_delete', { p_kind: a.kind, p_id: a.id, p_label: a.label, p_detail: a.detail ?? null })
  if (error) throw failure(error)
  return typeof data === 'string' ? data : null
}

// ── Looking ────────────────────────────────────────────────

/** What is in the trash for an artist that this person may see, newest first, not counting what has expired. */
export async function loadTrash(clientId: string): Promise<TrashItem[]> {
  const { data, error } = await createClient().from('trash_items').select(COLUMNS).eq('client_id', clientId).gt('expires_at', new Date().toISOString()).order('deleted_at', { ascending: false }).limit(200)
  if (error) { if (tableErrorCode(error) === 'missing') return []; throw error }
  return ((data ?? []) as TrashRow[]).map(toItem)
}

export async function loadTrashItem(id: string): Promise<TrashItem | null> {
  const { data, error } = await createClient().from('trash_items').select(COLUMNS).eq('id', id).maybeSingle()
  if (error) throw error
  return data ? toItem(data as TrashRow) : null
}

// ── Putting it back ────────────────────────────────────────

/** 'restored': it is back. 'already': it was back already (the copy is cleared). 'missing': there is no such copy any more. Notes say what could not be put back. */
export type RestoreOutcome = { status: 'restored' | 'already' | 'missing'; notes: string[] }

/**
 * Puts an item back as it was, in one step inside the database: it never overwrites a row that exists, and if any part cannot go back
 * none of it does and the copy stays. The copy is removed only once everything is back.
 */
export async function restoreTrash(trashId: string): Promise<RestoreOutcome> {
  const { data, error } = await createClient().rpc('trash_restore', { p_trash_id: trashId })
  if (error) throw failure(error)
  const out = data as { status?: string; notes?: unknown } | null
  const status = out?.status === 'already' || out?.status === 'missing' ? out.status : 'restored'
  return { status, notes: Array.isArray(out?.notes) ? (out.notes as string[]) : [] }
}

// ── Letting go ─────────────────────────────────────────────

/** "Delete for good": the copy goes now, and so does its stored file (a bill's PDF) unless a live bill still uses it. The server does both, as the signed-in person. */
export async function deleteTrashItemForever(item: TrashItem): Promise<boolean> {
  try {
    const res = await fetch('/api/trash/forever', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashId: item.id }) })
    return res.ok
  } catch (e) { console.error(e); return false }
}
