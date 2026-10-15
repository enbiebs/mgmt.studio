import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fail, parseJson, requireClientAccess, serverError } from '@/lib/api-guard'
import { secureReadBody } from '@/lib/api-schemas'
import { decryptJson, encryptionConfigured, secureLocation } from '@/lib/field-crypto'
import { SECURE_TABLE, logAccess, subjectExists } from '@/lib/profile-secure-server'

// Reveals one person's private details. The reveal is written to the access log FIRST: if it cannot be
// recorded, nothing is revealed.
export async function POST(req: NextRequest) {
  const body = await parseJson(req, secureReadBody)
  if (body.error) return body.error
  const { clientId, subject, tier } = body.data

  const gate = await requireClientAccess(clientId, { section: 'profile', edit: false, managementSide: true, limit: 'reveal' })
  if (gate.error) return gate.error
  if (!encryptionConfigured()) return fail(503, 'Private details are not switched on yet.')
  if (!(await subjectExists(clientId, subject))) return fail(400, 'That person was not found')

  const { data: row, error } = await createAdminClient().from(SECURE_TABLE)
    .select('data_enc, fields').eq('client_id', clientId).eq('subject', subject).eq('tier', tier).maybeSingle()
  if (error) return serverError('Reading private details failed', error, "Couldn't load the private details. Please try again.")
  if (!row) return NextResponse.json({ data: {} })     // nothing stored yet: nothing to reveal, nothing to log

  if (!(await logAccess(gate.user, clientId, subject, tier, 'reveal', row.fields))) {
    return fail(500, "Couldn't record this view, so the details were not shown. Please try again.")
  }
  try {
    return NextResponse.json({ data: decryptJson<Record<string, string>>(row.data_enc, secureLocation(clientId, subject, tier)) })
  } catch (e) {
    return serverError('Could not unscramble private details', e, "Couldn't open these details. They may have been saved with a different key.")
  }
}
