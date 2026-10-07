import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { BILLS_BUCKET, requireBillAccess, isBillPathFor } from '@/lib/bills'

// Opens an attached bill PDF: checks the caller may see this client's
// finances, then redirects to a short-lived signed link (the bucket itself
// is private).
export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  const path = req.nextUrl.searchParams.get('path')
  const gate = await requireBillAccess(clientId, false)
  if (gate.error) return gate.error
  if (!isBillPathFor(clientId!, path)) return NextResponse.json({ error: 'Bad file path' }, { status: 400 })

  const { data, error } = await createAdminClient().storage.from(BILLS_BUCKET).createSignedUrl(path, 60)
  if (error || !data) return NextResponse.json({ error: 'File not found' }, { status: 404 })
  return NextResponse.redirect(data.signedUrl)
}

// Removes the PDF when its expense is deleted (or a half-finished upload is
// cancelled), so no orphaned files pile up.
export async function DELETE(req: NextRequest) {
  const { clientId, path } = await req.json()
  const gate = await requireBillAccess(clientId, true)
  if (gate.error) return gate.error
  if (!isBillPathFor(clientId, path)) return NextResponse.json({ error: 'Bad file path' }, { status: 400 })

  await createAdminClient().storage.from(BILLS_BUCKET).remove([path])
  return NextResponse.json({ ok: true })
}
