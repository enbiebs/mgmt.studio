// ──────────────────────────────────────────────────────────
//  What the AI reader hands back when it reads a contract, turned into the contract form: only values that make sense are used, every
//  filled box keeps the sentence it came from ("where did you read that?"), and anything the reader was not sure of is marked so the
//  person checks it. The reader itself is server-only (lib/contracts-server.ts); this half has no AI in it, so it can be tested and
//  used in the browser. Covered by scripts/check-contract-reading.ts.
// ──────────────────────────────────────────────────────────

import type { ContractType, Currency } from '@/types'
import { cleanTerms, termFieldsFor } from '@/lib/contract-terms'
import { emptyDraft, type ContractDraft } from '@/lib/contract-form'

export const CONTRACT_TYPES: ContractType[] = ['management', 'recording', 'publishing', 'sync', 'brand', 'touring', 'nda', 'merch', 'other']

/** Plain on purpose (no optional fields): "not written" is '' for text, 0 for a count of months, -1 for days of notice, 0 for a value. */
export interface ContractReading {
  title: string
  counterparty: string
  type: string
  status: string                                   // 'signed' only when the document shows it was signed; otherwise 'draft'
  signedDate: string
  expiryDate: string
  autoRenews: boolean
  renewalMonths: number
  noticeDays: number
  value: number
  currency: string
  terms: { key: string; value: string }[]
  quotes: { field: string; quote: string; sure: boolean }[]
  checkThese: string[]
}

export interface ReadNote { quote: string; sure: boolean }
export interface ReadResult {
  draft: ContractDraft
  notes: Record<string, ReadNote>   // by form field: the sentence it came from, and whether the reader was sure
  check: Set<string>                // form fields filled in by the reader that the person should look at
  checkThese: string[]              // things the reader asked to have double-checked, in words
}

const isoDate = (s: unknown): string => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return ''
  const d = new Date(s + 'T00:00:00Z')
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? '' : s
}
const text = (s: unknown, max: number): string => (typeof s === 'string' ? s.trim().slice(0, max) : '')
const CURRENCIES: Currency[] = ['USD', 'GBP', 'EUR']

export function readingToDraft(r: ContractReading): ReadResult {
  const d = emptyDraft()
  const type = (CONTRACT_TYPES as string[]).includes(r.type) ? (r.type as ContractType) : 'other'
  const filled = new Set<string>()
  const set = <K extends keyof ContractDraft>(field: K, value: ContractDraft[K], isFilled: boolean) => { d[field] = value; if (isFilled) filled.add(field as string) }

  set('title', text(r.title, 120), !!text(r.title, 120))
  set('counterparty', text(r.counterparty, 120), !!text(r.counterparty, 120))
  d.type = type; filled.add('type')
  d.status = r.status === 'signed' ? 'signed' : 'draft'; filled.add('status')
  set('signedDate', isoDate(r.signedDate), !!isoDate(r.signedDate))
  set('expiryDate', isoDate(r.expiryDate), !!isoDate(r.expiryDate))
  d.autoRenews = !!r.autoRenews
  if (d.autoRenews) filled.add('autoRenews')
  if (d.autoRenews && Number.isInteger(r.renewalMonths) && r.renewalMonths >= 1 && r.renewalMonths <= 120) { d.renewalMonths = String(r.renewalMonths); filled.add('renewalMonths') }
  if (Number.isInteger(r.noticeDays) && r.noticeDays >= 0 && r.noticeDays <= 1000) { d.noticeDays = String(r.noticeDays); filled.add('noticeDays') }
  if (typeof r.value === 'number' && Number.isFinite(r.value) && r.value > 0) {
    d.value = String(r.value); filled.add('value')
    d.currency = (CURRENCIES as string[]).includes(r.currency) ? (r.currency as Currency) : 'USD'
  }

  // Key terms: only the boxes this kind of contract has.
  const known = new Set(termFieldsFor(type).map(x => x.key))
  const raw: Record<string, string> = {}
  for (const t of r.terms ?? []) if (known.has(t.key) && text(t.value, 500)) raw[t.key] = text(t.value, 500)
  d.terms = cleanTerms(type, raw)
  for (const k of Object.keys(d.terms)) filled.add(`terms.${k}`)

  // Where each answer came from. A quote for a box that stayed empty is dropped.
  const notes: Record<string, ReadNote> = {}
  for (const q of r.quotes ?? []) {
    const field = q.field
    if (!filled.has(field)) continue
    const quote = text(q.quote, 300)
    if (quote && !notes[field]) notes[field] = { quote, sure: !!q.sure }
  }

  // Look at: anything the reader was unsure of, or filled in without being able to point at the sentence (the form's own "type" and "status" are the reader's judgement).
  const check = new Set<string>()
  for (const f of filled) {
    const n = notes[f]
    if (n ? !n.sure : f !== 'type' && f !== 'status') check.add(f)
  }
  if (d.value && !(CURRENCIES as string[]).includes(r.currency)) check.add('value')
  if (d.status === 'signed') check.add('status')   // "signed" is a claim about the document: always worth a look

  return { draft: d, notes, check, checkThese: (r.checkThese ?? []).map(x => text(x, 200)).filter(Boolean).slice(0, 6) }
}
