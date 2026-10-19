// Checks a show's money waterfall (income, costs, commissions, net), currency conversion, and crew pay.  Run with:  npx tsx scripts/check-budget-net.ts
import assert from 'node:assert/strict'
import { DEFAULT_COMMISSIONS, actualBudgetLines, commissionAmount, computeBudget, crewLineAmount, crewPerDiem, frozenRates, makeConverter, settledPnl, showFigures } from '../src/lib/budget'
import type { Budget, BudgetCommission, BudgetLine, Client, CrewRate, Expense, Settlement, Show } from '../src/types'

const r2 = (n: number) => Math.round(n * 100) / 100
const line = (id: string, section: BudgetLine['section'], bucket: string, amount: number): BudgetLine => ({ id, section, bucket, label: bucket, amount }) as BudgetLine
const com = (id: string, label: string, pct: number, base: BudgetCommission['base'], flat?: number): BudgetCommission => ({ id, label, pct, base, flat }) as BudgetCommission
const DEFAULTS = DEFAULT_COMMISSIONS.map((c, i) => com(`c${i}`, c.label, c.pct, c.base))

// ── commission: a percentage of the right base ──
const base = { gross: 10000, afterSL: 9000, afterProduction: 7000 }
assert.equal(commissionAmount(com('a', 'Agent', 10, 'gross'), base), 1000)
assert.equal(commissionAmount(com('a', 'Biz', 4, 'after_sound_lights'), base), 360)
assert.equal(commissionAmount(com('a', 'Mgmt', 15, 'after_production'), base), 1050)
assert.equal(commissionAmount(com('a', 'Flat fee', 0, 'flat', 750), base), 750)             // a flat amount ignores the percentage
assert.equal(commissionAmount(com('a', 'Flat none', 20, 'flat'), base), 0)                   // flat with no amount is zero
assert.equal(commissionAmount(com('a', 'Zero', 0, 'gross'), base), 0)
// no commission on a loss: costs above income must not turn a commission into extra money for the artist
assert.equal(commissionAmount(com('a', 'Mgmt', 15, 'after_production'), { gross: 5000, afterSL: 5000, afterProduction: -2000 }), 0)
assert.equal(commissionAmount(com('a', 'Agent', 10, 'gross'), { gross: 0, afterSL: -500, afterProduction: -900 }), 0)

// ── the waterfall: income, less sound & lights, less production, less commissions ──
const lines = [line('g', 'income', 'guarantee', 10000), line('s', 'sound_lights', 'sound_lights', 1000), line('h', 'production', 'hotels', 2000)]
let t = computeBudget(lines, DEFAULTS)
assert.deepEqual([t.gross, t.soundLights, t.adjustedAfterSL, t.production, t.adjustedAfterProduction], [10000, 1000, 9000, 2000, 7000])
assert.deepEqual(t.commissions, { c0: 1000, c1: 1050, c2: 360 })                              // agent 10% of gross, management 15% after production, business 4% after sound & lights
assert.equal(t.totalCommissions, 2410)
assert.equal(t.net, 4590)
// several lines in one section add up; a blank amount counts as zero
t = computeBudget([line('g1', 'income', 'guarantee', 6000), line('g2', 'income', 'bonus', 2500), { ...line('g3', 'income', 'overage', 0), amount: undefined as unknown as number }], [])
assert.deepEqual([t.gross, t.net, t.totalCommissions], [8500, 8500, 0])
// no commissions: net is everything after costs
assert.equal(computeBudget(lines, []).net, 7000)
// flat commission comes off the net too
assert.equal(computeBudget(lines, [com('f', 'Fee', 0, 'flat', 500)]).net, 6500)
// a losing show: costs above income, commissions on gross still apply, none on the negative base
t = computeBudget([line('g', 'income', 'guarantee', 2000), line('h', 'production', 'hotels', 5000)], DEFAULTS)
assert.equal(t.adjustedAfterProduction, -3000)
assert.deepEqual(t.commissions, { c0: 200, c1: 0, c2: 80 })                                    // agent and business still take theirs, management takes nothing on a loss
assert.equal(t.net, -3000 - 280)

// ── currency conversion ──
const { convert, missing } = makeConverter({ EUR: 1.1, GBP: 1.25 })
assert.equal(convert(100, 'USD', 'USD'), 100)
assert.equal(convert(100, 'EUR', 'USD'), 110)
assert.equal(r2(convert(110, 'USD', 'EUR')), 100)
assert.equal(convert(100, 'EUR', 'GBP'), 88)                                                    // through dollars: 110 / 1.25
assert.equal(convert(250, 'EUR', 'EUR'), 250)                                                   // same currency never touches the rate
assert.equal(missing.size, 0)
const lax = makeConverter({ EUR: 1.1 })
assert.equal(lax.convert(100, 'GBP', 'USD'), 100)                                               // no rate: counted 1:1 ...
assert.deepEqual([...lax.missing], ['GBP'])                                                     // ... and reported, so the screen can say so
assert.equal(makeConverter({ EUR: 0 }).convert(100, 'EUR', 'USD'), 100)                         // a zero rate is as good as none
// the rates frozen on a settlement are used for that show forever
assert.deepEqual(frozenRates({ fx: { EUR: 1.2, GBP: 1.3 } } as unknown as Settlement), { USD: 1, EUR: 1.2, GBP: 1.3 })

// ── crew pay ──
const rate = (o: Partial<CrewRate> = {}): CrewRate => ({ crewMemberId: 'm', toursWithArtist: true, rateUnit: 'day', rateShow: 300, perDiem: 50, currency: 'USD', ...o }) as CrewRate
assert.equal(crewLineAmount(rate({ rateUnit: 'show', rateShow: 800 }), { advance: 2, travel: 2, show: 1 }), 800)                // per show: one fee, whatever the days
assert.equal(crewLineAmount(rate({ rateUnit: 'show', rateShow: 800 }), { advance: 0, travel: 0, show: 2 }), 1600)
assert.equal(crewLineAmount(rate(), { advance: 1, travel: 0, show: 1 }), 600)                                                     // day rate for show and advance days
assert.equal(crewLineAmount(rate({ rateTravel: 150 }), { advance: 0, travel: 2, show: 1 }), 600)                                  // 300 + 2 × 150
assert.equal(crewLineAmount(rate({ rateTravel: 150, rateAdvance: 200 }), { advance: 1, travel: 1, show: 1 }), 650)               // 300 + 200 + 150
assert.equal(crewLineAmount(rate({ rateTravel: 150 }), { advance: 1, travel: 0, show: 1 }), 450)                                  // advance falls back to the travel rate
assert.equal(crewPerDiem(rate({ perDiem: 50 }), { advance: 1, travel: 1, show: 1 }), 150)
assert.equal(crewPerDiem(rate({ perDiem: 0 }), { advance: 3, travel: 3, show: 3 }), 0)

// ── per-show figures: the real costs against the budget, converted into the home currency ──
const show: Show = { id: 's1', date: '2026-09-22', city: 'Lisbon', venue: 'LX', time: '20:00', status: 'confirmed', guarantee: 10000, currency: 'USD' }
const budget = { id: 'b1', showId: 's1', name: 'LX', currency: 'USD', status: 'locked', version: 1, lines, commissions: DEFAULTS } as unknown as Budget
const hotelBill = { id: 'e1', description: 'Hotel', vendor: 'Hoxton', amount: 500, currency: 'EUR', category: 'travel', date: '2026-09-20', paid: true, showIds: ['s1'] } as unknown as Expense
const client = (o: { settlements?: Settlement[]; expenses?: Expense[] } = {}) => ({
  id: 'c', name: 'A', tour: { shows: [show], travel: [] },
  finance: { expenses: o.expenses ?? [hotelBill], settlements: o.settlements ?? [], budgets: [budget] },
}) as unknown as Client
const LIVE = { EUR: 1.1, GBP: 1.25 }

// not settled yet: income stays at the budget, the real cost comes in at today's rate (500 EUR = 550 USD)
let f = showFigures(client(), show, budget, 'USD', LIVE)
assert.deepEqual([f.settled, f.gross, f.budgetCosts, f.netCurrent], [false, 10000, 3000, 4590])
assert.equal(f.actualCosts, 550)
// real production 550: after production 9450; agent 1000, management 15% × 9450 = 1417.50, business 4% × 10000 = 400; net 9450 − 2817.50
assert.equal(f.netActual, 6632.5)
// no budget at all: gross is the fee, net is fee less real costs, no "current" figure
f = showFigures(client(), show, undefined, 'USD', LIVE)
assert.deepEqual([f.gross, f.actualCosts, f.netActual, f.netCurrent, f.budgetCosts], [10000, 550, 9450, null, null])
// no budget, fee in euros, shown in dollars
f = showFigures(client(), { ...show, guarantee: 5000, currency: 'EUR' }, undefined, 'USD', LIVE)
assert.equal(f.gross, 5500)

// settled: the real income replaces the budget's, and the rates FROZEN at settlement replace today's (500 EUR = 600 USD, not 550)
const settled = { id: 'st', showIds: ['s1'], currency: 'USD', fx: { USD: 1, EUR: 1.2, GBP: 1.3, at: '' }, totalDue: 8800, payments: [], boxOffice: [], expenses: [],
  payout: [{ kind: 'guarantee', label: 'Guarantee', amount: 9000 }, { kind: 'deduction', label: 'Tickets bought', amount: -200 }] } as unknown as Settlement
f = showFigures(client({ settlements: [settled] }), show, budget, 'USD', { EUR: 5, GBP: 5 })      // wildly different live rates change nothing
assert.equal(f.settled, true)
assert.equal(f.gross, 9000)
assert.equal(f.actualCosts, 800)                                                                    // 600 hotel + 200 bought off the payout
// after production 8200: agent 900, management 15% × 8200 = 1230, business 4% × 9000 = 360; net 8200 − 2490
assert.equal(f.netActual, 5710)
// a settlement that covers two shows gives each half the income
const twoNight = { ...settled, showIds: ['s1', 's2'] } as unknown as Settlement
assert.equal(showFigures(client({ settlements: [twoNight] }), show, budget, 'USD', LIVE).gross, 4500)

// ── the budget as it really went: income stays at budget until a settlement supplies the real one ──
const costs = { local_transport: 550, hotels: 100 }
const before = actualBudgetLines(lines, costs, false)
assert.deepEqual(before.filter(l => l.section === 'income').map(l => l.amount), [10000])           // budgeted income kept
assert.equal(before.filter(l => l.section !== 'income').length, 2)
const after = actualBudgetLines(lines, { ...costs, guarantee: 9000 }, true)
assert.deepEqual(after.filter(l => l.section === 'income').map(l => l.amount), [9000])             // the budget's income is dropped, the settled income stands in
assert.equal(after.filter(l => l.section === 'income').length, 1)

// ── the settled P&L for a show: original vs current vs settled ──
const withOriginal = { ...budget, original: { lines: [line('g', 'income', 'guarantee', 12000), line('h', 'production', 'hotels', 1000)], commissions: DEFAULTS } } as unknown as Budget
const pnl = settledPnl(client({ settlements: [settled] }), show, withOriginal, { EUR: 5, GBP: 5 })!
assert.equal(pnl.currency, 'USD')
assert.deepEqual([pnl.current.gross, pnl.current.net], [10000, 4590])                              // the budget as it stands now
assert.deepEqual([pnl.settled.gross, pnl.settled.production, pnl.settled.net], [9000, 800, 5710])  // real income, real costs at the frozen rates
assert.deepEqual([pnl.original!.gross, pnl.original!.production], [12000, 1000])                   // what was first promised
assert.equal(settledPnl(client(), show, undefined, LIVE), null)                                    // no budget, no P&L

console.log('budget-net checks passed')
