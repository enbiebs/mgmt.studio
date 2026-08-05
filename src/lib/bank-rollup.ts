// Turns raw connected-bank transactions into the shapes the existing P&L and
// Payments views already know how to render. Deliberately conservative:
// we can't tell from a bank line whether income was touring/streaming/sync,
// so all bank-derived revenue lands in `revenue.other` rather than guessing.
// Pending transactions are excluded — they can still change or disappear.
import type { BankTransaction, PLMonth, Expense, ExpenseCategory } from '@/types'

const EXPENSE_CATEGORY_MAP: Record<string, ExpenseCategory> = {
  TRAVEL: 'travel',
  TRANSPORTATION: 'travel',
  FOOD_AND_DRINK: 'meals',
}

function mapExpenseCategory(plaidCategory?: string): ExpenseCategory {
  return (plaidCategory && EXPENSE_CATEGORY_MAP[plaidCategory]) || 'other'
}

const EMPTY_REVENUE = { touring: 0, streaming: 0, sync: 0, brand: 0, merch: 0, other: 0 }
const EMPTY_EXPENSES = { travel: 0, recording: 0, marketing: 0, legal: 0, management: 0, equipment: 0, meals: 0, other: 0 }

export function plMonthsFromTransactions(transactions: BankTransaction[]): PLMonth[] {
  const byMonth = new Map<string, PLMonth>()
  for (const t of transactions) {
    if (t.pending) continue
    const month = t.date.slice(0, 7)
    if (!byMonth.has(month)) {
      byMonth.set(month, { month, revenue: { ...EMPTY_REVENUE }, expenses: { ...EMPTY_EXPENSES } })
    }
    const m = byMonth.get(month)!
    if (t.amount < 0) {
      m.revenue.other += Math.abs(t.amount)
    } else {
      m.expenses[mapExpenseCategory(t.category)] += t.amount
    }
  }
  return Array.from(byMonth.values())
}

export function mergePLMonths(a: PLMonth[], b: PLMonth[]): PLMonth[] {
  const map = new Map<string, PLMonth>()
  for (const m of [...a, ...b]) {
    const existing = map.get(m.month)
    if (!existing) {
      map.set(m.month, { month: m.month, revenue: { ...m.revenue }, expenses: { ...m.expenses } })
      continue
    }
    for (const k of Object.keys(m.revenue) as (keyof PLMonth['revenue'])[]) existing.revenue[k] += m.revenue[k]
    for (const k of Object.keys(m.expenses) as (keyof PLMonth['expenses'])[]) existing.expenses[k] += m.expenses[k]
  }
  return Array.from(map.values())
}

export function expensesFromTransactions(transactions: BankTransaction[]): Expense[] {
  return transactions
    .filter(t => t.amount > 0 && !t.pending)
    .map(t => ({
      id: 'bank-' + t.id,
      description: t.name,
      vendor: t.merchantName ?? t.name,
      amount: t.amount,
      currency: t.currency ?? 'USD',
      category: mapExpenseCategory(t.category),
      date: t.date,
      paid: true,
    }))
}
