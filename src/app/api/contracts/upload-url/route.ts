import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CONTRACTS_BUCKET, requireContractAccess } from '@/lib/contracts-server'
import { parseJson } from '@/lib/api-guard'
import { contractUploadBody } from '@/lib/api-schemas'

// Hands the browser a one-time signed URL to upload a contract (PDF or Word) straight to private storage, so a long scanned contract
// is not held up by the 4.5MB limit on a request body. The person needs edit access to this artist's Legal page.
export async function POST(req: NextRequest) {
  const body = await parseJson(req, contractUploadBody)
  if (body.error) return body.error
  const { clientId, kind } = body.data
  const gate = await requireContractAccess(clientId, true, 'upload')
  if (gate.error) return gate.error

  const path = `${clientId}/${crypto.randomUUID()}.${kind}`   // an unguessable name: the path itself is what keeps a file private
  const { data, error } = await createAdminClient().storage.from(CONTRACTS_BUCKET).createSignedUploadUrl(path)
  if (error || !data) return NextResponse.json({ error: 'Could not start the upload' }, { status: 500 })
  return NextResponse.json({ path: data.path, token: data.token })
}
