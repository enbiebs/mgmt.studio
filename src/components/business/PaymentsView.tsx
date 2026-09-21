'use client'
// ──────────────────────────────────────────────────────────
//  PaymentsView — Expense & payment tracking
//  Part of the Business Manager replacement.
//  Tracks all outgoing expenses with category breakdown.
// ──────────────────────────────────────────────────────────

import { useState } from 'react'
import { useStore } from '@/lib/store'
import { expensesFromTransactions } from '@/lib/bank-rollup'
import { Modal, FormField, inputClass, selectClass } from '@/components/ui/Modal'
import type { ExpenseCategory, Currency } from '@/types'

const CAT_LABELS: Record<ExpenseCategory, string> = {
  travel:     'Travel',
  recording:  'Recording / Studio',
  marketing:  'Marketing & PR',
  legal:      'Legal',
  management: 'Management',
  equipment:  'Equipment',
  meals:      'Meals / Hospitality',
  other:      'Other',
}

const CAT_COLORS: Record<ExpenseCategory, string> = {
  travel:     '#f97316',
  recording:  '#8b5cf6',
  marketing:  '#06b6d4',
  legal:      '#ef4444',
  management: '#64748b',
  equipment:  '#14b8a6',
  meals:      '#f59e0b',
  other:      '#94a3b8',
}

function fmt(n: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function PaymentsView() {
  const client = useStore(s => s.getClient())
  const editable = useStore(s => s.canEdit('finance'))
  const updateExpense = useStore(s => s.updateExpense)
  const deleteExpense = useStore(s => s.deleteExpense)
  const [filterCat, setFilterCat] = useState<ExpenseCategory | 'all'>('all')
  const [showUnpaid, setShowUnpaid] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  if (!client) return null
  const bankExpenses = expensesFromTransactions(client.business.banking.transactions ?? [])
  const expenses = [...(client.finance?.expenses ?? []), ...bankExpenses]

  if (expenses.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400 text-sm">
        No expenses recorded
        {editable && (
          <button onClick={() => setAddOpen(true)} className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
            + Add expense
          </button>
        )}
        {addOpen && <ExpenseFormModal onClose={() => setAddOpen(false)} />}
      </div>
    )
  }

  const totalPaid   = expenses.filter(e => e.paid).reduce((s, e) => s + e.amount, 0)
  const totalUnpaid = expenses.filter(e => !e.paid).reduce((s, e) => s + e.amount, 0)
  const total       = expenses.reduce((s, e) => s + e.amount, 0)

  // Category breakdown
  const byCategory = Object.keys(CAT_LABELS).map(k => {
    const cat = k as ExpenseCategory
    const catExp = expenses.filter(e => e.category === cat)
    const sum = catExp.reduce((s, e) => s + e.amount, 0)
    return { cat, sum, count: catExp.length }
  }).filter(x => x.sum > 0).sort((a, b) => b.sum - a.sum)

  const maxCat = byCategory[0]?.sum ?? 1

  // Filter & sort
  let filtered = filterCat === 'all' ? expenses : expenses.filter(e => e.category === filterCat)
  if (showUnpaid) filtered = filtered.filter(e => !e.paid)
  const sorted = [...filtered].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="flex-1 overflow-auto p-6">
      {bankExpenses.length > 0 && (
        <div className="text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-4">
          Includes {bankExpenses.length} outgoing transactions pulled automatically from your connected bank account.
        </div>
      )}
      {editable && (
        <div className="flex justify-end mb-4">
          <button onClick={() => setAddOpen(true)} className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
            + Add expense
          </button>
        </div>
      )}
      {addOpen && <ExpenseFormModal onClose={() => setAddOpen(false)} />}
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <SCard label="Total Expenses" value={fmt(total)} color="text-gray-800" sub={`${expenses.length} line items`} />
        <SCard label="Paid" value={fmt(totalPaid)} color="text-green-700" sub={`${expenses.filter(e => e.paid).length} expenses`} />
        <SCard label="Unpaid / Pending" value={fmt(totalUnpaid)} color={totalUnpaid > 0 ? 'text-red-600' : 'text-gray-400'} sub={`${expenses.filter(e => !e.paid).length} expenses`} />
      </div>

      {/* Category breakdown */}
      <div className="border border-gray-100 rounded-xl p-5 mb-6">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4">Expenses by Category</div>
        <div className="space-y-2.5">
          {byCategory.map(({ cat, sum, count }) => (
            <div key={cat} className="flex items-center gap-3 cursor-pointer" onClick={() => setFilterCat(filterCat === cat ? 'all' : cat)}>
              <div className="w-28 text-xs text-gray-500 text-right flex-shrink-0">{CAT_LABELS[cat]}</div>
              <div className="flex-1 h-5 bg-gray-50 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${(sum / maxCat) * 100}%`,
                    background: filterCat === cat ? CAT_COLORS[cat] : CAT_COLORS[cat] + '99',
                  }}
                />
              </div>
              <div className="w-20 text-xs font-medium text-right text-gray-700">{fmt(sum)}</div>
              <div className="w-10 text-xs text-right text-gray-400">{count}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filter controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setFilterCat('all')}
            className={`px-3 py-1 rounded-full text-xs font-medium ${filterCat === 'all' ? 'bg-gray-900 text-canvas' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
          >
            All ({expenses.length})
          </button>
          {byCategory.map(({ cat, count }) => (
            <button
              key={cat}
              onClick={() => setFilterCat(filterCat === cat ? 'all' : cat)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filterCat === cat ? 'bg-gray-900 text-canvas' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
            >
              {CAT_LABELS[cat]} ({count})
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
          <input
            type="checkbox"
            checked={showUnpaid}
            onChange={e => setShowUnpaid(e.target.checked)}
            className="rounded"
          />
          Unpaid only
        </label>
      </div>

      {/* Expense list */}
      <div className="border border-gray-100 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-2 text-xs text-gray-400 font-medium">Date</th>
              <th className="text-left px-4 py-2 text-xs text-gray-400 font-medium">Description</th>
              <th className="text-left px-4 py-2 text-xs text-gray-400 font-medium">Vendor</th>
              <th className="text-left px-4 py-2 text-xs text-gray-400 font-medium">Category</th>
              <th className="text-right px-4 py-2 text-xs text-gray-400 font-medium">Amount</th>
              <th className="text-center px-4 py-2 text-xs text-gray-400 font-medium">Paid</th>
              {editable && <th className="px-4 py-2" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sorted.length === 0 && (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400 text-sm">No expenses</td></tr>
            )}
            {sorted.map(e => {
              const manual = !e.id.startsWith('bank-')
              return (
              <tr key={e.id} className={`hover:bg-gray-50 ${!e.paid ? 'bg-amber-50/30' : ''}`}>
                <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(e.date)}</td>
                <td className="px-4 py-3 font-medium text-sm">{e.description}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{e.vendor}</td>
                <td className="px-4 py-3">
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-medium text-white"
                    style={{ background: CAT_COLORS[e.category] }}
                  >
                    {CAT_LABELS[e.category]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-semibold">{fmt(e.amount, e.currency)}</td>
                <td className="px-4 py-3 text-center">
                  {manual && editable ? (
                    <button onClick={() => updateExpense(e.id, { paid: !e.paid })} className="text-xs">
                      {e.paid ? <span className="text-green-500 text-base">✓</span> : <span className="text-amber-500 font-semibold hover:text-amber-600">Pending</span>}
                    </button>
                  ) : (
                    e.paid
                      ? <span className="text-green-500 text-base">✓</span>
                      : <span className="text-amber-500 text-xs font-semibold">Pending</span>
                  )}
                </td>
                {editable && (
                  <td className="px-4 py-3 text-right">
                    {manual && (
                      <button onClick={() => deleteExpense(e.id)} className="text-xs text-red-400 hover:text-red-500">Delete</button>
                    )}
                  </td>
                )}
              </tr>
              )
            })}
          </tbody>
          {sorted.length > 0 && (
            <tfoot className="border-t border-gray-200 bg-gray-50">
              <tr>
                <td colSpan={4} className="px-4 py-2 text-right text-xs font-bold text-gray-500 uppercase tracking-wide">
                  {filterCat === 'all' ? 'Total' : CAT_LABELS[filterCat]}
                </td>
                <td className="px-4 py-2 text-right font-bold">
                  {fmt(sorted.reduce((s, e) => s + e.amount, 0))}
                </td>
                <td />
                {editable && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

function ExpenseFormModal({ onClose }: { onClose: () => void }) {
  const addExpense = useStore(s => s.addExpense)
  const [f, setF] = useState({
    description: '', vendor: '', amount: '', currency: 'USD' as Currency,
    category: 'other' as ExpenseCategory, date: new Date().toISOString().slice(0, 10), paid: false,
  })

  function handleSave() {
    if (!f.description || !f.amount) return
    addExpense({
      description: f.description, vendor: f.vendor, amount: Number(f.amount),
      currency: f.currency, category: f.category, date: f.date, paid: f.paid,
    })
    onClose()
  }

  return (
    <Modal title="Add an expense" onClose={onClose} footer={
      <>
        <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
        <button onClick={handleSave} className="px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600">Add expense</button>
      </>
    }>
      <FormField label="Description"><input type="text" className={inputClass} value={f.description} onChange={e => setF(p => ({...p, description: e.target.value}))} /></FormField>
      <FormField label="Vendor"><input type="text" className={inputClass} value={f.vendor} onChange={e => setF(p => ({...p, vendor: e.target.value}))} /></FormField>
      <FormField label="Amount"><input type="number" className={inputClass} value={f.amount} onChange={e => setF(p => ({...p, amount: e.target.value}))} /></FormField>
      <FormField label="Currency">
        <select className={selectClass} value={f.currency} onChange={e => setF(p => ({...p, currency: e.target.value as Currency}))}>
          <option value="USD">USD</option>
          <option value="GBP">GBP</option>
          <option value="EUR">EUR</option>
        </select>
      </FormField>
      <FormField label="Category">
        <select className={selectClass} value={f.category} onChange={e => setF(p => ({...p, category: e.target.value as ExpenseCategory}))}>
          {Object.entries(CAT_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </FormField>
      <FormField label="Date"><input type="date" className={inputClass} value={f.date} onChange={e => setF(p => ({...p, date: e.target.value}))} /></FormField>
      <FormField label="Paid">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.paid} onChange={e => setF(p => ({...p, paid: e.target.checked}))} className="rounded" />
          Already paid
        </label>
      </FormField>
    </Modal>
  )
}

function SCard({ label, value, color, sub }: { label: string; value: string; color: string; sub: string }) {
  return (
    <div className="border border-gray-100 rounded-xl p-4">
      <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{sub}</div>
    </div>
  )
}
