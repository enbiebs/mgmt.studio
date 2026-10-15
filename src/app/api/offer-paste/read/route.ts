import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { requireTourEditAccess } from '@/lib/tour-access'
import {
  readOffer, docxText, offerFileKind, offerReadingConfigured, MAX_OFFER_FILE_BYTES, MAX_OFFER_TEXT_CHARS,
} from '@/lib/offer-paste-server'

// Reading an offer takes a few seconds, longer for a PDF.
export const maxDuration = 60

// Reads a pasted offer (text, a PDF or a Word file, or a mix) and sends back what it says.
// Nothing is saved here - the browser opens the offer form with the answers filled in.
export async function POST(req: NextRequest) {
  const form = await req.formData()
  const gate = await requireTourEditAccess(form.get('clientId'), 'ai')
  if (gate.error) return gate.error
  if (!offerReadingConfigured()) return NextResponse.json({ error: "Automatic reading isn't switched on yet." }, { status: 503 })

  let text = typeof form.get('text') === 'string' ? (form.get('text') as string).trim() : ''
  let pdfBase64: string | undefined
  const file = form.get('file')
  if (file instanceof File && file.size > 0) {
    const kind = offerFileKind(file.name)
    if (!kind) return NextResponse.json({ error: 'Please attach a PDF or a Word (.docx) file, or paste the text.' }, { status: 400 })
    if (file.size > MAX_OFFER_FILE_BYTES) return NextResponse.json({ error: 'That file is too large (3.5MB max). Paste the text instead.' }, { status: 413 })
    const bytes = new Uint8Array(await file.arrayBuffer())
    try {
      if (kind === 'pdf') pdfBase64 = Buffer.from(bytes).toString('base64')
      else text = [docxText(bytes), text].filter(Boolean).join('\n\n')
    } catch {
      return NextResponse.json({ error: "Couldn't open that file. Try pasting the text instead." }, { status: 422 })
    }
  }
  if (!text && !pdfBase64) return NextResponse.json({ error: 'Paste the offer text or attach a file first.' }, { status: 400 })
  if (text.length > MAX_OFFER_TEXT_CHARS) return NextResponse.json({ error: 'That is a lot of text - paste just the offer itself.' }, { status: 413 })

  try {
    return NextResponse.json({ reading: await readOffer({ text: text || undefined, pdfBase64 }) })
  } catch (e) {
    console.error('Offer reading failed', e)
    const message = e instanceof Anthropic.AuthenticationError
      ? 'The reading key was rejected - check it in your settings.'
      : "Couldn't read this offer. Try again, or add it by hand."
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
