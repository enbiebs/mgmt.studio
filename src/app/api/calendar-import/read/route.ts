import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { readCalendar, calendarReadingConfigured, MAX_CALENDAR_BYTES } from '@/lib/calendar-import-server'
import { requireTourEditAccess } from '@/lib/tour-access'

// Reading a whole year of rows takes a while.
export const maxDuration = 60

// Step 2: read the chosen tabs and send back what they say, row by row. Nothing is saved here
// either - the browser shows a review screen first and only then creates the shows.
export async function POST(req: NextRequest) {
  const form = await req.formData()
  const gate = await requireTourEditAccess(form.get('clientId'))
  if (gate.error) return gate.error
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file was sent' }, { status: 400 })
  if (file.size > MAX_CALENDAR_BYTES) return NextResponse.json({ error: 'That file is too large (4MB max)' }, { status: 413 })
  if (!calendarReadingConfigured()) return NextResponse.json({ error: "Automatic reading isn't switched on yet." }, { status: 503 })

  let tabs: unknown
  try { tabs = JSON.parse(String(form.get('tabs') ?? '[]')) } catch { tabs = [] }
  if (!Array.isArray(tabs) || tabs.length === 0 || !tabs.every(t => typeof t === 'string')) {
    return NextResponse.json({ error: 'Pick at least one tab' }, { status: 400 })
  }

  try {
    const result = await readCalendar(Buffer.from(await file.arrayBuffer()), tabs as string[], form.get('includePast') === '1')
    return NextResponse.json(result)
  } catch (e) {
    console.error('Calendar reading failed', e)
    const message = e instanceof Anthropic.AuthenticationError
      ? 'The reading key was rejected - check it in your settings.'
      : e instanceof Error && /fewer tabs/.test(e.message) ? e.message
      : "Couldn't read this calendar. Try again, or pick fewer tabs."
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
