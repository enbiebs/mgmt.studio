// Checks the sums a settlement must satisfy (and how a balance is worked out).  Run with:  npx tsx scripts/check-settlement-math.ts
import assert from 'node:assert/strict'
import { balanceOf, checkSettlement, money2, paidSoFar } from '../src/lib/settlement-math'
import type { SettlementDraft } from '../src/types'

type Draft = Pick<SettlementDraft, 'boxOffice' | 'expenses' | 'summary' | 'deal' | 'payout' | 'totalDue' | 'payments' | 'balanceDue'>
const draft = (o: Partial<Draft> = {}): Draft => ({ boxOffice: [], expenses: [], summary: undefined, deal: undefined, payout: [{ kind: 'guarantee', label: 'Guarantee', amount: 10000 }], totalDue: 10000, payments: [], balanceDue: undefined, ...o } as unknown as Draft)
const byLabel = (checks: ReturnType<typeof checkSettlement>, text: string) => checks.find(c => c.label.includes(text))

// ── formatting keeps the cents ──
assert.equal(money2(18187.1, 'USD'), '$18,187.10')
assert.equal(money2(0, 'EUR'), '€0.00')
assert.equal(money2(1234.5, 'GBP'), '£1,234.50')
assert.equal(money2(-50, 'USD'), '-$50.00')

// ── paid so far, and what is still owed ──
assert.equal(paidSoFar({ payments: [] }), 0)
assert.equal(paidSoFar({ payments: [{ label: 'a', amount: 5000 }, { label: 'b', amount: 1250.5 }] }), 6250.5)
assert.equal(paidSoFar({ payments: [{ label: 'a', amount: 0.1 }, { label: 'b', amount: 0.2 }] }), 0.3)           // no float noise
assert.equal(balanceOf({ totalDue: 12000, payments: [{ label: 'a', amount: 5000 }] }), 7000)
assert.equal(balanceOf({ totalDue: 12000, payments: [] }), 12000)
assert.equal(balanceOf({ totalDue: 12000, payments: [{ label: 'a', amount: 12000 }] }), 0)
assert.equal(balanceOf({ totalDue: 12000, payments: [{ label: 'a', amount: 13000 }] }), -1000)                    // overpaid shows as negative, not zero
assert.equal(balanceOf({ totalDue: 12000, payments: [{ label: 'a', amount: 5000 }], balanceDue: 6500 }), 6500)    // the statement's printed balance wins
assert.equal(balanceOf({ totalDue: 12000, payments: [], balanceDue: 0 }), 0)                                       // a printed balance of 0 is still printed

// ── check 1: the payout lines add up to the total due ──
let c = checkSettlement(draft(), 'USD')
assert.equal(byLabel(c, 'Payout lines')!.ok, true)
c = checkSettlement(draft({ totalDue: 10100 }), 'USD')
assert.equal(byLabel(c, 'Payout lines')!.ok, false)
assert.match(byLabel(c, 'Payout lines')!.detail, /\$10,000\.00 but the total due is \$10,100\.00/)
assert.equal(byLabel(checkSettlement(draft({ totalDue: 10000.04 }), 'USD'), 'Payout lines')!.ok, true)             // 4 cents of rounding is fine
assert.equal(byLabel(checkSettlement(draft({ totalDue: 10000.06 }), 'USD'), 'Payout lines')!.ok, false)

// ── check 2: ticket tiers add up to the gross ──
const tiers = [{ tier: 'GA', gross: 60000 }, { tier: 'VIP', gross: 40000 }] as unknown as Draft['boxOffice']
assert.equal(byLabel(checkSettlement(draft({ boxOffice: tiers, summary: { gross: 100000 } as Draft['summary'] }), 'USD'), 'Ticket tiers')!.ok, true)
assert.equal(byLabel(checkSettlement(draft({ boxOffice: tiers, summary: { gross: 105000 } as Draft['summary'] }), 'USD'), 'Ticket tiers')!.ok, false)
assert.equal(byLabel(checkSettlement(draft({ boxOffice: [], summary: { gross: 100000 } as Draft['summary'] }), 'USD'), 'Ticket tiers'), undefined)   // nothing to compare

// ── check 3: the promoter's cost lines add up to their printed total ──
const costs = [{ name: 'Sound', actual: 3000 }, { name: 'Staff', actual: 2000 }] as unknown as Draft['expenses']
assert.equal(byLabel(checkSettlement(draft({ expenses: costs, summary: { totalExpenses: 5000 } as Draft['summary'] }), 'USD'), "Promoter's cost")!.ok, true)
assert.equal(byLabel(checkSettlement(draft({ expenses: costs, summary: { totalExpenses: 5600 } as Draft['summary'] }), 'USD'), "Promoter's cost")!.ok, false)

// ── check 4: the balance due matches the payments ──
const pay = [{ label: 'Deposit', amount: 4000 }]
assert.equal(byLabel(checkSettlement(draft({ payments: pay, balanceDue: 6000 }), 'USD'), 'Balance due')!.ok, true)
c = checkSettlement(draft({ payments: pay, balanceDue: 5000 }), 'USD')
assert.equal(byLabel(c, 'Balance due')!.ok, false)
assert.match(byLabel(c, 'Balance due')!.detail, /\$6,000\.00 but the balance says \$5,000\.00/)
assert.equal(byLabel(checkSettlement(draft({ payments: [], balanceDue: 10000 }), 'USD'), 'Balance due'), undefined)   // nothing paid, nothing to compare
assert.equal(byLabel(checkSettlement(draft({ payments: pay }), 'USD'), 'Balance due'), undefined)                    // no printed balance

// ── check 5: a percentage-of-net deal pays the right overage ──
const netDeal = { description: 'Guarantee vs 85% of net show receipts', percentage: 85, guarantee: 10000 } as unknown as Draft['deal']
const withOverage = (overage: number, net = 20000) => draft({
  deal: netDeal, summary: { netShowReceipts: net } as Draft['summary'],
  payout: [{ kind: 'guarantee', label: 'Guarantee', amount: 10000 }, { kind: 'overage', label: 'Overage', amount: overage }], totalDue: 10000 + overage,
})
// 85% of 20,000 = 17,000, less the 10,000 guarantee = 7,000 overage
assert.equal(byLabel(checkSettlement(withOverage(7000), 'USD'), '85%')!.ok, true)
c = checkSettlement(withOverage(6000), 'USD')
assert.equal(byLabel(c, '85%')!.ok, false)
assert.match(byLabel(c, '85%')!.detail, /works out to an overage of \$7,000\.00 but the statement pays \$6,000\.00/)
assert.equal(byLabel(checkSettlement(withOverage(0, 10000), 'USD'), '85%')!.ok, true)                              // below the guarantee: no overage owed
assert.equal(byLabel(checkSettlement({ ...withOverage(7000), deal: { ...netDeal, description: 'Guarantee vs 85% of gross' } as Draft['deal'] }, 'USD'), '85%'), undefined)   // only "net" deals are checked

console.log('settlement-math checks passed')
