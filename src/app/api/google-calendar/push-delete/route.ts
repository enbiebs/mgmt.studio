import { NextRequest, NextResponse } from 'next/server'
import { parseJson, requireClientAccess } from '@/lib/api-guard'
import { gcalPushDeleteBody, SECTION_FOR_RECORD } from '@/lib/api-schemas'
import { deleteShowFromGoogle, deletePostFromGoogle, deleteProjectFromGoogle } from '@/lib/google-calendar-sync'

// Mirrors /api/google-calendar/push, for deletes. Called by the store
// after a Show/Post/Project is deleted locally.
export async function POST(req: NextRequest) {
  const body = await parseJson(req, gcalPushDeleteBody)
  if (body.error) return body.error
  const { clientId, recordType, recordId } = body.data

  const gate = await requireClientAccess(clientId, { section: SECTION_FOR_RECORD[recordType], edit: true, managementSide: false, limit: 'sync' })
  if (gate.error) return gate.error

  try {
    if (recordType === 'show') await deleteShowFromGoogle(recordId, clientId)
    else if (recordType === 'post') await deletePostFromGoogle(recordId, clientId)
    else if (recordType === 'project') await deleteProjectFromGoogle(recordId, clientId)
    else return NextResponse.json({ error: 'Unknown recordType' }, { status: 400 })
  } catch (e) {
    console.error('Google Calendar delete push failed', e)
  }

  return NextResponse.json({ ok: true })
}
