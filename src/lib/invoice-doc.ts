// ──────────────────────────────────────────────────────────
//  An invoice as a document to send (a PDF, and the email that goes with it), and a reminder for one that is late. Pure logic (no store,
//  no screen), covered by scripts/check-invoice-doc.ts. Nothing is sent from here: the email opens in the person's own mail program.
// ──────────────────────────────────────────────────────────

import type { Invoice } from '@/types'
import { fmtMoney, invoiceTotal, r2 } from '@/lib/money'
import { looksLikeEmail, MAILTO_LIMIT, plainLine } from '@/lib/email-address'
import { dateWord } from '@/lib/contract-dates'
import { daysUntil } from '@/lib/date-state'

export interface InvoiceLine { description: string; quantity: number; rate: number; amount: number }
export interface InvoiceDoc {
  number: string
  from: string                 // the company issuing it ("Noted Management"), or the artist when the company has no name
  artist: string
  billedTo: string
  billedToEmail?: string
  issued: string
  due: string
  currency: string
  lines: InvoiceLine[]
  total: number
  outstanding: number          // what is still owed (after deposits); the total when nothing has been paid
  paid: boolean                // marked paid: the PDF says so, so nobody pays it twice
  paidOn?: string
  notes?: string
}

const clean = (s?: string) => (s ?? '').trim()

export function buildInvoiceDoc(inv: Invoice, o: { company: string; artist: string; outstanding?: number }): InvoiceDoc {
  const total = invoiceTotal(inv)
  return {
    number: inv.number, from: clean(o.company) || o.artist, artist: o.artist, billedTo: inv.to, ...(clean(inv.toEmail) ? { billedToEmail: clean(inv.toEmail) } : {}),
    issued: inv.issuedDate.slice(0, 10), due: inv.dueDate.slice(0, 10), currency: inv.currency,
    lines: inv.items.map(i => ({ description: i.description, quantity: i.quantity, rate: i.rate, amount: r2(i.quantity * i.rate) })),
    total, outstanding: o.outstanding === undefined ? total : r2(o.outstanding), paid: inv.status === 'paid', ...(inv.status === 'paid' && inv.paidDate ? { paidOn: inv.paidDate.slice(0, 10) } : {}),
    ...(clean(inv.notes) ? { notes: clean(inv.notes) } : {}),
  }
}

export function invoiceFileName(d: InvoiceDoc): string {
  const part = (s: string) => s.replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
  return `${['Invoice', part(d.number), part(d.billedTo)].filter(Boolean).join(' - ')}.pdf`
}

export type InvoiceEmailKind = 'send' | 'reminder'

/** The words of the email: who to, the subject and the body. `null` when the invoice has no usable address. */
export function invoiceMessage(d: InvoiceDoc, kind: InvoiceEmailKind, today: string): { to: string; subject: string; body: string } | null {
  const to = clean(d.billedToEmail).toLowerCase()
  if (!looksLikeEmail(to)) return null
  const late = daysUntil(d.due, today) * -1
  const number = plainLine(d.number, 60), from = plainLine(d.from, 80)        // typed by people: kept to one plain line
  const subject = kind === 'send' ? `Invoice ${number} from ${from}` : `Reminder: invoice ${number} was due ${dateWord(d.due)}`
  const how = late > 0 ? ` (${late} day${late === 1 ? '' : 's'} ago)` : ''
  const body = kind === 'send'
    ? `Hi,\n\nPlease find invoice ${number} attached: ${fmtMoney(d.total, d.currency)}, due ${dateWord(d.due)}.\n\nThank you!`
    : `Hi,\n\nA friendly reminder that invoice ${number} (${fmtMoney(d.outstanding, d.currency)} still to pay) ${late > 0 ? `was due on ${dateWord(d.due)}${how}` : `is due on ${dateWord(d.due)}`}. Could you let us know when we can expect payment? The invoice is attached again in case it helps.\n\nThank you!`
  return { to, subject, body }
}

/** A link that opens the person's own email program with the message written. `null` when the invoice has no usable address to write to. */
export function invoiceMailto(d: InvoiceDoc, kind: InvoiceEmailKind, today: string): string | null {
  const m = invoiceMessage(d, kind, today)
  if (!m) return null
  const link = `mailto:${m.to}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}`
  // Too long for a link: keep the subject only (cut on whole characters, never through the middle of one).
  return link.length <= MAILTO_LIMIT ? link : `mailto:${m.to}?subject=${encodeURIComponent(Array.from(m.subject).slice(0, 120).join(''))}`
}
