'use client'
// Puts an artist's photo or logo in place from the browser: shrink it (which also drops hidden details such as
// the place a phone photo was taken), send it straight to private storage, then ask the server to make it the
// current one (the server looks at the real bytes before it agrees). Used by the Profile and the artist's portal.

import { createClient } from '@/lib/supabase/client'
import { BRANDING_BUCKET, BRANDING_EXT, MAX_BRANDING_BYTES, MAX_SIDE, fitWithin, type BrandingKind } from '@/lib/branding-paths'

export type UploadResult = { ok: true; path: string } | { ok: false; error: string }

/** Re-draws the picture smaller. Photos become JPEG; logos stay PNG so transparent backgrounds survive. */
async function prepare(file: File, kind: BrandingKind): Promise<{ blob: Blob; ext: 'jpg' | 'png' } | string> {
  let bitmap: ImageBitmap
  try { bitmap = await createImageBitmap(file) } catch { return "That file couldn't be read as a picture." }
  const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_SIDE[kind])
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return "This browser couldn't prepare the picture."
  if (kind === 'photo') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height) }   // JPEG has no see-through: a white base
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const type = kind === 'photo' ? 'image/jpeg' : 'image/png'
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, 0.88))
  if (!blob) return "This browser couldn't prepare the picture."
  if (blob.size > MAX_BRANDING_BYTES) return 'That picture is still over 5 MB after shrinking. Try a smaller one.'
  return { blob, ext: kind === 'photo' ? 'jpg' : 'png' }
}

export async function uploadBranding(clientId: string, kind: BrandingKind, file: File): Promise<UploadResult> {
  const nameExt = (file.name.split('.').pop() ?? '').toLowerCase()
  if (!file.type.startsWith('image/') || (nameExt && !BRANDING_EXT[nameExt])) return { ok: false, error: 'Please use a PNG, JPG or WEBP picture.' }
  const ready = await prepare(file, kind)
  if (typeof ready === 'string') return { ok: false, error: ready }
  try {
    const urlRes = await fetch('/api/branding/upload-url', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, kind, ext: ready.ext }),
    })
    const target = await urlRes.json()
    if (!urlRes.ok) return { ok: false, error: target.error ?? "Couldn't start the upload." }
    const { error: uploadErr } = await createClient().storage.from(BRANDING_BUCKET)
      .uploadToSignedUrl(target.path, target.token, ready.blob, { contentType: ready.blob.type })
    if (uploadErr) return { ok: false, error: "Couldn't upload that picture. Please try again." }
    const saveRes = await fetch('/api/branding/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, kind, path: target.path }),
    })
    const saved = await saveRes.json()
    if (!saveRes.ok) return { ok: false, error: saved.error ?? "Couldn't save that picture." }
    return { ok: true, path: saved.path }
  } catch {
    return { ok: false, error: 'Something went wrong. Please try again.' }
  }
}

export async function removeBranding(clientId: string, kind: BrandingKind): Promise<boolean> {
  try {
    const res = await fetch('/api/branding/file', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, kind }),
    })
    return res.ok
  } catch { return false }
}
