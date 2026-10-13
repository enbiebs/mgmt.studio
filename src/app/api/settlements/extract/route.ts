import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  SETTLEMENTS_BUCKET, MAX_SETTLEMENT_BYTES, requireSettlementAccess, isSettlementPathFor,
  settlementReadingConfigured, settlementMediaType, extractSettlement, toSettlementDraft,
} from '@/lib/settlements'

// Reading a multi-page statement can take a while.
export const maxDuration = 60

// Step 2 of adding a settlement: the file is already in storage (see upload-url); read it
// and send back what it says. Nothing is saved to the database here - the browser shows a
// confirmation screen first. If it can't be read the response has `draft: null`, so the
// form falls back to manual entry with the file still attached.
export async function POST(req: NextRequest) {
  const { clientId, path } = await req.json()
  const gate = await requireSettlementAccess(clientId, true)
  if (gate.error) return gate.error
  if (!isSettlementPathFor(clientId, path)) return NextResponse.json({ error: 'Bad file path' }, { status: 400 })

  const { data: file, error: downloadErr } = await createAdminClient().storage.from(SETTLEMENTS_BUCKET).download(path)
  if (downloadErr || !file) return NextResponse.json({ error: 'Could not find the uploaded file' }, { status: 404 })
  if (file.size > MAX_SETTLEMENT_BYTES) return NextResponse.json({ error: 'That file is too large (20MB max)' }, { status: 413 })

  const unreadable = (reason: string) => NextResponse.json({ filePath: path, draft: null, readError: reason })
  if (!settlementReadingConfigured()) {
    return unreadable("Automatic reading isn't switched on yet - fill in the settlement by hand. The file is still attached.")
  }

  try {
    const extracted = await extractSettlement(Buffer.from(await file.arrayBuffer()).toString('base64'), settlementMediaType(path))
    return NextResponse.json({ filePath: path, draft: toSettlementDraft(extracted) })
  } catch (e) {
    console.error('Settlement extraction failed', e)
    const reason = e instanceof Anthropic.AuthenticationError
      ? 'The reading key was rejected - check it in your settings. Fill in the settlement by hand for now.'
      : "Couldn't read this settlement automatically - fill it in by hand. The file is still attached."
    return unreadable(reason)
  }
}
