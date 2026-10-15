import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fail, parseJson, serverError } from '@/lib/api-guard'
import { brandingSaveBody } from '@/lib/api-schemas'
import { BRANDING_BUCKET, BRANDING_COLUMN, MAX_BRANDING_BYTES, isBrandingPathFor, requireBrandingEdit, verifiedImageKind } from '@/lib/branding'

// Makes an uploaded picture the artist's current photo or logo, after looking at what was really uploaded:
// the right folder, small enough, and genuinely a PNG, JPEG or WEBP (a renamed file of any other kind is
// deleted). The previous picture is removed so nothing piles up.
export async function POST(req: NextRequest) {
  const body = await parseJson(req, brandingSaveBody)
  if (body.error) return body.error
  const { clientId, kind, path } = body.data
  const gate = await requireBrandingEdit(clientId, 'upload')
  if (gate.error) return gate.error
  if (!isBrandingPathFor(clientId, kind, path)) return fail(400, 'Bad file path')

  const admin = createAdminClient()
  const { data: blob, error: readErr } = await admin.storage.from(BRANDING_BUCKET).download(path)
  if (readErr || !blob) return fail(400, "That upload wasn't found. Please try again.")
  const bytes = new Uint8Array(await blob.arrayBuffer())
  if (bytes.length > MAX_BRANDING_BYTES || !verifiedImageKind(path, bytes)) {
    await admin.storage.from(BRANDING_BUCKET).remove([path])
    return fail(400, bytes.length > MAX_BRANDING_BYTES ? 'That picture is over 5 MB' : 'That file is not a PNG, JPG or WEBP picture')
  }

  const column = BRANDING_COLUMN[kind]
  const { data: before } = await admin.from('clients').select(column).eq('id', clientId).maybeSingle()
  const previous = (before as Record<string, string | null> | null)?.[column] ?? null
  const { error: saveErr } = await admin.from('clients').update({ [column]: path }).eq('id', clientId)
  if (saveErr) {
    await admin.storage.from(BRANDING_BUCKET).remove([path])
    return serverError('Branding save failed', saveErr, "Couldn't save that picture. Please try again.")
  }
  if (previous && previous !== path) await admin.storage.from(BRANDING_BUCKET).remove([previous])
  return NextResponse.json({ ok: true, path })
}
