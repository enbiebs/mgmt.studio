import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isClientId, parseJson } from '@/lib/api-guard'
import { clientAndPath } from '@/lib/api-schemas'
import { BILLS_BUCKET, requireBillAccess, isBillPathFor } from '@/lib/bills'

// Opens an attached bill PDF: checks the caller may see this client's
// finances, then redirects to a short-lived signed link (the bucket itself
// is private).
export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  const path = req.nextUrl.searchParams.get('path')
  if (!isClientId(clientId)) return NextResponse.json({ error: 'Missing or invalid clientId' }, { status: 400 })
  const gate = await requireBillAccess(clientId, false, 'file')
  if (gate.error) return gate.error
  if (!isBillPathFor(clientId, path)) return NextResponse.json({ error: 'Bad file path' }, { status: 400 })

  const { data, error } = await createAdminClient().storage.from(BILLS_BUCKET).createSignedUrl(path, 60)
  if (error || !data) return NextResponse.json({ error: 'File not found' }, { status: 404 })
  return NextResponse.redirect(data.signedUrl)
}

// Removes the PDF when its expense is deleted (or a half-finished upload is
// cancelled), so no orphaned files pile up.
export async function DELETE(req: NextRequest) {
  const body = await parseJson(req, clientAndPath)
  if (body.error) return body.error
  const { clientId, path } = body.data
  const gate = await requireBillAccess(clientId, true, 'file')
  if (gate.error) return gate.error
  if (!isBillPathFor(clientId, path)) return NextResponse.json({ error: 'Bad file path' }, { status: 400 })

  await createAdminClient().storage.from(BILLS_BUCKET).remove([path])
  return NextResponse.json({ ok: true })
}
