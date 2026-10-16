import { NextRequest, NextResponse } from 'next/server'
import { fail, parseJson, requireClientAccess } from '@/lib/api-guard'
import { travelEstimateBody } from '@/lib/api-schemas'
import { nightsBetween } from '@/lib/budget-assumptions'
import { webEstimateConfigured, webTravelEstimate } from '@/lib/travel-estimate-server'

// A web search takes a few seconds.
export const maxDuration = 60

// "Estimate from the web" on a budget's assumptions. Needs Finance edit access to the artist (it is a budget tool) and counts
// against the AI limit, because every call costs money. Only the route, dates and party size go out; nothing is saved here.
export async function POST(req: NextRequest) {
  const body = await parseJson(req, travelEstimateBody)
  if (body.error) return body.error
  const b = body.data

  const gate = await requireClientAccess(b.clientId, { section: 'finance', edit: true, limit: 'ai', managementSide: true })
  if ('error' in gate) return gate.error
  if (!webEstimateConfigured()) return fail(503, "Web estimates aren't switched on yet.")

  const day = new Date().toISOString().slice(0, 10)
  if (b.arrive < new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)) return fail(400, 'That trip is in the past. Check the dates.')
  if (nightsBetween(b.arrive, b.depart) > 60) return fail(400, 'That is a very long trip. Check the dates.')
  if (b.kind === 'flight' && !b.from) return fail(400, 'Add where they are flying from first.')

  try {
    return NextResponse.json({ estimate: await webTravelEstimate(b, day) })
  } catch (e) {
    console.error('Travel estimate failed', e)
    return fail(502, "Couldn't get an estimate from the web right now. Try again, or type your own figure.")
  }
}
