// Checks the invoice document and the email that goes with it.  Run with:  npx tsx scripts/check-invoice-doc.ts
import assert from 'node:assert/strict'
import { buildInvoiceDoc, invoiceFileName, invoiceMailto } from '../src/lib/invoice-doc'
import { MAILTO_LIMIT } from '../src/lib/email-address'
import type { Invoice } from '../src/types'

let n = 0
const check = (name: string, fn: () => void) => { fn(); n++; console.log('  ok  ' + name) }
const inv = (o: Partial<Invoice> = {}): Invoice => ({ id: 'i1', number: 'INV-2026-007', to: 'Sound LA', toEmail: 'Billing@SoundLA.com', category: 'touring', status: 'sent', issuedDate: '2026-09-01', dueDate: '2026-10-01', currency: 'USD', items: [{ description: 'Show fee, Fabric', quantity: 1, rate: 12000 }, { description: 'Travel', quantity: 3, rate: 150.5 }], notes: 'Pay by wire.', ...o } as Invoice)
const TODAY = '2026-10-26'
const decode = (link: string) => ({ to: link.slice(7, link.indexOf('?')), subject: decodeURIComponent(link.split('subject=')[1].split('&body=')[0]), body: decodeURIComponent(link.split('&body=')[1]) })

check('the document: who from, who to, the lines to the cent, the total', () => {
  const d = buildInvoiceDoc(inv(), { company: ' Noted Management ', artist: 'Mascolo' })
  assert.equal(d.from, 'Noted Management'); assert.equal(d.artist, 'Mascolo'); assert.equal(d.billedTo, 'Sound LA'); assert.equal(d.billedToEmail, 'Billing@SoundLA.com')
  assert.deepEqual(d.lines, [{ description: 'Show fee, Fabric', quantity: 1, rate: 12000, amount: 12000 }, { description: 'Travel', quantity: 3, rate: 150.5, amount: 451.5 }])
  assert.equal(d.total, 12451.5); assert.equal(d.outstanding, 12451.5, 'nothing paid: all of it is still to pay'); assert.equal(d.notes, 'Pay by wire.')
  assert.equal(d.issued, '2026-09-01'); assert.equal(d.due, '2026-10-01')
})
check('a company with no name falls back to the artist; blank notes and email are left off', () => {
  const d = buildInvoiceDoc(inv({ toEmail: '  ', notes: ' ' }), { company: '', artist: 'Mascolo' })
  assert.equal(d.from, 'Mascolo'); assert.ok(!('billedToEmail' in d)); assert.ok(!('notes' in d))
})
check('a part-paid invoice says what is still owed', () => {
  assert.equal(buildInvoiceDoc(inv(), { company: 'C', artist: 'A', outstanding: 9000.456 }).outstanding, 9000.46)
})
check('the file name is safe on every computer', () => {
  assert.equal(invoiceFileName(buildInvoiceDoc(inv({ number: 'INV/7', to: 'Club: "X"' }), { company: 'C', artist: 'A' })), 'Invoice - INV 7 - Club X.pdf')
})
check('the email that sends the invoice: right address (lower case), subject, amount, due date', () => {
  const m = decode(invoiceMailto(buildInvoiceDoc(inv(), { company: 'Noted Management', artist: 'Mascolo' }), 'send', TODAY)!)
  assert.equal(m.to, 'billing@soundla.com'); assert.equal(m.subject, 'Invoice INV-2026-007 from Noted Management')
  assert.match(m.body, /\$12,451\.50, due Oct 1, 2026/); assert.match(m.body, /attached/)
})
check('the reminder says how late it is and what is still to pay', () => {
  const d = buildInvoiceDoc(inv(), { company: 'Noted Management', artist: 'Mascolo', outstanding: 9000 })
  const m = decode(invoiceMailto(d, 'reminder', TODAY)!)
  assert.equal(m.subject, 'Reminder: invoice INV-2026-007 was due Oct 1, 2026')
  assert.match(m.body, /\$9,000 still to pay/); assert.match(m.body, /was due on Oct 1, 2026 \(25 days ago\)/)
  assert.match(decode(invoiceMailto(d, 'reminder', '2026-10-02')!).body, /\(1 day ago\)/)
  assert.match(decode(invoiceMailto(d, 'reminder', '2026-09-20')!).body, /is due on Oct 1, 2026/, 'an invoice not yet due is "is due", not late')
})
check('no usable address means no email link', () => {
  for (const email of [undefined, '', 'nonsense', 'a@b.com?bcc=x@y.com', 'a@b.com&cc=x']) assert.equal(invoiceMailto(buildInvoiceDoc(inv({ toEmail: email }), { company: 'C', artist: 'A' }), 'send', TODAY), null, String(email))
})
check('a very long name never makes a link too long to open', () => {
  const link = invoiceMailto(buildInvoiceDoc(inv({ number: 'N'.repeat(2000) }), { company: 'C', artist: 'A' }), 'send', TODAY)!
  assert.ok(link.length <= MAILTO_LIMIT)
})
check('somebody else\'s words cannot add instructions to the link', () => {
  const link = invoiceMailto(buildInvoiceDoc(inv({ number: 'X&bcc=evil@x.com#' }), { company: 'C?cc=a@b.com', artist: 'A' }), 'send', TODAY)!
  assert.equal(link.split('?').length, 2); assert.equal(link.split('&bcc=').length, 1); assert.equal(link.split('&cc=').length, 1)
})
check('a paid invoice says so, with the date, so nobody pays it twice', () => {
  const d = buildInvoiceDoc(inv({ status: 'paid', paidDate: '2026-10-03' }), { company: 'C', artist: 'A' })
  assert.equal(d.paid, true); assert.equal(d.paidOn, '2026-10-03')
  assert.equal(buildInvoiceDoc(inv(), { company: 'C', artist: 'A' }).paid, false)
})
check('a long subject is cut on whole characters (an emoji is never split)', () => {
  const link = invoiceMailto(buildInvoiceDoc(inv({ number: 'N'.repeat(40) + '😀'.repeat(60) }), { company: '😀'.repeat(200), artist: 'A' }), 'send', TODAY)
  assert.ok(link === null || (link.length <= MAILTO_LIMIT && !link.includes('%ED')))
  decodeURIComponent(link!.split('subject=')[1].split('&')[0])           // does not throw
})
check('a line break in a name cannot reach the subject', () => {
  const m = decode(invoiceMailto(buildInvoiceDoc(inv({ number: 'A\r\nBcc: x@y.com' }), { company: 'C\nD', artist: 'A' }), 'send', TODAY)!)
  assert.ok(!/[\r\n]/.test(m.subject))
})
console.log(`${n} checks passed`)
