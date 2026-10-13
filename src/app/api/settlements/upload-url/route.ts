import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SETTLEMENTS_BUCKET, SETTLEMENT_TYPES, requireSettlementAccess, type SettlementExt } from '@/lib/settlements'
import { uid } from '@/lib/utils'

// Hands the browser a one-time signed URL to upload a settlement (PDF or photo/scan)
// straight to private storage. Going direct sidesteps Vercel's 4.5MB request-body limit,
// which a scanned statement easily exceeds.
export async function POST(req: NextRequest) {
  const { clientId, ext } = await req.json()
  const gate = await requireSettlementAccess(clientId, true)
  if (gate.error) return gate.error
  const kind = String(ext ?? 'pdf').toLowerCase() as SettlementExt
  if (!(kind in SETTLEMENT_TYPES)) return NextResponse.json({ error: 'Please use a PDF, JPG, PNG or WEBP file' }, { status: 400 })

  const path = `${clientId}/${uid()}.${kind}`
  const { data, error } = await createAdminClient().storage.from(SETTLEMENTS_BUCKET).createSignedUploadUrl(path)
  if (error || !data) return NextResponse.json({ error: 'Could not start the upload' }, { status: 500 })

  return NextResponse.json({ path: data.path, token: data.token })
}
