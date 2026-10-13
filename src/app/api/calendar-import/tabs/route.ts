import { NextRequest, NextResponse } from 'next/server'
import { listTabs, MAX_CALENDAR_BYTES } from '@/lib/calendar-import-server'
import { requireTourEditAccess } from '@/lib/tour-access'

// Step 1 of importing a calendar: open the spreadsheet and say which of its tabs look like a
// day-by-day calendar. Nothing is read by the AI and nothing is saved here.
export async function POST(req: NextRequest) {
  const form = await req.formData()
  const gate = await requireTourEditAccess(form.get('clientId'))
  if (gate.error) return gate.error
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file was sent' }, { status: 400 })
  if (!/\.xlsx$/i.test(file.name)) return NextResponse.json({ error: 'Please use an Excel (.xlsx) file. In Google Sheets: File → Download → Microsoft Excel.' }, { status: 400 })
  if (file.size > MAX_CALENDAR_BYTES) return NextResponse.json({ error: 'That file is too large (4MB max)' }, { status: 413 })
  try {
    return NextResponse.json({ tabs: await listTabs(Buffer.from(await file.arrayBuffer())) })
  } catch (e) {
    console.error('Calendar tabs failed', e)
    return NextResponse.json({ error: "Couldn't open that file. Is it a real Excel (.xlsx) file?" }, { status: 422 })
  }
}
