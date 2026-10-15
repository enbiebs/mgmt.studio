import { NextRequest, NextResponse } from 'next/server'
import { parseJson, requireClientAccess } from '@/lib/api-guard'
import { gcalPushBody, SECTION_FOR_RECORD } from '@/lib/api-schemas'
import { pushShowToGoogle, pushPostToGoogle, pushProjectToGoogle } from '@/lib/google-calendar-sync'
import type { Show, Post, Project } from '@/types'

// Called by the store (src/lib/store.ts) after a Show/Post/Project save —
// store.ts runs in the browser and can't call the server-only Google sync
// code directly, so this route is the bridge, the same role
// /api/plaid/sync plays for bank data. A no-op if the client has no
// Google Calendar connection (see pushRecord in google-calendar-sync.ts).
export async function POST(req: NextRequest) {
  const body = await parseJson(req, gcalPushBody, 200_000)
  if (body.error) return body.error
  const { clientId, recordType, record } = body.data

  // Only someone who could have saved this kind of record (a show, a post, a project) may send it to Google.
  const gate = await requireClientAccess(clientId, { section: SECTION_FOR_RECORD[recordType], edit: true, managementSide: false, limit: 'sync' })
  if (gate.error) return gate.error

  try {
    if (recordType === 'show') await pushShowToGoogle(record as unknown as Show, clientId)
    else if (recordType === 'post') await pushPostToGoogle(record as unknown as Post, clientId)
    else if (recordType === 'project') await pushProjectToGoogle(record as unknown as Project, clientId)
    else return NextResponse.json({ error: 'Unknown recordType' }, { status: 400 })
  } catch (e) {
    // A failed Google push shouldn't be treated as a failed save — the
    // record is already saved in Mgmt Studio regardless. Log and return ok.
    console.error('Google Calendar push failed', e)
  }

  return NextResponse.json({ ok: true })
}
