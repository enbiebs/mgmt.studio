// Checks the "All artists" Finance page: who is counted, what each line is and where it goes, the filters, and the numbers on top.
// Run with:  npx tsx scripts/check-roster-finance.ts
import assert from 'node:assert/strict'
import { buildRosterFinance, filterFinance, financeAccessFor, financeStats, scopeToCompany, type FinanceAccess, type FinanceInput } from '../src/lib/roster-finance'
import type { Client, Expense, Invoice, MainSection, Settlement, Show } from '../src/types'

const TODAY = '2026-10-21'
const FULL: FinanceAccess = { finance: true, showMoney: true, limited: false }
const NO_SHOWS: FinanceAccess = { finance: true, showMoney: false, limited: false }   // Finance, but not the shows and their fees

const invoice = (o: Partial<Invoice> & { id: string }): Invoice => ({
  number: o.id.toUpperCase(), to: 'Promoter', category: 'touring', status: 'sent', issuedDate: '2026-09-01', dueDate: '2026-11-01',
  items: [{ description: 'Fee', quantity: 1, rate: 3000 }], currency: 'USD', ...o,
} as Invoice)
const bill = (o: Partial<Expense> & { id: string }): Expense => ({ description: 'Van', vendor: 'Vans Inc', amount: 800, currency: 'USD', category: 'travel', date: '2026-10-01', paid: false, dueDate: '2026-11-02', ...o } as Expense)
const show = (o: Partial<Show> & { id: string }): Show => ({ date: '2026-12-10', city: 'Lisbon', venue: 'LX', time: '20:00', status: 'confirmed', guarantee: 10000, currency: 'USD', ...o })
const settlement = (o: Partial<Settlement> = {}): Settlement => ({
  id: 'st1', showIds: ['sh-old'], currency: 'USD', totalDue: 12000, payments: [{ label: 'Deposit', amount: 5000 }], confirmedAt: '2026-08-10T12:00:00Z', venue: 'Fabric', promoter: 'Live Co',
  boxOffice: [], expenses: [], payout: [], fx: { USD: 1, EUR: 1, GBP: 1, at: '' }, ...o,
} as Settlement)
const artist = (id: string, name: string, o: { invoices?: Invoice[]; expenses?: Expense[]; shows?: Show[]; settlements?: Settlement[]; isDemo?: boolean } = {}): Client => ({
  id, name, color: `#${id}`, isDemo: o.isDemo,
  tour: { shows: o.shows ?? [] }, finance: { invoices: o.invoices ?? [], expenses: o.expenses ?? [], settlements: o.settlements ?? [] },
  agentData: { offers: [] }, business: { banking: { deposits: [] } },
}) as unknown as Client
const input = (client: Client, access: FinanceAccess = FULL, workspaceId: string | null = 'w1'): FinanceInput => ({ client, access, workspaceId })
const ids = (rows: { id: string }[]) => rows.map(r => r.id)

// ── what is listed: invoices and settlements still owed, bills to pay, and shows nothing else covers ──
const alpha = artist('a', 'Alpha', {
  invoices: [invoice({ id: 'i-late', dueDate: '2026-10-01' }), invoice({ id: 'i-soon', dueDate: '2026-11-05' }), invoice({ id: 'i-paid', status: 'paid' }), invoice({ id: 'i-draft', status: 'draft' }), invoice({ id: 'i-eur', currency: 'EUR', dueDate: '2026-12-30' })],
  expenses: [bill({ id: 'b-late', dueDate: '2026-10-10' }), bill({ id: 'b-soon', dueDate: '2026-11-02', amount: 500 }), bill({ id: 'b-paid', paid: true })],
  shows: [show({ id: 'sh-new' }), show({ id: 'sh-old', date: '2026-08-01' })],
  settlements: [settlement()],
})
const res = buildRosterFinance([input(alpha)], TODAY)
assert.deepEqual(ids(res.rows), ['settlement:st1', 'invoice:i-late', 'bill:b-late', 'bill:b-soon', 'invoice:i-soon', 'invoice:i-eur', 'show:sh-new'], 'in date order; paid, draft and already-paid bills are not listed, and a show with a settlement is listed once')
const row = (id: string) => res.rows.find(r => r.id === id)!
assert.deepEqual([row('invoice:i-late').direction, row('invoice:i-late').late, row('invoice:i-late').daysLate], ['in', true, 20])
assert.deepEqual([row('bill:b-soon').direction, row('bill:b-soon').late], ['out', false])
assert.deepEqual([row('invoice:i-late').clientName, row('invoice:i-late').clientColor, row('invoice:i-late').workspaceId], ['Alpha', '#a', 'w1'])

// ── where a row opens ──
assert.deepEqual(row('invoice:i-late').link, { section: 'finance', sub: 'invoices' })
assert.deepEqual(row('bill:b-late').link, { section: 'finance', sub: 'payments' })
assert.deepEqual(row('settlement:st1').link, { section: 'tour', sub: 'settlements' }, 'a settlement lives on the Tour page')
assert.deepEqual(row('show:sh-new').link, { section: 'tour', sub: 'tour' })

// ── settlements and show fees need the shows and their fees (Tour and Deals & fees); without them only invoices and bills are listed ──
const noShows = buildRosterFinance([input(alpha, NO_SHOWS)], TODAY)
assert.deepEqual(ids(noShows.rows), ['invoice:i-late', 'bill:b-late', 'bill:b-soon', 'invoice:i-soon', 'invoice:i-eur'], 'no settlement, no show fee')
assert.deepEqual(noShows.noShowMoneyNames, ['Alpha'], 'and the page says so')
assert.deepEqual(res.noShowMoneyNames, [], 'nothing to say when the shows are open')
assert.deepEqual(buildRosterFinance([input(artist('p', 'Practice', { isDemo: true, shows: [show({ id: 'x' })] }), NO_SHOWS)], TODAY).noShowMoneyNames, [], 'a practice artist is not named')
// A person without Tour cannot load the shows, so a settlement and the sent invoice it is already on would both be counted: the money is listed once.
const covered = (shows: Show[]) => artist('c', 'Covered', {
  shows, settlements: [settlement({ id: 's-cov', showIds: ['sh-cov'], totalDue: 7000, payments: [] })],
  invoices: [invoice({ id: 'i-cov', dueDate: '2026-09-15', items: [{ description: 'Fee', quantity: 1, rate: 7000 }] })],
})
const withShows = buildRosterFinance([input(covered([show({ id: 'sh-cov', date: '2026-09-01', invoiceId: 'i-cov' })]))], TODAY)
assert.deepEqual([withShows.rows.length, financeStats(withShows.rows, TODAY).lateIn], [1, '$7,000'], 'everything open: the invoice covers the settlement')
const withoutShows = buildRosterFinance([input(covered([]), NO_SHOWS)], TODAY)
assert.deepEqual([withoutShows.rows.length, financeStats(withoutShows.rows, TODAY).lateIn], [1, '$7,000'], 'shows not loaded: still counted once')
assert.equal(financeStats(buildRosterFinance([input(covered([]), FULL)], TODAY).rows, TODAY).lateIn, '$14,000', 'the double count that the access rule prevents')

// ── who is counted: only artists whose whole Finance page is open, never an artist login, never single shared items ──
const beta = artist('b', 'Beta', { invoices: [invoice({ id: 'i-beta', dueDate: '2026-10-05' })] })
const gamma = artist('g', 'Gamma', { invoices: [invoice({ id: 'i-gamma' })] })
const delta = artist('d', 'Delta', { invoices: [invoice({ id: 'i-delta' })] })
const mixed = buildRosterFinance([
  input(beta), input(gamma, { finance: false, showMoney: false, limited: true }), input(delta, { finance: false, showMoney: false, limited: false }),
], TODAY)
assert.deepEqual(ids(mixed.rows), ['invoice:i-beta'], 'a shared-only artist and one with no Finance contribute nothing')
assert.deepEqual(mixed.limitedNames, ['Gamma'], 'but the page can say whose money it is not counting')
assert.deepEqual(buildRosterFinance([], TODAY), { rows: [], undated: { count: 0, byCurrency: '' }, limitedNames: [], noShowMoneyNames: [] })

// ── the access rule, from the real flags ──
const grants = (map: Record<string, MainSection[]>, shareOnly: Record<string, MainSection[]> = {}) => ({
  has: (s: MainSection, id: string) => (map[id] ?? []).includes(s) || (shareOnly[id] ?? []).includes(s),
  shareOnly: (s: MainSection, id: string) => (shareOnly[id] ?? []).includes(s),
})
const acc = (g: ReturnType<typeof grants>, role: 'manager' | 'team' | 'artist' = 'manager') => financeAccessFor(g.has, g.shareOnly, 'x', role)
const ALL3 = { finance: true, showMoney: true, limited: false }
assert.deepEqual(acc(grants({ x: ['finance', 'tour', 'deals'] })), ALL3)
assert.deepEqual(acc(grants({ x: ['finance', 'tour'] })), { ...ALL3, showMoney: false }, 'without Deals & fees the fees and invoice links of shows are not loaded')
assert.deepEqual(acc(grants({ x: ['finance', 'deals'] })), { ...ALL3, showMoney: false }, 'the Business Manager preset: no Tour, so no shows')
assert.deepEqual(acc(grants({ x: ['finance'] })), { ...ALL3, showMoney: false }, 'Finance alone')
assert.deepEqual(acc(grants({ x: ['finance', 'deals'] }, { x: ['tour'] })), { ...ALL3, showMoney: false }, 'only some shows were sent to them')
assert.deepEqual(acc(grants({ x: ['finance', 'tour'] }, { x: ['deals'] })), { ...ALL3, showMoney: false }, 'only some fees were sent to them')
assert.deepEqual(acc(grants({}, { x: ['finance'] })), { finance: false, showMoney: false, limited: true }, 'one invoice sent to them')
assert.deepEqual(acc(grants({ x: ['tour', 'deals'] })), { finance: false, showMoney: false, limited: false }, 'no Finance at all')
assert.deepEqual(acc(grants({ x: ['finance', 'tour', 'deals'] }), 'artist'), { finance: false, showMoney: false, limited: false }, "an artist's own login never sees management money")
assert.deepEqual(acc(grants({ y: ['finance', 'tour', 'deals'] })), { finance: false, showMoney: false, limited: false }, 'another artist')

// ── one company's money at a time ──
const A1 = input(artist('a1', 'A1'), FULL, 'w1'), A2 = input(artist('a2', 'A2'), FULL, 'w1'), B1 = input(artist('b1', 'B1'), FULL, 'w2')
const LIM = input(artist('l1', 'L1'), { finance: false, showMoney: false, limited: true }, 'w3')   // sent a single item, in a third company
const names = (r: ReturnType<typeof scopeToCompany>) => r.scoped.map(i => i.client.name)
let sc = scopeToCompany([A1, B1, A2, LIM], undefined, 'w2')
assert.deepEqual([sc.companies, sc.company, names(sc)], [['w1', 'w2'], 'w2', ['B1']], 'the company they work in comes first')
sc = scopeToCompany([A1, B1, A2], 'w1', 'w2')
assert.deepEqual([sc.company, names(sc)], ['w1', ['A1', 'A2']], 'a company they picked wins; the other company is not mixed in')
sc = scopeToCompany([A1, B1], 'gone', 'also-gone')
assert.equal(sc.company, 'w1', 'a choice that no longer exists falls back to the first company')
sc = scopeToCompany([A1], undefined, 'w9')
assert.deepEqual([sc.companies, names(sc)], [['w1'], ['A1']], 'one company: no picker, and an artist of another company with only a shared item is not pulled in')
assert.deepEqual(names(scopeToCompany([A1, LIM], undefined, 'w1')), ['A1'])
sc = scopeToCompany([LIM], undefined, 'w1')
assert.deepEqual([sc.companies, sc.company, names(sc)], [[], null, ['L1']], 'no company with any money: everything is passed on so the page can say why')
assert.deepEqual(scopeToCompany([], undefined, null), { companies: [], company: null, scoped: [] })
sc = scopeToCompany([input(artist('n1', 'N1'), FULL, null), A1], null, 'w1')
assert.deepEqual([sc.company, names(sc)], [null, ['N1']], 'a person with no company id can still pick it')

// ── filters: one direction at a time, within a window; late is always inside a window ──
const f = (o: { direction: 'in' | 'out'; window: 'late' | '30' | '90' | 'all'; clientId?: string }) => ids(filterFinance(res.rows, o, TODAY))
assert.deepEqual(f({ direction: 'in', window: 'late' }).sort(), ['invoice:i-late', 'settlement:st1'].sort())
assert.deepEqual(f({ direction: 'out', window: 'late' }), ['bill:b-late'])
assert.deepEqual(f({ direction: 'in', window: '30' }).sort(), ['invoice:i-late', 'invoice:i-soon', 'settlement:st1'].sort(), 'late and due within 30 days')
assert.deepEqual(f({ direction: 'out', window: '30' }), ['bill:b-late', 'bill:b-soon'])
assert.deepEqual(f({ direction: 'in', window: '90' }), ['settlement:st1', 'invoice:i-late', 'invoice:i-soon', 'invoice:i-eur', 'show:sh-new'], 'the EUR invoice (Dec 30) and the show fee (Jan 9) are inside 90 days')
assert.deepEqual(f({ direction: 'in', window: '90', clientId: 'a' }).length, 5)
assert.equal(f({ direction: 'in', window: 'all' }).length, 5)
assert.deepEqual(f({ direction: 'in', window: 'all', clientId: 'nobody' }), [])
assert.deepEqual(ids(filterFinance(buildRosterFinance([input(alpha), input(beta)], TODAY).rows, { direction: 'in', window: 'late', clientId: 'b' }, TODAY)), ['invoice:i-beta'], 'one artist')
assert.equal(filterFinance(res.rows, { direction: 'in', window: '30' }, TODAY).every(r => r.direction === 'in'), true)

// ── the numbers on top: per currency, never added across, never counting a practice artist ──
const s = financeStats(res.rows, TODAY)
assert.deepEqual([s.lateIn, s.lateInCount, s.lateOut, s.lateOutCount], ['$10,000', 2, '$800', 1], 'the unpaid settlement balance ($7,000) and the late invoice ($3,000)')
assert.equal(s.out30, '$500', 'the late bill is apart from the next 30 days')
assert.equal(s.in30, '$3,000', 'invoice i-soon only: late items are apart, the EUR invoice and the show fee are later than 30 days')
const big = [{ description: 'Fee', quantity: 1, rate: 99999 }]
const demoRow = buildRosterFinance([input(alpha), input(artist('p', 'Practice', { isDemo: true,
  invoices: [invoice({ id: 'i-demo', dueDate: '2026-10-01', items: big }), invoice({ id: 'i-demo2', dueDate: '2026-11-01', items: big })],
  expenses: [bill({ id: 'b-demo-late', dueDate: '2026-10-01', amount: 99999 }), bill({ id: 'b-demo-soon', dueDate: '2026-11-01', amount: 99999 })] }))], TODAY)
assert.equal(demoRow.rows.find(r => r.id === 'invoice:i-demo')!.demo, true, 'a practice artist is listed, marked')
assert.deepEqual(financeStats(demoRow.rows, TODAY), s, 'but the numbers are the same with or without it')
assert.deepEqual(financeStats([], TODAY), { lateIn: '', lateInCount: 0, lateOut: '', lateOutCount: 0, in30: '', out30: '' })
const multi = financeStats(buildRosterFinance([input(artist('m', 'Multi', { invoices: [invoice({ id: 'u', dueDate: '2026-10-01' }), invoice({ id: 'e', dueDate: '2026-10-02', currency: 'EUR', items: [{ description: 'Fee', quantity: 1, rate: 500 }] })] }))], TODAY).rows, TODAY)
assert.equal(multi.lateIn, '€500 · $3,000', 'dollars and euros stay apart (listed by currency code)')

// ── "next 30 days" is exactly 30 days: day 30 is in, day 31 is out ──
const edge = buildRosterFinance([input(artist('e', 'Edge', { invoices: [invoice({ id: 'd30', dueDate: '2026-11-20' }), invoice({ id: 'd31', dueDate: '2026-11-21' }), invoice({ id: 'd45', dueDate: '2026-12-05', items: [{ description: 'Fee', quantity: 1, rate: 100 }] })], expenses: [bill({ id: 'o30', dueDate: '2026-11-20', amount: 40 }), bill({ id: 'o45', dueDate: '2026-12-05', amount: 60 })] }))], TODAY).rows
assert.deepEqual([financeStats(edge, TODAY).in30, financeStats(edge, TODAY).out30], ['$3,000', '$40'], 'day 30 counts, day 31 and beyond do not')
assert.deepEqual(ids(filterFinance(edge, { direction: 'in', window: '30' }, TODAY)), ['invoice:d30'])
assert.deepEqual(ids(filterFinance(edge, { direction: 'in', window: '90' }, TODAY)), ['invoice:d30', 'invoice:d31', 'invoice:d45'])

// ── bills with no due date cannot be placed, so the page counts them (not a practice artist's) ──
const undated = buildRosterFinance([
  input(artist('u1', 'U1', { expenses: [bill({ id: 'x1', dueDate: undefined, amount: 100 }), bill({ id: 'x2', dueDate: undefined, amount: 50.5, currency: 'EUR' }), bill({ id: 'x3', dueDate: undefined, paid: true })] })),
  input(artist('u2', 'U2', { isDemo: true, expenses: [bill({ id: 'x4', dueDate: undefined, amount: 9999 })] })),
], TODAY)
assert.deepEqual(undated.undated, { count: 2, byCurrency: '€50.50 · $100' })

console.log('roster-finance checks passed')
