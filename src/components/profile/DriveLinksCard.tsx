'use client'
import { useState } from 'react'
import { useStore } from '@/lib/store'
import { inputClass } from '@/components/ui/Modal'
import { DRIVE_FOLDERS, folderLink, isWebAddress, type DriveKey } from '@/lib/drive-links'
import type { Client } from '@/types'
import { Card } from './FieldsCard'

/** The artist's Drive folders: paste each link once, and every screen gets an "Open folder" button. */
export function DriveLinksCard({ client, canEdit }: { client: Client; canEdit: boolean }) {
  const saveProfile = useStore(s => s.saveProfile)
  const [draft, setDraft] = useState<Record<string, string> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const linked = DRIVE_FOLDERS.filter(([key]) => folderLink(client, key)).length

  async function save() {
    if (!draft) return
    const clean: Partial<Record<DriveKey, string>> = {}
    for (const [key, label] of DRIVE_FOLDERS) {
      const v = (draft[key] ?? '').trim()
      if (!v) continue
      if (!isWebAddress(v)) { setError(`The ${label} link must start with https://`); return }
      clean[key] = v
    }
    setBusy(true); setError('')
    const r = await saveProfile({ drive: clean })
    setBusy(false)
    if (r.ok) setDraft(null); else setError(r.error)
  }

  return (
    <Card
      title="Drive folders"
      hint="Paste each folder's link once (in Drive: right-click the folder, Share, Copy link). Every screen then gets an Open folder button."
      action={canEdit && !draft ? (
        <button
          onClick={() => { setError(''); setDraft(Object.fromEntries(DRIVE_FOLDERS.map(([key]) => [key, client.profile?.drive?.[key] ?? '']))) }}
          className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-50"
        >
          {linked === 0 ? 'Add links' : 'Edit links'}
        </button>
      ) : undefined}
    >
      {draft ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {DRIVE_FOLDERS.map(([key, label]) => (
              <label key={key} className="block">
                <span className="mb-1 block text-xs font-semibold text-gray-500">{label}</span>
                <input className={inputClass} value={draft[key] ?? ''} placeholder="https://drive.google.com/…" onChange={e => setDraft(d => ({ ...(d ?? {}), [key]: e.target.value }))} />
              </label>
            ))}
          </div>
          {error && <p role="alert" className="mt-3 text-xs text-red-600">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setDraft(null)} disabled={busy} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium hover:bg-gray-50">Cancel</button>
            <button onClick={save} disabled={busy} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60">{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </>
      ) : linked === 0 ? (
        <p className="text-sm text-gray-500">No folders linked yet.{canEdit ? ' Start with the artist folder, then add the others.' : ''}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {DRIVE_FOLDERS.map(([key, label]) => {
            const url = folderLink(client, key)
            return (
              <li key={key} className="flex items-center justify-between gap-3 text-sm">
                <span className={url ? '' : 'text-gray-400'}>{label}</span>
                {url
                  ? <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-accent hover:underline">Open ↗</a>
                  : <span className="text-xs text-gray-300">Not linked</span>}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
