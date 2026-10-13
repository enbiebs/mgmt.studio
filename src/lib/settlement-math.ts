// ──────────────────────────────────────────────────────────
//  Settlement math — the sums a settlement should satisfy, so a payout that doesn't add up
//  (or a line the reader missed) is flagged on the confirm screen instead of slipping by.
//  Pure arithmetic; runs in the browser.
// ──────────────────────────────────────────────────────────

import type { Currency, SettlementDraft } from '@/types'

export interface SettlementCheck { label: string; ok: boolean; detail: string }

const r2 = (n: number) => Math.round(n * 100) / 100

// Settlement amounts carry cents (an overage of $18,187.10), unlike the whole-dollar money() used elsewhere.
export const money2 = (amount: number, currency: Currency) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)

export const PAYOUT_KIND_LABEL: Record<import('@/types').PayoutKind, string> = {
  guarantee: 'Guarantee', overage: 'Overage', bonus: 'Bonus', buyout: 'Buyout', other_income: 'Other income',
  deposit: 'Deposit', withholding_tax: 'Withholding tax', deduction: 'Deduction',
}
const sum = (nums: number[]) => r2(nums.reduce((a, n) => a + n, 0))

type Checkable = Pick<SettlementDraft, 'boxOffice' | 'expenses' | 'summary' | 'deal' | 'payout' | 'totalDue' | 'payments' | 'balanceDue'>

export const paidSoFar = (s: Pick<SettlementDraft, 'payments'>) => sum(s.payments.map(p => p.amount))

// What is still owed: the printed balance if there is one, otherwise total due less payments.
export const balanceOf = (s: Pick<SettlementDraft, 'payments' | 'totalDue' | 'balanceDue'>) =>
  s.balanceDue ?? r2(s.totalDue - paidSoFar(s))

export function checkSettlement(s: Checkable, currency: Currency): SettlementCheck[] {
  const m = (n: number) => money2(n, currency)
  const checks: SettlementCheck[] = []

  // 1. The artist's own lines must add up to the total due - this one should always hold.
  const lines = sum(s.payout.map(l => l.amount))
  checks.push({
    label: 'Payout lines add up to the total due',
    ok: Math.abs(lines - s.totalDue) <= 0.05,
    detail: Math.abs(lines - s.totalDue) <= 0.05 ? m(lines) : `The lines add up to ${m(lines)} but the total due is ${m(s.totalDue)}`,
  })

  // 2. Ticket tiers should add up to the gross receipts.
  if (s.summary?.gross && s.boxOffice.length > 0) {
    const tiers = sum(s.boxOffice.map(b => b.gross ?? 0))
    const ok = Math.abs(tiers - s.summary.gross) <= 1
    checks.push({ label: 'Ticket tiers add up to the gross', ok, detail: ok ? m(tiers) : `Tiers add up to ${m(tiers)} but the gross is ${m(s.summary.gross)}` })
  }

  // 3. The promoter's cost lines should add up to their printed total (also catches a line the reader skipped).
  if (s.summary?.totalExpenses && s.expenses.length > 0) {
    const costs = sum(s.expenses.map(e => e.actual ?? 0))
    const ok = Math.abs(costs - s.summary.totalExpenses) <= 1
    checks.push({ label: "Promoter's cost lines add up to their total", ok, detail: ok ? m(costs) : `Lines add up to ${m(costs)} but the printed total is ${m(s.summary.totalExpenses)}` })
  }

  // 4. Payments made against what is due.
  if (s.balanceDue !== undefined && (s.payments.length > 0 || s.balanceDue !== s.totalDue)) {
    const expected = r2(s.totalDue - paidSoFar(s))
    const ok = Math.abs(expected - s.balanceDue) <= 0.05
    checks.push({ label: 'Balance due matches the payments', ok, detail: ok ? m(s.balanceDue) : `Total due less payments is ${m(expected)} but the balance says ${m(s.balanceDue)}` })
  }

  // 5. A "net vs percentage" deal: the overage should be the percentage of net show receipts above the guarantee.
  const { deal, summary } = s
  if (deal?.percentage && deal.guarantee && summary?.netShowReceipts && /net/i.test(deal.description ?? '')) {
    const expected = Math.max(0, r2((deal.percentage / 100) * summary.netShowReceipts - deal.guarantee))
    const overage = sum(s.payout.filter(l => l.kind === 'overage').map(l => l.amount))
    const ok = Math.abs(expected - overage) <= 1
    checks.push({
      label: `${deal.percentage}% of net show receipts, over the guarantee`,
      ok,
      detail: ok ? `Overage ${m(overage)}` : `The deal works out to an overage of ${m(expected)} but the statement pays ${m(overage)}`,
    })
  }
  return checks
}
