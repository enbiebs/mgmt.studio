import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseJson, requireClientAccess, serverError } from '@/lib/api-guard'
import { clientOnly } from '@/lib/api-schemas'
import { encryptionConfigured } from '@/lib/field-crypto'
import { SECURE_TABLE } from '@/lib/profile-secure-server'

// Says which private fields are filled in for each person (names only, never values), so the screen can show
// "5 filled in" without revealing anything or writing to the access log.
export async function POST(req: NextRequest) {
  const body = await parseJson(req, clientOnly)
  if (body.error) return body.error
  const { clientId } = body.data

  const gate = await requireClientAccess(clientId, { section: 'profile', edit: false, managementSide: true })
  if (gate.error) return gate.error

  const { data, error } = await createAdminClient().from(SECURE_TABLE).select('subject, fields').eq('client_id', clientId).eq('tier', 'private')
  if (error) return serverError('Reading profile field names failed', error, "Couldn't load the private details. Please try again.")

  const subjects: Record<string, string[]> = {}
  for (const r of (data ?? []) as { subject: string; fields: string[] }[]) subjects[r.subject] = r.fields
  return NextResponse.json({ configured: encryptionConfigured(), subjects })
}
