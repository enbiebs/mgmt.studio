import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fail, parseJson } from '@/lib/api-guard'
import { brandingRemoveBody } from '@/lib/api-schemas'
import { BRANDING_BUCKET, BRANDING_COLUMN, requireBrandingEdit, requireBrandingView, type BrandingKind } from '@/lib/branding'

const kindOf = (v: string | null): BrandingKind | null => (v === 'photo' || v === 'logo' ? v : null)

// Shows the artist's current photo or logo: checks the caller may open this artist, then redirects to a
// short-lived signed link (the bucket itself is private). The redirect may be kept by the browser for a few
// minutes so a page full of avatars does not ask again for each one.
export async function GET(req: NextRequest) {
  const kind = kindOf(req.nextUrl.searchParams.get('kind'))
  if (!kind) return fail(400, 'Missing or invalid kind')
  const gate = await requireBrandingView(req.nextUrl.searchParams.get('clientId'))
  if (gate.error) return gate.error

  const column = BRANDING_COLUMN[kind]
  const admin = createAdminClient()
  const { data } = await admin.from('clients').select(column).eq('id', gate.clientId).maybeSingle()
  const path = (data as Record<string, string | null> | null)?.[column]
  if (!path) return fail(404, 'No picture')
  const { data: signed, error } = await admin.storage.from(BRANDING_BUCKET).createSignedUrl(path, 600)
  if (error || !signed) return fail(404, 'No picture')
  const res = NextResponse.redirect(signed.signedUrl)
  res.headers.set('Cache-Control', 'private, max-age=300')
  return res
}

// Takes the photo or logo away (and deletes the file).
export async function DELETE(req: NextRequest) {
  const body = await parseJson(req, brandingRemoveBody)
  if (body.error) return body.error
  const { clientId, kind } = body.data
  const gate = await requireBrandingEdit(clientId, 'file')
  if (gate.error) return gate.error

  const column = BRANDING_COLUMN[kind]
  const admin = createAdminClient()
  const { data } = await admin.from('clients').select(column).eq('id', clientId).maybeSingle()
  const path = (data as Record<string, string | null> | null)?.[column]
  await admin.from('clients').update({ [column]: null }).eq('id', clientId)
  if (path) await admin.storage.from(BRANDING_BUCKET).remove([path])
  return NextResponse.json({ ok: true })
}
