import { NextRequest, NextResponse } from 'next/server'
import { getAuthUrl } from '@/lib/google-calendar'
import { parseJson, requireClientAccess } from '@/lib/api-guard'
import { gcalConnectBody } from '@/lib/api-schemas'

// Starts connecting one client's Google Calendar. Returns the Google
// consent URL for the browser to navigate to — Google itself handles the
// actual login, the same way Plaid's own Link UI does for bank connections
// (see src/app/api/plaid/create-link-token/route.ts).
export async function POST(req: NextRequest) {
  const body = await parseJson(req, gcalConnectBody)
  if (body.error) return body.error
  const { clientId, timeZone } = body.data

  // Connecting a calendar is a setup action: Tour edit access to this artist, never the artist's own login.
  const gate = await requireClientAccess(clientId, { section: 'tour', edit: true, managementSide: true })
  if (gate.error) return gate.error
  const { user } = gate

  // The server has no access to the browser's timezone on its own, so the
  // browser passes its own Intl-resolved zone through — carried in `state`
  // since that's the one thing Google hands straight back at the callback.
  const state = `${user.id}:${clientId}:${timeZone || 'UTC'}`
  return NextResponse.json({ url: getAuthUrl(state) })
}
