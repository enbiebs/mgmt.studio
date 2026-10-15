// Checks that a crew member's saved fee follows them into budgets.  Run with:  npx tsx scripts/check-crew-fees.ts
import assert from 'node:assert/strict'
import { addMissingCrewFees, buildNewBudget, crewLineFor, withoutAddedCrewFees } from '../src/lib/budget'
import type { Budget, BudgetLine, Client, CrewMember, CrewRate } from '../src/types'

const TODAY = '2026-10-14'
const sam: CrewMember = { id: 'cm-sam', personId: 'p-sam', role: 'foh' } as CrewMember
const kit: CrewMember = { id: 'cm-kit', personId: 'p-kit', role: 'lighting' } as CrewMember
const rate = (id: string, extra: Partial<CrewRate> = {}): CrewRate => ({ crewMemberId: id, toursWithArtist: true, rateUnit: 'day', rateShow: 300, perDiem: 50, currency: 'USD', ...extra })
const line = (id: string, bucket: string, amount: number, extra: Partial<BudgetLine> = {}): BudgetLine => ({ id, section: bucket === 'guarantee' ? 'income' : 'production', bucket, label: bucket, amount, ...extra }) as BudgetLine
const budget = (extra: Partial<Budget> = {}): Budget => ({
  id: 'b1', showId: 's1', name: 'Show', currency: 'USD', status: 'draft', version: 1, commissions: [],
  lines: [line('g', 'guarantee', 5000), line('pd', 'per_diems', 100)], ...extra,
}) as Budget
const client = (rates: CrewRate[], budgets: Budget[] = [budget()], shows = [{ id: 's1', venue: 'Fabric', city: 'London', date: '2026-11-04' }]) => ({
  id: 'c1', name: 'Alpha',
  people: [{ id: 'p-sam', name: 'Sam Ortiz' }, { id: 'p-kit', name: 'Kit Lane' }],
  tour: { crew: [sam, kit], shows },
  agentData: { offers: [{ id: 'o1', date: '2026-12-01' }] },
  finance: { crewRates: rates, budgets, settings: undefined },
}) as unknown as Client

// the line itself: one advance day + one show day at the saved day rate (300 + 300 = 600)
const sl = crewLineFor(client([rate('cm-sam')]), sam, rate('cm-sam'))
assert.equal(sl.label, 'Labor — FOH (Sam Ortiz)')
assert.equal(sl.amount, 600)
assert.equal(sl.crewMemberId, 'cm-sam')
assert.deepEqual(sl.days, { advance: 1, travel: 0, show: 1 })
assert.notEqual(crewLineFor(client([]), sam, rate('cm-sam')).days, sl.days)       // each line gets its own days object

// someone who tours with the artist is added to a draft budget for an upcoming show, with their per diems
const c1 = client([rate('cm-sam')])
const r1 = addMissingCrewFees(c1, c1.finance.budgets[0], TODAY)!
assert.equal(r1.lines.length, 3)
assert.deepEqual(r1.added, ['Labor — FOH (Sam Ortiz)'])
assert.equal(r1.lines.find(l => l.crewMemberId === 'cm-sam')!.amount, 600)
assert.equal(r1.lines.find(l => l.bucket === 'per_diems')!.amount, 100 + 50 * 2)    // 2 days (advance + show) of per diem added on top
assert.equal(r1.lines.find(l => l.bucket === 'guarantee')!.amount, 5000)           // nothing else touched
assert.equal(c1.finance.budgets[0].lines.length, 2)                                 // the original budget is not mutated

// already in the budget: nothing to do (and nothing is doubled)
const withSam = budget({ lines: [...budget().lines, sl] })
assert.equal(addMissingCrewFees(client([rate('cm-sam')], [withSam]), withSam, TODAY), null)

// only the person asked about, only those who tour with the artist, only people still on the crew
const two = client([rate('cm-sam'), rate('cm-kit')])
assert.equal(addMissingCrewFees(two, two.finance.budgets[0], TODAY, 'cm-kit')!.added.length, 1)
assert.equal(addMissingCrewFees(two, two.finance.budgets[0], TODAY)!.added.length, 2)
assert.equal(addMissingCrewFees(client([rate('cm-sam', { toursWithArtist: false })]), budget(), TODAY), null)
assert.equal(addMissingCrewFees(client([rate('cm-gone')]), budget(), TODAY), null)

// a locked budget (a record of what was agreed) and a show that already happened are left alone
assert.equal(addMissingCrewFees(c1, budget({ status: 'locked' }), TODAY), null)
const past = client([rate('cm-sam')], [budget()], [{ id: 's1', venue: 'Fabric', city: 'London', date: '2026-10-01' }])
assert.equal(addMissingCrewFees(past, past.finance.budgets[0], TODAY), null)
// an offer budget is judged by the offer's date; one with no date at all counts as upcoming
assert.ok(addMissingCrewFees(c1, budget({ showId: undefined, offerId: 'o1' }), TODAY))
assert.ok(addMissingCrewFees(c1, budget({ showId: undefined, offerId: undefined }), TODAY))

// no per-diem line (or a zero per diem) just adds the fee
const noPd = budget({ lines: [line('g', 'guarantee', 5000)] })
assert.equal(addMissingCrewFees(client([rate('cm-sam')], [noPd]), noPd, TODAY)!.lines.length, 2)
const zeroPd = addMissingCrewFees(client([rate('cm-sam', { perDiem: 0 })]), budget(), TODAY)!
assert.equal(zeroPd.lines.find(l => l.bucket === 'per_diems')!.amount, 100)

// a fee per show (not per day) is one fee
assert.equal(crewLineFor(c1, sam, rate('cm-sam', { rateUnit: 'show', rateShow: 450 })).amount, 450)

// taking exactly that back out: the fee goes, the per diems go back, later edits stay
const r2 = addMissingCrewFees(c1, c1.finance.budgets[0], TODAY)!
assert.ok(r2.perDiemLineId && r2.perDiemAdded === 100 && r2.addedIds.length === 1)
const edited = r2.lines.map(l => (l.bucket === 'guarantee' ? { ...l, amount: 6000 } : l))        // someone changed the guarantee afterwards
const undone = withoutAddedCrewFees(edited, r2)
assert.equal(undone.length, 2)
assert.equal(undone.find(l => l.bucket === 'guarantee')!.amount, 6000)                               // the later edit is kept
assert.equal(undone.find(l => l.bucket === 'per_diems')!.amount, 100)                                // per diems are back to what they were
assert.equal(undone.some(l => l.crewMemberId), false)

// two per-diem lines: the per diems are added once, not twice
const twoPd = budget({ lines: [line('g', 'guarantee', 5000), line('pd1', 'per_diems', 100), line('pd2', 'per_diems', 40)] })
const once = addMissingCrewFees(client([rate('cm-sam')], [twoPd]), twoPd, TODAY)!
assert.equal(once.lines.find(l => l.id === 'pd1')!.amount, 200)
assert.equal(once.lines.find(l => l.id === 'pd2')!.amount, 40)
assert.equal(once.perDiemLineId, 'pd1')

// a brand-new budget still comes out the same way: one labor line per touring crew member + per diems
const fresh = buildNewBudget({ client: two, show: { id: 's1', venue: 'Fabric', city: 'London', date: '2026-11-04' } as never })
assert.equal(fresh.lines.filter(l => l.crewMemberId).length, 2)
assert.equal(fresh.lines.find(l => l.bucket === 'per_diems')!.amount, 200)          // 2 people x 50 x 2 days
console.log('crew-fees: all checks passed')
