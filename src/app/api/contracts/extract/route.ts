import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { parseJson } from '@/lib/api-guard'
import { contractExtractBody } from '@/lib/api-schemas'
import { createAdminClient } from '@/lib/supabase/admin'
import { docxText } from '@/lib/offer-paste-server'
import { CONTRACTS_BUCKET, MAX_CONTRACT_BYTES, MAX_CONTRACT_READ_BYTES, MAX_CONTRACT_TEXT_CHARS, contractReadingConfigured, isContractPathFor, readContract, requireContractAccess } from '@/lib/contracts-server'

// Reading a long contract can take a while.
export const maxDuration = 60

// Step 2 of adding a contract from a file: the file is already in storage (see upload-url), or the words were pasted. Read it and send
// back what it says. Nothing is saved to the database here: the browser opens the contract form with the answers filled in and the
// sentence each one came from. If it cannot be read the answer is `reading: null`, and the person fills the form in by hand with
// the file still attached.
export async function POST(req: NextRequest) {
  const body = await parseJson(req, contractExtractBody, 400_000)
  if (body.error) return body.error
  const { clientId, path } = body.data
  const gate = await requireContractAccess(clientId, true, 'ai')
  if (gate.error) return gate.error
  if (path && !isContractPathFor(clientId, path)) return NextResponse.json({ error: 'Bad file path' }, { status: 400 })
  if (path?.endsWith('.rtf')) return NextResponse.json({ reading: null, readError: 'That kind of file cannot be read automatically. Fill in the details by hand. The file is still attached.' })

  const kept = path ? ' The file is still attached.' : ''
  const unreadable = (reason: string) => NextResponse.json({ reading: null, readError: `${reason}${kept}` })
  if (!contractReadingConfigured()) return unreadable("Automatic reading isn't switched on yet. Fill in the details by hand.")

  let text = (body.data.text ?? '').trim()
  let pdfBase64: string | undefined
  if (path) {
    const { data: file, error } = await createAdminClient().storage.from(CONTRACTS_BUCKET).download(path)
    if (error || !file) return NextResponse.json({ error: 'Could not find the uploaded file' }, { status: 404 })
    if (file.size > MAX_CONTRACT_BYTES) return NextResponse.json({ error: 'That file is too large (20MB at most)' }, { status: 413 })
    if (file.size > MAX_CONTRACT_READ_BYTES) return unreadable('That file is too large to read automatically (10MB at most). Fill in the details by hand.')
    const bytes = new Uint8Array(await file.arrayBuffer())
    try {
      if (path.endsWith('.pdf')) pdfBase64 = Buffer.from(bytes).toString('base64')
      else text = [docxText(bytes), text].filter(Boolean).join('\n\n')
    } catch {
      return unreadable("Couldn't open that file to read it. Fill in the details by hand.")
    }
  }
  if (!text && !pdfBase64) return NextResponse.json({ error: 'Nothing to read' }, { status: 400 })
  if (text.length > MAX_CONTRACT_TEXT_CHARS) return unreadable('That is a lot of text. Fill in the details by hand, or paste just the main terms.')

  try {
    return NextResponse.json({ reading: await readContract({ text: text || undefined, pdfBase64 }) })
  } catch (e) {
    // What went wrong, not what was read: an error from the reader can echo a few words of the contract.
    console.error('Contract reading failed', e instanceof Anthropic.APIError ? `${e.name} ${e.status}` : e instanceof Error ? e.name : 'unknown')
    return unreadable(e instanceof Anthropic.AuthenticationError
      ? 'The reading key was rejected. Check it in your settings. Fill in the details by hand for now.'
      : "Couldn't read this contract automatically. Fill in the details by hand.")
  }
}
