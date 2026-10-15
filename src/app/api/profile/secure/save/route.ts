import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fail, parseJson, requireClientAccess, serverError } from '@/lib/api-guard'
import { secureSaveBody } from '@/lib/api-schemas'
import { decryptJson, encryptJson, encryptionConfigured, secureLocation } from '@/lib/field-crypto'
import { privateKeysFor } from '@/lib/profile-fields'
import { SECURE_TABLE, logAccess, subjectExists } from '@/lib/profile-secure-server'

// Changes some of one person's private details. Only the fields sent are changed (an empty value clears one);
// the rest are kept. The log records which fields were touched, never what they say.
export async function POST(req: NextRequest) {
  const body = await parseJson(req, secureSaveBody)
  if (body.error) return body.error
  const { clientId, subject, tier, set } = body.data

  const gate = await requireClientAccess(clientId, { section: 'profile', edit: true, managementSide: true, limit: 'reveal' })
  if (gate.error) return gate.error
  if (!encryptionConfigured()) return fail(503, 'Private details are not switched on yet.')
  if (!(await subjectExists(clientId, subject))) return fail(400, 'That person was not found')

  const allowed = privateKeysFor(subject)
  const unknown = Object.keys(set).filter(k => !allowed.has(k))
  if (unknown.length > 0) return fail(400, 'Some of what was sent is not a field we keep')
  if (Object.keys(set).length === 0) return NextResponse.json({ ok: true, fields: [] })

  const admin = createAdminClient()
  const where = secureLocation(clientId, subject, tier)
  const { data: row, error } = await admin.from(SECURE_TABLE).select('data_enc').eq('client_id', clientId).eq('subject', subject).eq('tier', tier).maybeSingle()
  if (error) return serverError('Reading private details before saving failed', error)

  let current: Record<string, string> = {}
  if (row) {
    try { current = decryptJson<Record<string, string>>(row.data_enc, where) }
    catch (e) { return serverError('Could not unscramble existing private details', e, "Couldn't open the saved details to update them, so nothing was changed.") }
  }
  const next = { ...current }
  for (const [k, v] of Object.entries(set)) {
    const t = v.trim()
    if (t) next[k] = t; else delete next[k]
  }
  const fields = Object.keys(next).sort()

  if (!(await logAccess(gate.user, clientId, subject, tier, 'save', Object.keys(set).sort()))) {
    return fail(500, "Couldn't record this change, so nothing was saved. Please try again.")
  }
  const { error: saveErr } = await admin.from(SECURE_TABLE).upsert({
    client_id: clientId, subject, tier, data_enc: encryptJson(next, where), fields,
    updated_at: new Date().toISOString(), updated_by: gate.user.id,
  })
  if (saveErr) return serverError('Saving private details failed', saveErr, "Couldn't save. Please try again.")
  return NextResponse.json({ ok: true, fields })
}
