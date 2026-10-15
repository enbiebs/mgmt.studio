'use client'
// The artist's picture: their photo if they have one, otherwise their initials on their color. The photo is a
// private file, shown through /api/branding/file (which checks the viewer may open this artist). `v` changes
// when the photo changes, so the new one shows straight away.
import { useState } from 'react'
import { initials } from '@/lib/utils'
import type { Client } from '@/types'

export function ArtistAvatar({ client, className, textClass = 'text-[11px]', rounded = 'rounded-full' }: {
  client: Pick<Client, 'id' | 'name' | 'color' | 'photoPath'>
  className: string          // the size, e.g. "w-8 h-8"
  textClass?: string         // the size of the initials
  rounded?: string
}) {
  const [failed, setFailed] = useState<string | null>(null)
  if (client.photoPath && failed !== client.photoPath) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a private, access-checked file behind a redirect: next/image can't optimise it
      <img
        src={`/api/branding/file?clientId=${encodeURIComponent(client.id)}&kind=photo&v=${encodeURIComponent(client.photoPath)}`}
        alt="" onError={() => setFailed(client.photoPath ?? null)}
        className={`${className} ${rounded} object-cover flex-shrink-0 bg-gray-100`}
      />
    )
  }
  return (
    <span className={`${className} ${rounded} flex items-center justify-center text-white font-bold flex-shrink-0 ${textClass}`} style={{ background: client.color }}>
      {initials(client.name)}
    </span>
  )
}
