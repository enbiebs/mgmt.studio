import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isClientId, parseJson } from '@/lib/api-guard'
import { clientAndPath } from '@/lib/api-schemas'
import { CONTRACTS_BUCKET, filesInclude, isContractPathFor, requireContractAccess, requireContractViewer } from '@/lib/contracts-server'

// Opens a stored copy of a contract. Three checks, in order: the person is on the management side; the file belongs to this artist; and
// the contract it is attached to is one THEY can see (the lookup runs as them, under the same row-level rules as the contract itself, so
// a contract hidden from a person hides its files too, and one shared with them alone opens its files). Then it forwards to a short-lived link.
export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  const contractId = req.nextUrl.searchParams.get('contractId')
  const path = req.nextUrl.searchParams.get('path')
  if (!isClientId(clientId) || !isClientId(contractId)) return NextResponse.json({ error: 'Missing or invalid id' }, { status: 400 })
  const gate = await requireContractViewer(clientId, 'file')
  if (gate.error) return gate.error
  if (!isContractPathFor(clientId, path)) return NextResponse.json({ error: 'Bad file path' }, { status: 400 })

  const { data: row, error: lookupError } = await gate.supabase.from('contracts').select('id, files').eq('id', contractId).eq('client_id', clientId).maybeSingle()
  if (lookupError) { console.error('Contract file lookup failed', lookupError.code); return NextResponse.json({ error: 'Could not check that file' }, { status: 500 }) }
  if (!row || !filesInclude(row.files, path)) return NextResponse.json({ error: 'File not found' }, { status: 404 })

  const { data, error } = await createAdminClient().storage.from(CONTRACTS_BUCKET).createSignedUrl(path, 60)
  if (error || !data) return NextResponse.json({ error: 'File not found' }, { status: 404 })
  return NextResponse.redirect(data.signedUrl)
}

// Removes a file nobody keeps any more: a half-finished upload that was cancelled, or the files of a contract that was deleted.
// A file that a contract still lists is never removed.
export async function DELETE(req: NextRequest) {
  const body = await parseJson(req, clientAndPath)
  if (body.error) return body.error
  const { clientId, path } = body.data
  const gate = await requireContractAccess(clientId, true, 'file')
  if (gate.error) return gate.error
  if (!isContractPathFor(clientId, path)) return NextResponse.json({ error: 'Bad file path' }, { status: 400 })

  const admin = createAdminClient()
  // Every file of this artist lives under their folder, so only this artist's contracts can be using it.
  const { data: rows, error } = await admin.from('contracts').select('files').eq('client_id', clientId)
  if (error) { console.error('Contract file in-use check failed', error.code); return NextResponse.json({ error: 'Could not check whether the file is still in use' }, { status: 500 }) }
  if ((rows ?? []).some(r => filesInclude(r.files, path))) return NextResponse.json({ ok: true, kept: true })

  await admin.storage.from(CONTRACTS_BUCKET).remove([path])
  return NextResponse.json({ ok: true })
}
