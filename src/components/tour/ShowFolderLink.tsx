'use client'
import { useState } from 'react'
import { useStore } from '@/lib/store'
import { inputClass } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import { isWebAddress } from '@/lib/drive-links'
import type { Show } from '@/types'

/** "Open folder" for one show, once its own folder is linked (the artist's Touring folder is already one click away in the page header). Anyone who can edit can link or change it. */
export function ShowFolderLink({ show, canEdit }: { show: Show; canEdit: boolean }) {
  const update = useStore(s => s.updateShowFinancials)
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState('')

  const folder = isWebAddress(show.driveUrl) ? show.driveUrl.trim() : undefined

  function save() {
    const v = (draft ?? '').trim()
    if (v && !isWebAddress(v)) { setError('The link must start with https://'); return }
    update(show.id, { driveUrl: v || undefined })
    setDraft(null); setError('')
  }

  if (draft !== null) {
    return (
      <div className="flex w-full flex-wrap items-center gap-2">
        <input className={`${inputClass} max-w-[360px]`} autoFocus value={draft} placeholder="https://drive.google.com/… (this show's folder)" onChange={e => { setDraft(e.target.value); setError('') }} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setDraft(null) }} />
        <button onClick={save} className="rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-hover">Save</button>
        <button onClick={() => { setDraft(null); setError('') }} className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-50">Cancel</button>
        {error && <span role="alert" className="text-xs text-red-600">{error}</span>}
      </div>
    )
  }

  return (
    <>
      {folder && (
        <a
          href={folder} target="_blank" rel="noopener noreferrer" title="Open this show's folder"
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-50"
        >
          <Icon name="folder" className="h-3.5 w-3.5" /> Open folder ↗
        </a>
      )}
      {canEdit && (
        <button onClick={() => { setDraft(show.driveUrl ?? ''); setError('') }} className="rounded-lg px-2 py-1 text-xs text-gray-400 hover:text-gray-700">
          {folder ? 'Change folder link' : '+ Link this show’s folder'}
        </button>
      )}
    </>
  )
}
