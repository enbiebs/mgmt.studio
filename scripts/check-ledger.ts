// Checks the profit & loss worked out month by month: where each month comes from, nothing counted twice, one P&L per currency.  Run with:  npx tsx scripts/check-ledger.ts
import assert from 'node:assert/strict'
import { buildPL, depositCategory, monthsThisYear, netIncome, totalExpenses, totalRevenue } from '../src/lib/ledger'
import type { BankTransaction, Client, Deposit, Expense, Invoice, PLMonth } from '../src/types'

const TODAY = '2026-10-19'
const plMonth = (month: string, rev: Partial<PLMonth['revenue']> = {}, exp: Partial<PLMonth['expenses']> = {}): PLMonth => ({
  month,
  revenue: { touring: 0, streaming: 0, sync: 0, brand: 0, merch: 0, other: 0, ...rev },
  expenses: { travel: 0, recording: 0, marketing: 0, legal: 0, management: 0, equipment: 0, meals: 0, other: 0, ...exp },
})
const invoice = (o: Partial<Invoice> = {}): Invoice => ({ id: 'i1', number: 'INV-1', to: 'Promoter', category: 'touring', status: 'paid', issuedDate: '2026-08-01', dueDate: '2026-09-01', paidDate: '2026-09-10', items: [{ description: 'x', quantity: 1, rate: 10000 }], currency: 'USD', ...o } as Invoice)
const deposit = (o: Partial<Deposit> = {}): Deposit => ({ id: 'd1', name: 'BMI ROYALTY DIST', date: '2026-09-15', amount: 2000, currency: 'USD', mgmt: 0.1, lawyer: 0, taxes: 0, done: false, ...o })
const bill = (o: Partial<Expense> = {}): Expense => ({ id: 'e1', description: 'Van', vendor: 'Vans', amount: 800, currency: 'USD', category: 'travel', date: '2026-09-20', paid: true, ...o } as Expense)
const bank = (o: Partial<BankTransaction> = {}): BankTransaction => ({ id: 't1', accountId: 'a', date: '2026-08-05', name: 'x', amount: -500, pending: false, ...o })

interface Parts { typed?: PLMonth[]; invoices?: Invoice[]; deposits?: Deposit[]; expenses?: Expense[]; bank?: BankTransaction[]; home?: string }
const client = (p: Parts = {}): Client => ({
  id: 'c1', name: 'Artist',
  finance: { plMonths: p.typed ?? [], invoices: p.invoices ?? [], expenses: p.expenses ?? [], settings: p.home ? { homeCurrency: p.home, defaultCommissions: [] } : undefined },
  business: { banking: { deposits: p.deposits ?? [], transactions: p.bank ?? [] } },
}) as unknown as Client
const months = (p: Parts, cur = 'USD') => buildPL(client(p), TODAY).months[cur] ?? []
const get = (p: Parts, month: string, cur = 'USD') => months(p, cur).find(m => m.month === month)

// ── what kind of income a deposit is (a guess from its name, only to pick the line) ──
for (const [name, cat] of [
  ['BMI ROYALTY DIST', 'streaming'], ['SOUNDEXCHANGE', 'streaming'], ['Spotify payout', 'streaming'], ['DistroKid', 'streaming'], ['PRS for Music', 'streaming'],
  ['Sync Licensing Co.', 'sync'], ['HBO sync fee', 'sync'], ['Merch drop', 'merch'], ['Brand partnership', 'brand'], ['Festival guarantee', 'touring'],
  ['Atlantic Recording', 'other'], ['Invoice Payment', 'other'], ['', 'other'],
] as const) assert.equal(depositCategory(name), cat, `${name} is ${cat}`)

// ── nothing recorded: no P&L at all ──
assert.deepEqual(buildPL(client(), TODAY), { currencies: [], months: {} })

// ── money in: deposits and paid invoices, by month ──
let m = get({ deposits: [deposit(), deposit({ id: 'd2', name: 'Sync Licensing Co.', amount: 200000 })] }, '2026-09')!
assert.equal(m.source, 'records')
assert.equal(m.revenue.streaming, 2000)
assert.equal(m.revenue.sync, 200000)                                           // the $200K sync deposit now shows in the P&L
m = get({ invoices: [invoice()] }, '2026-09')!                                  // a paid invoice counts in the month it was paid
assert.equal(m.revenue.touring, 10000)
assert.equal(get({ invoices: [invoice({ paidDate: undefined, dueDate: '2026-08-31' })] }, '2026-08')!.revenue.touring, 10000)   // no paid date: its due date
for (const status of ['draft', 'sent', 'overdue', 'void'] as const) assert.equal(get({ invoices: [invoice({ status })] }, '2026-09'), undefined, `a ${status} invoice is not income`)
assert.equal(get({ invoices: [invoice({ category: 'sync', items: [{ description: 'a', quantity: 2, rate: 1500.5 }] })] }, '2026-09')!.revenue.sync, 3001)   // quantity × rate, to the cent

// ── nothing counted twice: a deposit that pays an invoice replaces that invoice ──
const both = { invoices: [invoice({ id: 'inv-9' })], deposits: [deposit({ name: 'Invoice Payment', amount: 9500, invoiceId: 'inv-9' })] }
m = get(both, '2026-09')!
assert.equal(totalRevenue(m), 9500)                                              // what actually arrived, once (not 9,500 + 10,000)
assert.equal(m.revenue.touring, 9500)                                            // on the invoice's own line (touring), not "other"
assert.equal(totalRevenue(get({ invoices: [invoice({ id: 'inv-9' })], deposits: [deposit({ invoiceId: 'someone-elses' })] }, '2026-09')!), 12000)   // a link to another invoice covers nothing here
// a deposit and an UNLINKED paid invoice are different money, both count
assert.equal(totalRevenue(get({ invoices: [invoice()], deposits: [deposit()] }, '2026-09')!), 12000)
// an invoice not yet paid but with a deposit: the deposit is money in
assert.equal(totalRevenue(get({ invoices: [invoice({ id: 'inv-9', status: 'sent' })], deposits: [deposit({ invoiceId: 'inv-9', amount: 4000 })] }, '2026-09')!), 4000)

// ── money out: paid bills only ──
m = get({ expenses: [bill(), bill({ id: 'e2', amount: 200, category: 'meals' }), bill({ id: 'e3', amount: 999, paid: false })] }, '2026-09')!
assert.deepEqual([m.expenses.travel, m.expenses.meals], [800, 200])
assert.equal(totalExpenses(m), 1000)                                             // the unpaid bill is not an expense yet
assert.equal(netIncome(get({ invoices: [invoice()], expenses: [bill({ amount: 2500 })] }, '2026-09')!), 7500)

// ── a month someone typed wins; records for that month are not added on top ──
const typed = [plMonth('2026-07', { touring: 29400, streaming: 22800 }, { management: 17085 })]
m = get({ typed, deposits: [deposit({ date: '2026-07-20', amount: 999999 })], invoices: [invoice({ paidDate: '2026-07-05' })] }, '2026-07')!
assert.equal(m.source, 'typed')
assert.equal(totalRevenue(m), 52200)
assert.equal(m.expenses.management, 17085)

// ── records beat the bank; the bank fills what is left ──
const withBank = { bank: [bank({ date: '2026-08-05', amount: -500 }), bank({ id: 't2', date: '2026-09-05', amount: -700 }), bank({ id: 't3', date: '2026-09-06', amount: 100 })], invoices: [invoice()] }
assert.equal(get(withBank, '2026-09')!.source, 'records')                        // the invoice month: the bank is not added on top
assert.equal(totalRevenue(get(withBank, '2026-09')!), 10000)
assert.equal(get(withBank, '2026-08')!.source, 'bank')                           // a month with only bank activity
assert.equal(get(withBank, '2026-08')!.revenue.other, 500)
assert.equal(get({ bank: [bank({ pending: true })] }, '2026-08'), undefined)     // pending transactions are not counted

// ── months run up to this month, with no gaps ──
const run = months({ typed: [plMonth('2026-05', { touring: 1000 })], invoices: [invoice({ paidDate: '2026-08-10' })] })
assert.deepEqual(run.map(x => x.month), ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'])   // stops at October, not at the last typed month
assert.deepEqual(run.map(x => x.source), ['typed', 'none', 'none', 'records', 'none', 'none'])
assert.equal(totalRevenue(run[1]), 0)
assert.equal(months({ typed: [plMonth('2025-11', { touring: 1 })] }).length, 12)                            // a year back: Nov 2025 to Oct 2026
assert.deepEqual(months({ invoices: [invoice({ paidDate: '2026-12-15' })] }).map(x => x.month), ['2026-12'])   // a date in the future is kept, nothing invented before it
// a year boundary
assert.deepEqual(months({ typed: [plMonth('2025-12', { touring: 1 })] }).slice(0, 3).map(x => x.month), ['2025-12', '2026-01', '2026-02'])

// ── one P&L per currency, never mixed ──
const mixed = { invoices: [invoice(), invoice({ id: 'i2', currency: 'GBP', items: [{ description: 'x', quantity: 1, rate: 4000 }] })], deposits: [deposit({ currency: 'EUR', amount: 800 })] }
const pl = buildPL(client(mixed), TODAY)
assert.deepEqual(pl.currencies, ['USD', 'GBP', 'EUR'])                           // home currency first, then pounds, then euros
assert.equal(totalRevenue(get(mixed, '2026-09', 'USD')!), 10000)                  // dollars only: the dollar invoice (the deposit is in euros)
assert.equal(totalRevenue(get(mixed, '2026-09', 'GBP')!), 4000)
assert.equal(totalRevenue(get(mixed, '2026-09', 'EUR')!), 800)
// typed months belong to the home currency
const gbpHome = buildPL(client({ home: 'GBP', typed: [plMonth('2026-07', { touring: 5000 })], invoices: [invoice()] }), TODAY)
assert.deepEqual(gbpHome.currencies, ['GBP', 'USD'])
assert.equal(totalRevenue(gbpHome.months.GBP.find(x => x.month === '2026-07')!), 5000)
assert.equal(gbpHome.months.USD[0].source, 'records')
// the bank's own currency is kept
assert.deepEqual(buildPL(client({ bank: [bank({ currency: 'EUR' })] }), TODAY).currencies, ['EUR'])

// ── year to date means this calendar year, not every month ever entered ──
const years = months({ typed: [plMonth('2025-11', { touring: 100 }), plMonth('2025-12', { touring: 200 }), plMonth('2026-01', { touring: 300 }), plMonth('2026-03', { touring: 400 })] })
const ytd = monthsThisYear(years, TODAY)
assert.equal(ytd[0].month, '2026-01')
assert.equal(ytd.length, 10)                                                       // January to October
assert.equal(ytd.reduce((s, x) => s + totalRevenue(x), 0), 700)                    // 300 + 400, not 1,000

console.log('ledger checks passed')
