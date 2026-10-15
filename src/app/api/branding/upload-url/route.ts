import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseJson } from '@/lib/api-guard'
import { brandingUploadBody } from '@/lib/api-schemas'
import { BRANDING_BUCKET, BRANDING_EXT, requireBrandingEdit } from '@/lib/branding'
import { uid } from '@/lib/utils'

// Hands the browser a one-time signed URL to upload an artist's photo or logo straight to private storage.
// The picture is checked again (by its real bytes, not its name) when it is saved: see ../save.
export async function POST(req: NextRequest) {
  const body = await parseJson(req, brandingUploadBody)
  if (body.error) return body.error
  const { clientId, kind, ext } = body.data
  const gate = await requireBrandingEdit(clientId, 'upload')
  if (gate.error) return gate.error
  const type = BRANDING_EXT[ext.toLowerCase()]
  if (!type) return NextResponse.json({ error: 'Please use a PNG, JPG or WEBP picture' }, { status: 400 })

  const path = `${clientId}/${kind}-${uid()}${uid()}.${type}`
  const { data, error } = await createAdminClient().storage.from(BRANDING_BUCKET).createSignedUploadUrl(path)
  if (error || !data) return NextResponse.json({ error: 'Could not start the upload' }, { status: 500 })
  return NextResponse.json({ path: data.path, token: data.token })
}
