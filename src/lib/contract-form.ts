// ──────────────────────────────────────────────────────────
//  The contract form: what a person types, checked and turned into a saved contract (and back). Numbers come from text boxes, so
//  "" means "not filled in"; only what makes sense is kept (a renewal length means nothing on a contract that does not renew; a
//  box of key terms from another kind of contract is dropped). Pure logic (no store, no screen), covered by scripts/check-contract-form.ts.
// ──────────────────────────────────────────────────────────

import type { Contract, ContractFile, ContractStatus, ContractType, Currency } from '@/types'
import { cleanTerms } from '@/lib/contract-terms'
import { MAX_REMINDER_ADDRESSES, parseAddresses } from '@/lib/contract-reminders'

export interface ContractDraft {
  title: string
  counterparty: string
  type: ContractType
  status: ContractStatus
  signedDate: string          // '' when not filled in
  expiryDate: string
  autoRenews: boolean
  renewalMonths: string       // text box
  noticeDays: string          // text box
  value: string               // text box
  currency: Currency
  notes: string
  flagged: boolean
  terms: Record<string, string>
  files: ContractFile[]
  reminders: string           // addresses, as typed (commas or lines between them)
}

export const emptyDraft = (): ContractDraft => ({
  title: '', counterparty: '', type: 'management', status: 'draft', signedDate: '', expiryDate: '',
  autoRenews: false, renewalMonths: '', noticeDays: '', value: '', currency: 'USD', notes: '', flagged: false, terms: {}, files: [], reminders: '',
})

export function contractToDraft(c: Contract): ContractDraft {
  return {
    title: c.title, counterparty: c.counterparty, type: c.type, status: c.status,
    signedDate: c.signedDate?.slice(0, 10) ?? '', expiryDate: c.expiryDate?.slice(0, 10) ?? '',
    autoRenews: !!c.autoRenews, renewalMonths: c.renewalMonths ? String(c.renewalMonths) : '', noticeDays: c.noticeDays !== undefined && c.noticeDays !== null ? String(c.noticeDays) : '',
    value: c.value ? String(c.value) : '', currency: c.currency ?? 'USD', notes: c.notes ?? '', flagged: !!c.flagged,
    terms: { ...(c.terms ?? {}) }, files: [...(c.files ?? [])], reminders: (c.reminderEmails ?? []).join(', '),
  }
}

// A number typed in a box: "" is "not filled in", a comma is only ever a thousands separator ("25,000"; "1,5" is not a number), anything else is NaN.
const num = (s: string): number | null => {
  const t = s.trim()
  if (t === '') return null
  if (t.includes(',') && !/^\d{1,3}(,\d{3})*(\.\d+)?$/.test(t)) return NaN
  const n = Number(t.replace(/,/g, ''))
  return Number.isFinite(n) ? n : NaN
}

/** What is wrong with the form: a sentence for the person, and the box it is about (null when it can be saved). */
export function contractProblemFor(d: ContractDraft): { field: keyof ContractDraft; message: string } | null {
  if (!d.title.trim()) return { field: 'title', message: 'Give the contract a name.' }
  if (!d.counterparty.trim()) return { field: 'counterparty', message: 'Say who the contract is with.' }
  if (d.signedDate && d.expiryDate && d.expiryDate < d.signedDate) return { field: 'expiryDate', message: 'The end date is before the signed date.' }
  const notice = num(d.noticeDays)
  if (notice !== null && (!Number.isInteger(notice) || notice < 0 || notice > 1000)) return { field: 'noticeDays', message: 'Days of notice must be a whole number from 0 to 1,000.' }
  const months = num(d.renewalMonths)
  if (d.autoRenews && months !== null && (!Number.isInteger(months) || months < 1 || months > 120)) return { field: 'renewalMonths', message: 'Each renewal must be 1 to 120 months.' }
  const value = num(d.value)
  if (value !== null && Number.isNaN(value)) return { field: 'value', message: 'The value must be a number, like 25,000.' }
  if (value !== null && value < 0) return { field: 'value', message: 'The value cannot be negative.' }
  if (d.autoRenews && !d.expiryDate) return { field: 'expiryDate', message: 'A contract that renews by itself needs the end date of its first term.' }
  const { emails, bad } = parseAddresses(d.reminders)
  if (bad.length > 0) return { field: 'reminders', message: `${bad[0]} is not an email address.` }
  if (emails.length > MAX_REMINDER_ADDRESSES) return { field: 'reminders', message: `Up to ${MAX_REMINDER_ADDRESSES} addresses.` }
  return null
}

/** The same check, as just the sentence. */
export const contractProblem = (d: ContractDraft): string | null => contractProblemFor(d)?.message ?? null

/** The contract's fields to save from the form (call contractProblem first). */
export function draftToFields(d: ContractDraft): Omit<Contract, 'id' | 'createdAt'> {
  const notice = num(d.noticeDays)
  const months = num(d.renewalMonths)
  const value = num(d.value)
  const terms = cleanTerms(d.type, d.terms)
  const { emails } = parseAddresses(d.reminders)
  return {
    title: d.title.trim(), counterparty: d.counterparty.trim(), type: d.type, status: d.status,
    ...(d.signedDate ? { signedDate: d.signedDate } : {}),
    ...(d.expiryDate ? { expiryDate: d.expiryDate } : {}),
    ...(value ? { value, currency: d.currency } : {}),
    ...(d.notes.trim() ? { notes: d.notes.trim() } : {}),
    ...(d.flagged ? { flagged: true } : {}),
    ...(d.autoRenews ? { autoRenews: true } : {}),
    ...(d.autoRenews && months ? { renewalMonths: months } : {}),
    ...(notice !== null ? { noticeDays: notice } : {}),
    ...(Object.keys(terms).length > 0 ? { terms } : {}),
    ...(d.files.length > 0 ? { files: d.files } : {}),
    ...(emails.length > 0 ? { reminderEmails: emails } : {}),
  }
}

/** The contract to save from the form, with the id and date it was added. */
export const draftToContract = (d: ContractDraft, base: { id: string; createdAt: string }): Contract => ({ ...base, ...draftToFields(d) })

/** The closest kind of contract for a template's name ("NDA (Confidentiality Agreement)" is an NDA). */
export function typeFromName(name: string): ContractType {
  const n = name.toLowerCase()
  if (/\bnda\b|non-?disclosure|confidential/.test(n)) return 'nda'
  if (/management/.test(n)) return 'management'
  if (/sync/.test(n)) return 'sync'
  if (/publish/.test(n)) return 'publishing'
  if (/merch/.test(n)) return 'merch'
  if (/brand|endorse|sponsor/.test(n)) return 'brand'
  if (/tour|booking|agency/.test(n)) return 'touring'
  if (/record|label|side artist|featured|producer|split/.test(n)) return 'recording'
  return 'other'
}

// The blanks in a filled-in template that name the other side, most likely first.
const OTHER_SIDE = ['RECIPIENT NAME', 'COUNTERPARTY', 'SIDE ARTIST NAME', 'SIDE ARTIST LEGAL NAME', 'SIDE ARTIST STAGE NAME', 'SIDE ARTIST', 'CONTRIBUTOR NAME', 'COMPANY NAME', 'LABEL NAME']

/** Who a template-made document is with, from the blanks the person filled in (or ''). */
export function counterpartyFromBlanks(values: Record<string, string>): string {
  const byName = new Map(Object.entries(values).map(([k, v]) => [k.trim().toUpperCase(), v.trim()]))
  for (const key of OTHER_SIDE) { const v = byName.get(key); if (v) return v }
  return ''
}
