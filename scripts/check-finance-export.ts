// Checks the spreadsheets for an accountant: the right rows, the right amounts, currencies never mixed, nothing a person cannot see,
// and nothing that runs as a formula when opened.  Run with:  npx tsx scripts/check-finance-export.ts
import assert from 'node:assert/strict'
import { buildExport, EXPORTS } from '../src/lib/finance-export'
import { showCommissions, showNet } from '../src/lib/money'
import type { Client, Deposit, Expense, Invoice, PLMonth, Settlement, Show } from '../src/types'

const TODAY = '2026-10-26'
let n = 0
const check = (name: string, fn: () => void) => { fn(); n++; console.log('  ok  ' + name) }

const inv = (id: string, o: Partial<Invoice> = {}): Invoice => ({ id, number: id.toUpperCase(), to: 'Promoter', toEmail: 'p@x.org', category: 'touring', status: 'sent', issuedDate: '2026-09-01', dueDate: '2026-10-01', items: [{ description: 'x', quantity: 2, rate: 500 }], currency: 'USD', ...o } as Invoice)
const bill = (id: string, o: Partial<Expense> = {}): Expense => ({ id, description: 'Van hire', vendor: 'Vans Inc', amount: 800.5, currency: 'USD', category: 'travel', date: '2026-10-01', paid: false, dueDate: '2026-10-20', billNumber: 'B-1', ...o } as Expense)
const show = (id: string, o: Partial<Show> = {}): Show => ({ id, date: '2026-11-06', city: 'Berlin', venue: 'Tresor', time: '22:00', status: 'confirmed', ...o })
const dep = (o: Partial<Deposit>): Deposit => ({ id: 'd1', name: 'Pay', date: '2026-10-05', amount: 400, currency: 'USD', mgmt: 0.1, lawyer: 0, taxes: 0, done: true, ...o })
const plm = (month: string, o: Partial<PLMonth['revenue']> = {}, e: Partial<PLMonth['expenses']> = {}): PLMonth => ({ month, revenue: { touring: 0, streaming: 0, sync: 0, brand: 0, merch: 0, other: 0, ...o }, expenses: { travel: 0, recording: 0, marketing: 0, legal: 0, management: 0, equipment: 0, meals: 0, other: 0, ...e } })

interface Parts { name?: string; invoices?: Invoice[]; expenses?: Expense[]; shows?: Show[]; deposits?: Deposit[]; plMonths?: PLMonth[]; settlements?: Settlement[] }
const client = (p: Parts = {}): Client => ({
  id: 'a1', name: p.name ?? 'Mascolo',
  tour: { shows: p.shows ?? [] }, business: { banking: { deposits: p.deposits ?? [], transactions: [], accounts: [] } },
  finance: { invoices: p.invoices ?? [], expenses: p.expenses ?? [], plMonths: p.plMonths ?? [], settlements: p.settlements ?? [], budgets: [], vendors: [], crewRates: [] },
} as unknown as Client)
const col = (rows: Record<string, unknown>[], k: string) => rows.map(r => r[k])

check('there is an export for each kind, and each has words an intern understands', () => {
  assert.deepEqual(EXPORTS.map(e => e.key), ['invoices', 'bills', 'commissions', 'pl', 'settlements'])
  assert.ok(EXPORTS.every(e => e.label.length > 3 && e.hint.length > 10))
})

// ── invoices ──
check('invoices: state, amounts received and still owed, to the cent', () => {
  const c = client({ invoices: [inv('i-sent'), inv('i-paid', { status: 'paid', paidDate: '2026-10-03' }), inv('i-draft', { status: 'draft', dueDate: '2026-12-01' }), inv('i-void', { status: 'void' }), inv('i-part', { dueDate: '2026-11-30' })], deposits: [dep({ invoiceId: 'i-part', amount: 400 })] })
  const f = buildExport('invoices', [c], TODAY)
  const by = Object.fromEntries(f.rows.map(r => [r.Invoice, r]))
  assert.equal(by.I_SENT?.Status ?? by['I-SENT'].Status, 'Overdue')                      // past due, nothing paid
  assert.deepEqual([by['I-SENT'].Total, by['I-SENT'].Received, by['I-SENT'].Outstanding], [1000, 0, 1000])
  assert.deepEqual([by['I-PAID'].Status, by['I-PAID'].Received, by['I-PAID'].Outstanding, by['I-PAID']['Paid on']], ['Paid', 1000, 0, '2026-10-03'])
  assert.deepEqual([by['I-DRAFT'].Status, by['I-DRAFT'].Received, by['I-DRAFT'].Outstanding], ['Draft', 0, 0])
  assert.deepEqual([by['I-VOID'].Status, by['I-VOID'].Outstanding], ['Void', 0])
  assert.deepEqual([by['I-PART'].Status, by['I-PART'].Received, by['I-PART'].Outstanding], ['Sent', 400, 600])
  assert.deepEqual(f.columns.slice(0, 3), ['Artist', 'Invoice', 'Billed to'])
})
check('invoices: a deposit in another currency does not pay this invoice', () => {
  const f = buildExport('invoices', [client({ invoices: [inv('i1')], deposits: [dep({ invoiceId: 'i1', currency: 'GBP', amount: 1000 })] })], TODAY)
  assert.equal(f.rows[0].Outstanding, 1000); assert.equal(f.rows[0].Currency, 'USD')
})
check('invoices: artists are named, and several artists share one file', () => {
  const f = buildExport('invoices', [client({ name: 'Mascolo', invoices: [inv('a')] }), client({ name: 'Sierra Bloom', invoices: [inv('b')] })], TODAY)
  assert.deepEqual(col(f.rows, 'Artist'), ['Mascolo', 'Sierra Bloom'])
})

// ── bills ──
check('bills: every bill with its number, dates and paid state', () => {
  const f = buildExport('bills', [client({ expenses: [bill('b1'), bill('b2', { paid: true, vendor: 'Hotel', amount: 120, currency: 'GBP', billNumber: undefined })] })], TODAY)
  assert.deepEqual(f.rows[0], { Artist: 'Mascolo', Vendor: 'Vans Inc', 'Bill number': 'B-1', Description: 'Van hire', Category: 'travel', Currency: 'USD', Amount: 800.5, 'Bill date': '2026-10-01', 'Due date': '2026-10-20', Paid: false })
  assert.deepEqual([f.rows[1].Paid, f.rows[1].Currency, f.rows[1].Amount], [true, 'GBP', 120])
})
check('whatever a vendor is called, the file cannot run it as a formula', () => {
  const f = buildExport('bills', [client({ expenses: [bill('b1', { vendor: '=HYPERLINK("http://evil.example","pay")', description: '+cmd|calc', billNumber: '@SUM(1)' })] })], TODAY)
  const line = f.csv.split('\r\n')[1]
  assert.ok(line.includes(`"'=HYPERLINK(""http://evil.example"",""pay"")"`), line)
  assert.ok(line.includes("'+cmd|calc") && line.includes("'@SUM(1)"), line)
  assert.ok(!/(^|,)[=+@]/.test(line.replace(/"[^"]*"/g, '')), 'no cell starts with a formula character')
})

// ── show fees and commissions ──
check('commissions add up: agency + management + net is the fee, to the cent, and net agrees with showNet', () => {
  for (const fee of [5000, 333.33, 1234.56, 0.01, 99999.99]) {
    for (const [a, m] of [[10, 15], [0, 20], [12.5, 7.5], [10, 0]]) {
      const s = { guarantee: fee, viaAgency: true, agencyCommissionPct: a, managementCommissionPct: m }
      const k = showCommissions(s)
      assert.equal(Math.round((k.agency + k.management + k.net) * 100), Math.round(k.fee * 100), JSON.stringify(s))
      assert.equal(k.net, showNet(s)); assert.ok(k.agency >= 0 && k.management >= -0.005)
    }
  }
  assert.deepEqual(showCommissions({ guarantee: 5000, viaAgency: true, agencyCommissionPct: 10, managementCommissionPct: 15 }), { fee: 5000, agency: 500, management: 750, net: 3750 })
})
check('commissions: a show booked direct has no cuts; a show with no fee has no row', () => {
  assert.deepEqual(showCommissions({ guarantee: 5000, viaAgency: false, agencyCommissionPct: 10, managementCommissionPct: 15 }), { fee: 5000, agency: 0, management: 0, net: 5000 })
  const f = buildExport('commissions', [client({ shows: [show('s1', { guarantee: 5000, viaAgency: true, agencyName: 'WME', agencyCommissionPct: 10, managementCommissionPct: 15, deposit: 2500, received: 2500, currency: 'GBP' }), show('s2', { guarantee: 4000 }), show('s3', { date: '2026-11-01' }), show('s4', { guarantee: 9000, status: 'cancelled' }), show('s5', { guarantee: 3000, status: 'hold' })] })], TODAY)
  assert.equal(f.rows.length, 3, 'a cancelled show is not in it; a hold is (its Status says so)')
  assert.ok(!f.rows.some(r => r.Fee === 9000))
  assert.deepEqual(col(f.rows, 'Date'), ['2026-11-06', '2026-11-06', '2026-11-06'])
  const agency = f.rows.find(r => r.Agency === 'WME')!
  assert.deepEqual([agency.Fee, agency['Agency commission'], agency['Management commission'], agency['Net to artist'], agency.Currency, agency['Received so far']], [5000, 500, 750, 3750, 'GBP', 2500])
  const direct = f.rows.find(r => r.Agency !== 'WME')!
  assert.deepEqual([direct['Agency commission'], direct['Management commission'], direct['Net to artist'], direct['Booked through an agency']], [0, 0, 4000, false])
})
check('commissions: someone who may not see show fees gets no fee rows (the shows come without money)', () => {
  assert.equal(buildExport('commissions', [client({ shows: [show('s1'), show('s2')] })], TODAY).rows.length, 0)
})

// ── profit and loss ──
check('profit and loss: one row per recorded month, each currency apart, empty months left out', () => {
  const c = client({ plMonths: [plm('2026-08', { touring: 5000, streaming: 200 }, { travel: 900 }), plm('2026-10', { merch: 300 })] })
  const f = buildExport('pl', [c], TODAY)
  assert.deepEqual(col(f.rows, 'Month'), ['2026-08', '2026-10'], 'September is quiet, so it is not a row')
  const aug = f.rows[0]
  assert.deepEqual([aug['Total in'], aug['Total out'], aug.Net, aug.Touring, aug.Streaming, aug.Travel, aug['Where the figures come from']], [5200, 900, 4300, 5000, 200, 900, 'Entered by hand'])
  assert.ok(f.rows.every(r => r.Currency === 'USD'))
})
check('profit and loss: a currency other than the home one gets its own rows, never added into the dollars', () => {
  const c = client({ plMonths: [plm('2026-09', { touring: 1000 })], deposits: [dep({ id: 'g1', date: '2026-09-15', amount: 700, currency: 'GBP', name: 'Sound Co' })] })
  const f = buildExport('pl', [c], TODAY)
  const sep = f.rows.filter(r => r.Month === '2026-09')
  assert.deepEqual(sep.map(r => [r.Currency, r['Total in']]).sort(), [['GBP', 700], ['USD', 1000]])
})

// ── settlements ──
check('settlements: what was owed, paid and is left, with the show date', () => {
  const st = { id: 'st1', showIds: ['s1'], currency: 'EUR', totalDue: 12000, payments: [{ label: 'Deposit', amount: 5000 }], venue: 'Tresor', promoter: 'Live Co', preparedOn: '2026-10-10', fx: {}, boxOffice: [], expenses: [], payout: [], confirmedAt: '' } as unknown as Settlement
  const f = buildExport('settlements', [client({ shows: [show('s1')], settlements: [st] })], TODAY)
  assert.deepEqual(f.rows[0], { Artist: 'Mascolo', 'Show date': '2026-11-06', Event: undefined, Venue: 'Tresor', Promoter: 'Live Co', 'Prepared on': '2026-10-10', Currency: 'EUR', 'Total due': 12000, 'Paid so far': 5000, Balance: 7000 })
})

check('an empty artist gives just the header row, for every kind', () => {
  for (const e of EXPORTS) { const f = buildExport(e.key, [client()], TODAY); assert.equal(f.rows.length, 0); assert.equal(f.csv.split('\r\n').length, 2, e.key) }
})

console.log(`${n} checks passed`)
