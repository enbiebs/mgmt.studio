import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { BILLS_BUCKET, requireBillAccess } from '@/lib/bills'
import { uid } from '@/lib/utils'

// Hands the browser a one-time signed URL to upload a bill PDF straight to
// private storage. Going direct (instead of through this server) sidesteps
// Vercel's 4.5MB request-body limit, which a scanned bill can exceed.
export async function POST(req: NextRequest) {
  const { clientId } = await req.json()
  const gate = await requireBillAccess(clientId, true)
  if (gate.error) return gate.error

  const path = `${clientId}/${uid()}.pdf`
  const { data, error } = await createAdminClient().storage.from(BILLS_BUCKET).createSignedUploadUrl(path)
  if (error || !data) return NextResponse.json({ error: 'Could not start the upload' }, { status: 500 })

  return NextResponse.json({ path: data.path, token: data.token })
}
