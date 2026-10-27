// Checks the artist statement: the period choices, each figure, currencies never mixed, nothing counted twice.
// Run with:  npx tsx scripts/check-statement.ts
import assert from 'node:assert/strict'
import { buildStatement, periodChoices, statementFileName, monthWord } from '../src/lib/statement'
import type { Client, Deposit, Invoice, PLMonth, Show } from '../src/types'

const TODAY = '2026-10-26'
let n = 0
const check = (name: string, fn: () => void) => { fn(); n++; console.log('  ok  ' + name) }

const plm = (month: string, rev: Partial<PLMonth['revenue']> = {}, exp: Partial<PLMonth['expenses']> = {}): PLMonth => ({ month, revenue: { touring: 0, streaming: 0, sync: 0, brand: 0, merch: 0, other: 0, ...rev }, expenses: { travel: 0, recording: 0, marketing: 0, legal: 0, management: 0, equipment: 0, meals: 0, other: 0, ...exp } })
const show = (id: string, o: Partial<Show> = {}): Show => ({ id, date: '2026-09-12', city: 'Berlin', venue: 'Tresor', time: '22:00', status: 'confirmed', guarantee: 5000, viaAgency: true, agencyCommissionPct: 10, managementCommissionPct: 15, ...o })
const inv = (id: string, o: Partial<Invoice> = {}): Invoice => ({ id, number: id, to: 'P', category: 'touring', status: 'sent', issuedDate: '2026-09-01', dueDate: '2026-10-01', items: [{ description: 'x', quantity: 1, rate: 1000 }], currency: 'USD', ...o } as Invoice)
const client = (o: { plMonths?: PLMonth[]; shows?: Show[]; invoices?: Invoice[]; deposits?: Deposit[] } = {}): Client => ({
  id: 'a1', name: 'Mascolo', tour: { shows: o.shows ?? [] }, business: { banking: { deposits: o.deposits ?? [], transactions: [], accounts: [] } },
  finance: { plMonths: o.plMonths ?? [], invoices: o.invoices ?? [], expenses: [], settlements: [], budgets: [], vendors: [], crewRates: [] },
} as unknown as Client)
const SEPT = { key: 'last-month' as const, label: 'September 2026', from: '2026-09', to: '2026-09' }

check('the periods to pick from', () => {
  const p = periodChoices(TODAY)
  assert.deepEqual(p.map(x => [x.key, x.from, x.to]), [['last-month', '2026-09', '2026-09'], ['last-3', '2026-07', '2026-09'], ['this-year', '2026-01', '2026-10'], ['last-year', '2025-01', '2025-12']])
  assert.deepEqual(p.map(x => x.label), ['September 2026', 'July 2026 to September 2026', '2026 so far', '2025'])
  assert.equal(periodChoices('2027-01-15')[0].from, '2026-12', 'last month, across a new year')
  assert.deepEqual(periodChoices('2027-01-15')[1].from, '2026-10')
  assert.equal(monthWord('2026-03'), 'March 2026')
})
check('money in and out for the period, month by month added up, lines at zero left out', () => {
  const c = client({ plMonths: [plm('2026-08', { touring: 9999 }), plm('2026-09', { touring: 5000, merch: 300.5 }, { travel: 900, meals: 100.25 }), plm('2026-10', { touring: 7777 })] })
  const s = buildStatement(c, SEPT, { company: 'Noted Management', today: TODAY })
  assert.equal(s.sections.length, 1); const u = s.sections[0]
  assert.equal(u.currency, 'USD')
  assert.deepEqual(u.income, [{ label: 'Touring', amount: 5000 }, { label: 'Merch', amount: 300.5 }])
  assert.deepEqual(u.costs, [{ label: 'Travel', amount: 900 }, { label: 'Meals / Hospitality', amount: 100.25 }])
  assert.deepEqual([u.incomeTotal, u.costsTotal, u.net], [5300.5, 1000.25, 4300.25])
  assert.equal(s.company, 'Noted Management'); assert.deepEqual(s.sources, ['Entered by hand'])
})
check('a period spanning months adds them up', () => {
  const c = client({ plMonths: [plm('2026-07', { touring: 100 }), plm('2026-08', { touring: 200 }), plm('2026-09', { touring: 300 })] })
  assert.equal(buildStatement(c, periodChoices(TODAY)[1], { company: '', today: TODAY }).sections[0].incomeTotal, 600)
})
check('the shows are left off unless asked for (what a show pays is management\'s business)', () => {
  const c = client({ plMonths: [plm('2026-09', { touring: 1 })], shows: [show('s1')] })
  assert.deepEqual(buildStatement(c, SEPT, { company: '', today: TODAY }).sections[0].shows, [])
  assert.equal(buildStatement(c, SEPT, { company: '', today: TODAY, includeShows: true }).sections[0].shows.length, 1)
  assert.ok(!JSON.stringify(buildStatement(c, SEPT, { company: '', today: TODAY })).includes('Tresor'), 'nothing about the show is in it at all')
})
check('a show that has not happened yet is not in "so far"', () => {
  const c = client({ shows: [show('past', { date: '2026-10-10' }), show('later', { date: '2026-10-30' })] })
  const s = buildStatement(c, periodChoices(TODAY)[2], { company: '', today: TODAY, includeShows: true })
  assert.deepEqual(s.sections[0].shows.map(x => x.date), ['2026-10-10'])
})
check('shows in the period: the fee, each cut and what is left, with totals; cancelled, hold and no-fee shows are not in it', () => {
  const c = client({ shows: [show('s1'), show('s2', { date: '2026-09-20', guarantee: 2000, viaAgency: false }), show('s3', { status: 'cancelled' }), show('s4', { status: 'hold' }), show('s5', { guarantee: undefined }), show('s6', { date: '2026-08-31' })] })
  const u = buildStatement(c, SEPT, { company: '', today: TODAY, includeShows: true }).sections[0]
  assert.deepEqual(u.shows.map(s => [s.date, s.fee, s.agency, s.management, s.net]), [['2026-09-12', 5000, 500, 750, 3750], ['2026-09-20', 2000, 0, 0, 2000]])
  assert.deepEqual(u.showTotals, { fee: 7000, agency: 500, management: 750, net: 5750 })
  assert.equal(u.showTotals.agency + u.showTotals.management + u.showTotals.net, u.showTotals.fee)
})
check('each currency has its own section, home currency first, and they are never added together', () => {
  const c = client({ plMonths: [plm('2026-09', { touring: 1000 })], shows: [show('s1', { currency: 'GBP', guarantee: 4000, viaAgency: false })] })
  const s = buildStatement(c, SEPT, { company: '', today: TODAY, includeShows: true })
  assert.deepEqual(s.sections.map(x => x.currency), ['USD', 'GBP'])
  assert.equal(s.sections[0].incomeTotal, 1000); assert.equal(s.sections[0].shows.length, 0)
  assert.equal(s.sections[1].shows[0].fee, 4000); assert.equal(s.sections[1].incomeTotal, 0)
})
check('what is still owed is the unpaid invoices, less what was paid against them', () => {
  const c = client({ plMonths: [plm('2026-09', { touring: 1 })], invoices: [inv('i1'), inv('i2', { status: 'paid' }), inv('i3', { status: 'draft' }), inv('i4', { items: [{ description: 'x', quantity: 1, rate: 500 }], dueDate: '2026-12-01' }), inv('i5', { currency: 'EUR' })], deposits: [{ id: 'd', name: 'p', date: '2026-10-05', amount: 400, currency: 'USD', mgmt: 0, lawyer: 0, taxes: 0, done: true, invoiceId: 'i1' }] })
  const s = buildStatement(c, SEPT, { company: '', today: TODAY })
  assert.equal(s.sections.find(x => x.currency === 'USD')!.owed, 1100)     // i1 (1000 - 400) + i4 (500)
  assert.equal(s.sections.find(x => x.currency === 'EUR')!.owed, 1000)
})
check('nothing in the period is said plainly, and a quiet artist gives no sections', () => {
  const s = buildStatement(client(), SEPT, { company: '', today: TODAY })
  assert.equal(s.empty, true); assert.deepEqual(s.sections, [])
  const quiet = buildStatement(client({ plMonths: [plm('2026-01', { touring: 5 })] }), SEPT, { company: '', today: TODAY })
  assert.equal(quiet.empty, true)
})
check('the file name is safe', () => {
  assert.equal(statementFileName(buildStatement(client(), { ...SEPT, label: 'July 2026 to September 2026' }, { company: '', today: TODAY })), 'Statement - Mascolo - July 2026 to September 2026.pdf')
})
console.log(`${n} checks passed`)
