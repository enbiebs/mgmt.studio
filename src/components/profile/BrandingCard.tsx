'use client'
// The artist's photo and logo: the part that makes the pages feel like theirs. Shown on the Profile for the team
// and in the artist's own portal; either can upload. (Pictures are shrunk here, then checked again by the
// server by their real contents before they are saved.)
import { useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import { removeBranding, uploadBranding } from '@/lib/branding-upload'
import type { BrandingKind } from '@/lib/branding-paths'
import { ArtistAvatar } from '@/components/ui/ArtistAvatar'
import type { Client } from '@/types'
import { Card } from './FieldsCard'

export function BrandingCard({ client, canEdit }: { client: Client; canEdit: boolean }) {
  return (
    <Card
      title="Photo & logo"
      hint="A photo and a logo make this feel like the artist's own, here and in their own portal. PNG, JPG or WEBP up to 5 MB; they are shrunk to fit."
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Tile client={client} kind="photo" canEdit={canEdit} />
        <Tile client={client} kind="logo" canEdit={canEdit} />
      </div>
    </Card>
  )
}

function Tile({ client, kind, canEdit }: { client: Client; kind: BrandingKind; canEdit: boolean }) {
  const setBranding = useStore(s => s.setBranding)
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const path = kind === 'photo' ? client.photoPath : client.logoPath

  async function pick(file: File | undefined) {
    if (!file) return
    setBusy(true); setError('')
    const r = await uploadBranding(client.id, kind, file)
    setBusy(false)
    if (input.current) input.current.value = ''
    if (r.ok) setBranding(client.id, kind, r.path); else setError(r.error)
  }
  async function remove() {
    if (!confirm(`Remove the ${kind}?`)) return
    setBusy(true); setError('')
    const ok = await removeBranding(client.id, kind)
    setBusy(false)
    if (ok) setBranding(client.id, kind, null); else setError("Couldn't remove it. Please try again.")
  }

  return (
    <div className="flex items-center gap-4">
      <div className={kind === 'photo' ? 'w-24 h-24' : 'w-36 h-24 rounded-2xl border border-gray-100 bg-gray-50 flex items-center justify-center overflow-hidden p-2'}>
        {kind === 'photo' ? (
          <ArtistAvatar client={client} className="w-24 h-24" textClass="text-2xl" rounded="rounded-2xl" />
        ) : path ? (
          // eslint-disable-next-line @next/next/no-img-element -- a private, access-checked file behind a redirect
          <img src={`/api/branding/file?clientId=${encodeURIComponent(client.id)}&kind=logo&v=${encodeURIComponent(path)}`} alt={`${client.name} logo`} className="max-w-full max-h-full object-contain" />
        ) : (
          <span className="text-[11px] text-gray-400 text-center leading-snug">No logo yet</span>
        )}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium capitalize">{kind}</div>
        {canEdit ? (
          <div className="mt-1.5 flex flex-wrap gap-2">
            <button
              onClick={() => input.current?.click()} disabled={busy}
              className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              {busy ? 'Working…' : path ? 'Replace' : 'Upload'}
            </button>
            {path && !busy && <button onClick={remove} className="px-1.5 py-1 text-xs text-gray-400 hover:text-red-500">Remove</button>}
            <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => pick(e.target.files?.[0])} aria-label={`Upload a ${kind}`} />
          </div>
        ) : (
          <div className="text-xs text-gray-400 mt-1">{path ? 'Set' : 'Not set'}</div>
        )}
        {error && <div className="text-xs text-red-500 mt-1.5">{error}</div>}
      </div>
    </div>
  )
}
