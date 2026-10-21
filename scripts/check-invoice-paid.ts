// Checks what happens when an invoice is marked paid, using the REAL store: nothing is invented. If deposits had part-paid the invoice,
// the person is told how much of it is not logged yet, with a button that opens the deposit form for it; and if a settlement for the same
// show still shows a balance, they are told that too.  Run with:  npx tsx scripts/check-invoice-paid.ts
import assert from 'node:assert/strict'
import { useStore } from '../src/lib/store'
import { onNotice, type Notice } from '../src/lib/notify'
import type { Client } from '../src/types'

// Linking a bank payment also tries to save to the database, which does not exist here; that expected complaint is not shown.
const realError = console.error
console.error = (...a: unknown[]) => { if (!String(a[0]).includes('@supabase/ssr')) realError(...a) }

const invoice = (o: Record<string, unknown> = {}) => ({ id: 'i1', number: 'INV-1002', to: 'Printworks', category: 'touring', status: 'sent', issuedDate: '2026-09-22', dueDate: '2026-10-14', items: [{ description: 'x', quantity: 1, rate: 22000 }], currency: 'USD', ...o })
const deposit = (o: Record<string, unknown> = {}) => ({ id: 'd1', name: 'Printworks deposit', date: '2026-10-09', amount: 16000, currency: 'USD', mgmt: 0.15, lawyer: 0.05, taxes: 0.2, done: true, invoiceId: 'i1', ...o })
const settlement = (balanceOwed: number, id = 'st1', showId = 's1') => ({ id, showIds: [showId], currency: 'USD', totalDue: balanceOwed, payments: [], confirmedAt: '2026-09-23T12:00:00Z', preparedOn: '2026-09-23', boxOffice: [], expenses: [], payout: [] })

function setup(over: { deposits?: object[]; invoices?: object[]; settlements?: object[]; transactions?: object[]; shows?: object[] } = {}) {
  const client = {
    id: 'c1', name: 'Artist',
    tour: { shows: over.shows ?? [{ id: 's1', date: '2026-09-21', city: 'London', venue: 'Printworks', time: '21:00', status: 'confirmed', invoiceId: 'i1' }] },
    finance: { invoices: over.invoices ?? [invoice()], expenses: [], settlements: over.settlements ?? [] },
    business: { banking: { deposits: over.deposits ?? [deposit()], transactions: over.transactions ?? [] } },
  } as unknown as Client
  useStore.setState({ data: { clients: [client] }, clientId: 'c1', workspaceId: null, depositAddRequest: false, depositAddInvoiceId: null } as never)
  const notices: Notice[] = []
  const off = onNotice(n => notices.push(n))
  return { notices, done: off }
}
const now = () => useStore.getState().data.clients[0]
const deposits = () => now().business.banking.deposits
const status = (id = 'i1') => now().finance.invoices.find(i => i.id === id)!.status

// a part-paid invoice marked paid: nothing is made up, but the person is told what is not logged yet
let w = setup()
useStore.getState().updateInvoiceStatus('i1', 'paid')
assert.equal(status(), 'paid'); assert.equal(deposits().length, 1, 'no deposit is invented')
assert.equal(w.notices.at(-1)?.text, 'Marked INV-1002 as paid. $6,000 of it is not logged as a deposit yet.'); assert.equal(w.notices.at(-1)?.action?.label, 'Log the deposit')
w.notices.at(-1)?.action?.run()
let st = useStore.getState()
assert.equal(st.depositAddRequest, true, 'the button opens the deposit form'); assert.equal(st.depositAddInvoiceId, 'i1', 'for this invoice'); assert.deepEqual([st.section, st.bizSub], ['finance', 'banking'], 'on the Banking screen')
st.clearDepositAddRequest(); assert.deepEqual([useStore.getState().depositAddRequest, useStore.getState().depositAddInvoiceId], [false, null], 'closing the form clears it')
// a second click says the same thing and still invents nothing
useStore.getState().updateInvoiceStatus('i1', 'paid'); assert.equal(deposits().length, 1)
w.done()

// in the invoice's own currency
w = setup({ invoices: [invoice({ currency: 'GBP', items: [{ description: 'x', quantity: 1, rate: 5000 }] })], deposits: [deposit({ currency: 'GBP', amount: 3000 })] })
useStore.getState().updateInvoiceStatus('i1', 'paid')
assert.equal(w.notices.at(-1)?.text, 'Marked INV-1002 as paid. £2,000 of it is not logged as a deposit yet.'); w.done()

// nothing to say: no message
for (const [label, over] of [
  ['no deposit points at the invoice: the invoice itself stands for the money', { deposits: [] }],
  ['already covered by deposits', { deposits: [deposit({ amount: 22000 })] }],
  ['overpaid', { deposits: [deposit({ amount: 25000 })] }],
  ['a deposit in another currency is not a part payment', { deposits: [deposit({ currency: 'GBP' })] }],
  ["someone else's deposit", { deposits: [deposit({ invoiceId: 'other' })] }],
] as [string, object][]) {
  w = setup(over); useStore.getState().updateInvoiceStatus('i1', 'paid')
  assert.equal(status(), 'paid', `${label}: marked paid`); assert.equal(w.notices.length, 0, `${label}: nothing to say`); w.done()
}
for (const other of ['sent', 'overdue', 'void', 'draft'] as const) {
  w = setup(); useStore.getState().updateInvoiceStatus('i1', other)
  assert.equal(w.notices.length, 0, `marking it ${other} says nothing`); assert.equal(status(), other); w.done()
}

// linking the bank payment that paid it is the same, and unlinking leaves nothing behind
w = setup({ transactions: [{ id: 't1', accountId: 'a', date: '2026-10-15', name: 'Printworks', amount: -6000, pending: false }] })
useStore.getState().linkTransactionToInvoice('t1', 'i1')
assert.equal(status(), 'paid'); assert.equal(deposits().length, 1, 'no deposit is invented when a payment is linked'); assert.match(w.notices.at(-1)?.text ?? '', /\$6,000 of it is not logged as a deposit yet/)
useStore.getState().linkTransactionToInvoice('t1', null)
assert.equal(status(), 'sent', 'unlinking puts the invoice back'); assert.equal(deposits().length, 1, 'and there is nothing left behind to clean up'); w.done()

// a settlement for the same show that still shows a balance is mentioned (all of them, added up), whether or not anything is unlogged
w = setup({ settlements: [settlement(6000), settlement(2000, 'st2')] }); useStore.getState().updateInvoiceStatus('i1', 'paid')
assert.equal(w.notices.at(-1)?.text, 'Marked INV-1002 as paid. $6,000 of it is not logged as a deposit yet. The settlement for it still shows $8,000 owed: record a payment there too if it was the same money.'); w.done()
w = setup({ deposits: [], settlements: [settlement(22000)] }); useStore.getState().updateInvoiceStatus('i1', 'paid')
assert.equal(w.notices.at(-1)?.text, 'Marked INV-1002 as paid. The settlement for it still shows $22,000 owed: record a payment there too if it was the same money.'); assert.equal(w.notices.at(-1)?.action, undefined, 'no button when there is nothing to log'); w.done()
w = setup({ deposits: [], settlements: [settlement(500, 'st9', 'other-show')] }); useStore.getState().updateInvoiceStatus('i1', 'paid')
assert.equal(w.notices.length, 0, "another show's settlement is not this invoice's business"); w.done()

// ── logging a deposit against an invoice: nothing is invented there either; the person is told what is left to square up ──
const log = (amount: number, id = 'i1') => useStore.getState().addDeposit('Printworks', '2026-10-09', amount, 'USD', 0, 0, 0, id)
// the settlement is still at the full 22,000 and now 16,000 has arrived: that is more than the 6,000 the invoice has left, so say so
w = setup({ deposits: [], settlements: [settlement(22000)] }); log(16000)
assert.equal(w.notices.at(-1)?.text, 'Logged the deposit for INV-1002. The settlement for it still shows $22,000 owed: record a payment there too if it was the same money.'); assert.equal(w.notices.at(-1)?.action, undefined)
w.done()
// the settlement already shows only what the invoice has left: it cannot be counting this payment twice, so nothing to say
w = setup({ deposits: [], settlements: [settlement(6000)] }); log(16000); assert.equal(w.notices.length, 0, 'a settlement that matches what is left is fine'); w.done()
// the deposit covers the whole invoice and a settlement is still open
w = setup({ deposits: [], settlements: [settlement(22000)] }); log(22000)
assert.match(w.notices.at(-1)?.text ?? '', /The settlement for it still shows \$22,000 owed/); w.done()
// no settlement, or none for this show: nothing to say
w = setup({ deposits: [] }); log(16000); assert.equal(w.notices.length, 0); w.done()
w = setup({ deposits: [], settlements: [settlement(22000, 'st9', 'other-show')] }); log(16000); assert.equal(w.notices.length, 0); w.done()
// an invoice already marked paid that a deposit only part-covers: say how much is still not logged, with the button
w = setup({ invoices: [invoice({ status: 'paid' })], deposits: [] }); log(10000)
assert.equal(w.notices.at(-1)?.text, 'Logged the deposit for INV-1002. $12,000 of it is not logged as a deposit yet.'); assert.equal(w.notices.at(-1)?.action?.label, 'Log the deposit')
w.done()
// a deposit that is not for an invoice says nothing
w = setup({ deposits: [], settlements: [settlement(22000)] }); useStore.getState().addDeposit('Royalties', '2026-10-09', 500, 'USD', 0, 0, 0); assert.equal(w.notices.length, 0); w.done()

// ── the "Log the deposit" button goes to the artist the invoice belongs to, even if another was opened since ──
w = setup()
const two = useStore.getState().data.clients
useStore.setState({ data: { clients: [...two, { ...two[0], id: 'c2', name: 'Other' } as Client] } } as never)
useStore.getState().updateInvoiceStatus('i1', 'paid')
useStore.getState().openClient('c2'); useStore.getState().goToDashboard()
w.notices.at(-1)?.action?.run()
st = useStore.getState()
assert.equal(st.clientId, 'c1', 'back on the artist the invoice is for'); assert.equal(st.view, 'studio', 'inside the artist, not on Home'); assert.deepEqual([st.section, st.bizSub], ['finance', 'banking'])
assert.deepEqual([st.depositAddRequest, st.depositAddInvoiceId], [true, 'i1'])
// asking for the plain form afterwards leaves no stale invoice behind
st.requestDepositAdd(); assert.deepEqual([useStore.getState().depositAddRequest, useStore.getState().depositAddInvoiceId], [true, null], 'a plain request forgets the invoice'); w.done()

console.log('invoice-paid checks passed')
