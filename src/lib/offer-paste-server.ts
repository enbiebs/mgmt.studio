// Server-only half of "paste an offer": getting text out of a Word file, and reading an offer
// (pasted text, a PDF, or both) with Claude. Never import this from a 'use client' component -
// it holds the Anthropic key.
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { unzipSync, strFromU8 } from 'fflate'
import { billReadingConfigured } from '@/lib/bills'
import { toDateStr } from '@/lib/utils'
import type { OfferReading } from '@/lib/offer-paste'

export const MAX_OFFER_FILE_BYTES = 3.5 * 1024 * 1024   // a request body is capped at about 4.5MB
export const MAX_OFFER_TEXT_CHARS = 40_000
const MAX_DOCX_XML_BYTES = 25 * 1024 * 1024   // the text of a long contract is far under this
export const offerReadingConfigured = billReadingConfigured

export type OfferFileKind = 'pdf' | 'docx'
export function offerFileKind(name: string): OfferFileKind | null {
  const ext = name.split('.').pop()?.toLowerCase()
  return ext === 'pdf' ? 'pdf' : ext === 'docx' ? 'docx' : null
}

// A Word file is a zip; its words are in word/document.xml.
export function docxText(buf: Uint8Array): string {
  // The size a zip file SAYS it will unpack to is checked before anything is unpacked: a tiny file can claim gigabytes.
  const files = unzipSync(buf, { filter: f => f.name === 'word/document.xml' && f.originalSize <= MAX_DOCX_XML_BYTES })
  const doc = files['word/document.xml']
  if (!doc) throw new Error('That does not look like a Word file')
  return strFromU8(doc)
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:tc>/g, ' | ')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Deliberately plain (no nullable fields), like the settlement reader: "not written" is "" for
// text and 0 for numbers (-1 for the merch split), and offer-paste.ts turns that back into
// "missing".
const readingSchema = z.object({
  venue: z.string(), city: z.string(), country: z.string(),
  date: z.string(),
  promoter: z.string(),
  currency: z.enum(['USD', 'GBP', 'EUR', 'AUD', 'CAD', 'JPY', 'other', 'not stated']),
  guarantee: z.number(), doorSplitPct: z.number(), buyout: z.number(),
  agencyName: z.string(),
  summary: z.string(),
  capacity: z.number(),
  ageLimit: z.enum(['All ages', '18+', '21+', '']),
  venueType: z.string(),
  billing: z.enum(['Headline', 'Direct support', 'Support', 'Festival set', '']),
  doors: z.string(), setStart: z.string(), setLengthMin: z.number(),
  bonuses: z.array(z.object({ atTickets: z.number(), amount: z.number() })),
  groundTransport: z.number(), hotel: z.number(), airfare: z.number(),
  merchArtistPct: z.number(),
  merchSoldBy: z.enum(['artist', 'venue', '']),
  production: z.string(), hospitality: z.string(),
  payments: z.array(z.object({ when: z.string(), pct: z.number() })),
  radiusMiles: z.number(), radiusDaysAfter: z.number(),
  routingNotes: z.string(), alternativeDates: z.string(), respondBy: z.string(),
  checkThese: z.array(z.string()),
})

const SYSTEM = `You read a touring offer (an email, a message or a document a promoter or agent sent about one show) for a music manager and fill in the fields of their offer form. Fill in ONLY what is written. Never guess or invent a value: leave it "" (text) or 0 (numbers; -1 for merchArtistPct) when it is not stated.

Fields:
- venue (for a festival with no separate venue, the festival's name), city (with state or country as written, e.g. "Jacksonville, FL"), country (e.g. "US"; "" if not clear).
- date: the show date as YYYY-MM-DD. If the year is not written, use the next upcoming occurrence after today's date (given below) and add a line to checkThese saying you assumed the year. If several dates are offered, use the main one and put the others in alternativeDates.
- promoter: the buyer or promoter company (not the artist, and not the agent who is passing the offer on).
- currency: from the symbol or word next to the money. "not stated" if the money has no currency marker and you cannot tell.
- guarantee: the flat or base fee for the show as a plain number, WITHOUT bonuses. If the deal is only a percentage of the door, use 0. doorSplitPct: the artist's share of the door/ticket sales if there is a percentage deal (e.g. 85), else 0. buyout: a hospitality, production or meal buyout amount, else 0.
- agencyName: only if a booking agency representing the artist is named in the offer, else "".
- summary: one short sentence of useful context that fits no other field (who it came from, what answer is wanted). No money figures. "" if none.
- capacity, ageLimit (All ages / 18+ / 21+), venueType (e.g. "Converted warehouse"), billing (Headline / Direct support / Support / Festival set).
- doors, setStart: 24-hour "HH:MM" (9 PM -> "21:00", 12:30 AM -> "00:30"). setLengthMin: minutes.
- bonuses: each ticket-count bonus as { atTickets, amount }. For "bonus if it sells out" use the capacity as atTickets.
- groundTransport, hotel, airfare: money the promoter contributes toward that cost, as a number.
- merchArtistPct: the artist's percentage of merch sales (a "80/20 in your favor" split is 80); merchSoldBy: who runs the merch table ("artist" if the artist sells, "venue" if the venue does).
- production, hospitality: the terms in a short phrase as written.
- payments: the payment schedule as { when, pct } in order, e.g. { when: "Before announce", pct: 25 }. Percentages as numbers.
- radiusMiles and radiusDaysAfter: a radius clause (no other shows within N miles, until N days after the show).
- routingNotes: a short summary (under 300 characters) of anything about travel, routing or neighbouring dates that affects the decision. alternativeDates: other dates mentioned.
- respondBy: the date an answer is wanted by (YYYY-MM-DD), only if a date is actually written.
- checkThese: up to 6 short plain-English things the manager should double-check, such as figures that are ambiguous, text that doesn't fit any field (say what it is), or things that conflict. Do not repeat things already visible in the fields.

Do not add figures that the sender calculated (such as a "ceiling" or a "net after travel"); those are commentary, not terms.`

function anthropic() {
  // A personal ("sk-ant-usr-") key isn't tied to a workspace, so Anthropic needs the workspace named.
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID
  return new Anthropic({ defaultHeaders: workspaceId ? { 'anthropic-workspace-id': workspaceId } : undefined })
}

export async function readOffer(input: { text?: string; pdfBase64?: string }): Promise<OfferReading> {
  const parts: Anthropic.ContentBlockParam[] = []
  if (input.pdfBase64) {
    parts.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.pdfBase64 } })
  }
  parts.push({
    type: 'text',
    text: `Today's date is ${toDateStr(new Date())}.\n\nRead this offer.${input.text ? `\n\n${input.text.slice(0, MAX_OFFER_TEXT_CHARS)}` : ''}`,
  })
  const response = await anthropic().messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 8000,
    system: SYSTEM,
    output_config: { effort: 'low', format: zodOutputFormat(readingSchema) },
    messages: [{ role: 'user', content: parts }],
  })
  if (response.stop_reason === 'refusal') throw new Error('The AI declined to read this offer')
  if (!response.parsed_output) throw new Error('The AI response could not be read')
  return response.parsed_output
}
