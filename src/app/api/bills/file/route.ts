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

// Removes a PDF when a half-finished upload is cancelled, or a bill is deleted with no copy kept, so no orphaned files pile up.
// A file that a live bill or a copy in the trash still points at is never removed.
export async function DELETE(req: NextRequest) {
  const body = await parseJson(req, clientAndPath)
  if (body.error) return body.error
  const { clientId, path } = body.data
  const gate = await requireBillAccess(clientId, true, 'file')
  if (gate.error) return gate.error
  if (!isBillPathFor(clientId, path)) return NextResponse.json({ error: 'Bad file path' }, { status: 400 })

  const admin = createAdminClient()
  // A file that a live bill uses, or that a copy in the trash is keeping, is never removed here (the trash removes its own, when the copy goes).
  const [inUse, inTrash] = await Promise.all([
    admin.from('expenses').select('id').eq('bill_file_path', path).limit(1),
    admin.from('trash_items').select('id').contains('files', [path]).limit(1),
  ])
  // (If the trash is not set up in the database yet, no copy can be keeping a file.)
  const noTrashYet = inTrash.error?.code === '42P01' || inTrash.error?.code === 'PGRST205'
  if (inUse.error || (inTrash.error && !noTrashYet)) return NextResponse.json({ error: 'Could not check whether the file is still in use' }, { status: 500 })
  if ((inUse.data?.length ?? 0) > 0 || (inTrash.data?.length ?? 0) > 0) return NextResponse.json({ ok: true, kept: true })

  await admin.storage.from(BILLS_BUCKET).remove([path])
  return NextResponse.json({ ok: true })
}
