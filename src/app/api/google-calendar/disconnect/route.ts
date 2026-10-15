import { NextRequest, NextResponse } from 'next/server'
import { parseJson, requireClientAccess, serverError } from '@/lib/api-guard'
import { clientOnly } from '@/lib/api-schemas'
import { createAdminClient } from '@/lib/supabase/admin'

// Removes a client's Google Calendar connection (and, via cascade, its
// event links). Deliberately does not delete the dedicated Google Calendar
// itself — disconnecting here should never destroy anything on Google's side.
export async function POST(req: NextRequest) {
  const body = await parseJson(req, clientOnly)
  if (body.error) return body.error
  const { clientId } = body.data

  const gate = await requireClientAccess(clientId, { section: 'tour', edit: true, managementSide: true })
  if (gate.error) return gate.error

  const admin = createAdminClient()
  const { error: deleteErr } = await admin.from('google_calendar_connections').delete().eq('client_id', clientId)
  if (deleteErr) return serverError('Disconnecting Google Calendar failed', deleteErr, "Couldn't disconnect the calendar. Please try again.")

  return NextResponse.json({ ok: true })
}
