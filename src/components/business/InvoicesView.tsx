'use client'
// ──────────────────────────────────────────────────────────
//  InvoicesView — Invoice tracking & creation
//  Part of the Business Manager replacement.
// ──────────────────────────────────────────────────────────

import { useState } from 'react'
import { useStore } from '@/lib/store'
import type { Invoice, InvoiceStatus } from '@/types'

const STATUS_CONFIG: Record<InvoiceStatus, { label: string; color: string; bg: string }> = {
  draft:   { label: 'Draft',   color: 'text-gray-500',  bg: 'bg-gray-100'  },
  sent:    { label: 'Sent',    color: 'text-blue-700',  bg: 'bg-blue-50'   },
  paid:    { label: 'Paid',    color: 'text-green-700', bg: 'bg-green-50'  },
  overdue: { label: 'Overdue', color: 'text-red-600',   bg: 'bg-red-50'    },
  void:    { label: 'Void',    color: 'text-gray-400',  bg: 'bg-gray-50'   },
}

const CAT_LABELS: Record<string, string> = {
  touring: 'Touring', streaming: 'Streaming', sync: 'Sync', brand: 'Brand', merch: 'Merch', other: 'Other',
}

function invTotal(inv: Invoice) {
  return inv.items.reduce((s, i) => s + i.quantity * i.rate, 0)
}

function fmt(n: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function isOverdue(inv: Invoice) {
  return inv.status === 'sent' && inv.dueDate < new Date().toISOString().slice(0, 10)
}

type InvFilter = 'all' | InvoiceStatus

export function InvoicesView() {
  const client = useStore(s => s.getClient())
  const [filter, setFilter] = useState<InvFilter>('all')
  const [selected, setSelected] = useState<Invoice | null>(null)

  if (!client) return null
  const invoices = (client.finance?.invoices ?? []).map(inv =>
    isOverdue(inv) ? { ...inv, status: 'overdue' as const } : inv
  )

  const outstanding = invoices.filter(i => i.status === 'sent' || i.status === 'overdue')
  const overdue     = invoices.filter(i => i.status === 'overdue')
  const totalPaid   = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + invTotal(i), 0)
  const totalOut    = outstanding.reduce((s, i) => s + invTotal(i), 0)
  const totalOverdue= overdue.reduce((s, i) => s + invTotal(i), 0)

  const filtered = filter === 'all' ? invoices : invoices.filter(i => i.status === filter)
  const sorted   = [...filtered].sort((a, b) => b.issuedDate.localeCompare(a.issuedDate))

  return (
    <div className="flex-1 overflow-auto p-6">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <SCard label="Total Paid (YTD)" value={fmt(totalPaid)} color="text-green-700" count={invoices.filter(i => i.status === 'paid').length} />
        <SCard label="Outstanding" value={fmt(totalOut)} color="text-blue-700" count={outstanding.length} />
        <SCard label="Overdue" value={fmt(totalOverdue)} color={totalOverdue > 0 ? 'text-red-600' : 'text-gray-400'} count={overdue.length} />
        <SCard label="Total Invoices" value={String(invoices.length)} color="text-gray-700" count={invoices.filter(i => i.status === 'draft').length + ' drafts'} />
      </div>

      {/* Filter bar */}
      <div className="flex gap-1 mb-4">
        {(['all', 'draft', 'sent', 'overdue', 'paid', 'void'] as const).map(f => {
          const count = f === 'all' ? invoices.length : invoices.filter(i => i.status === f).length
          const cfg = f === 'all' ? null : STATUS_CONFIG[f]
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filter === f
                  ? 'bg-gray-900 text-canvas'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {f === 'all' ? 'All' : STATUS_CONFIG[f].label} ({count})
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div className="border border-gray-100 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-2 text-xs text-gray-400 font-medium">#</th>
              <th className="text-left px-4 py-2 text-xs text-gray-400 font-medium">To</th>
              <th className="text-left px-4 py-2 text-xs text-gray-400 font-medium">Category</th>
              <th className="text-left px-4 py-2 text-xs text-gray-400 font-medium">Issued</th>
              <th className="text-left px-4 py-2 text-xs text-gray-400 font-medium">Due</th>
              <th className="text-right px-4 py-2 text-xs text-gray-400 font-medium">Amount</th>
              <th className="text-left px-4 py-2 text-xs text-gray-400 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sorted.length === 0 && (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400 text-sm">No invoices</td></tr>
            )}
            {sorted.map(inv => {
              const total = invTotal(inv)
              const cfg   = STATUS_CONFIG[inv.status]
              return (
                <tr
                  key={inv.id}
                  onClick={() => setSelected(inv)}
                  className={`cursor-pointer hover:bg-gray-50 ${inv.status === 'overdue' ? 'bg-red-50/30' : ''}`}
                >
                  <td className="px-4 py-3 text-xs text-gray-400 font-mono">{inv.number}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{inv.to}</div>
                    {inv.toEmail && <div className="text-xs text-gray-400">{inv.toEmail}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{CAT_LABELS[inv.category] || inv.category}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(inv.issuedDate)}</td>
                  <td className={`px-4 py-3 text-xs ${inv.status === 'overdue' ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                    {fmtDate(inv.dueDate)}
                    {inv.status === 'overdue' && <div className="text-[10px]">OVERDUE</div>}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{fmt(total, inv.currency)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${cfg.bg} ${cfg.color}`}>
                      {cfg.label}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Invoice detail drawer */}
      {selected && (
        <InvoiceDetail invoice={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}

function SCard({ label, value, color, count }: { label: string; value: string; color: string; count: number | string }) {
  return (
    <div className="border border-gray-100 rounded-xl p-4">
      <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{count}</div>
    </div>
  )
}

function InvoiceDetail({ invoice: inv, onClose }: { invoice: Invoice; onClose: () => void }) {
  const total = invTotal(inv)
  const cfg   = STATUS_CONFIG[inv.status]
  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="bg-canvas rounded-2xl shadow-xl w-full max-w-lg overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-start justify-between">
          <div>
            <div className="font-mono text-xs text-gray-400 mb-1">{inv.number}</div>
            <div className="font-bold text-lg">{inv.to}</div>
            {inv.toEmail && <div className="text-sm text-gray-400">{inv.toEmail}</div>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Status</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Category</span>
            <span className="font-medium">{CAT_LABELS[inv.category]}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Issued</span>
            <span>{fmtDate(inv.issuedDate)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Due</span>
            <span className={inv.status === 'overdue' ? 'text-red-600 font-semibold' : ''}>{fmtDate(inv.dueDate)}</span>
          </div>
          {inv.paidDate && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Paid</span>
              <span className="text-green-700">{fmtDate(inv.paidDate)}</span>
            </div>
          )}

          {/* Line items */}
          <div className="border border-gray-100 rounded-xl overflow-hidden mt-2">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2 text-gray-400 font-medium">Description</th>
                  <th className="text-right px-3 py-2 text-gray-400 font-medium">Qty</th>
                  <th className="text-right px-3 py-2 text-gray-400 font-medium">Rate</th>
                  <th className="text-right px-3 py-2 text-gray-400 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {inv.items.map((item, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2">{item.description}</td>
                    <td className="px-3 py-2 text-right">{item.quantity}</td>
                    <td className="px-3 py-2 text-right">{fmt(item.rate, inv.currency)}</td>
                    <td className="px-3 py-2 text-right font-medium">{fmt(item.quantity * item.rate, inv.currency)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-gray-200 bg-gray-50">
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-right font-bold text-sm text-gray-600">Total</td>
                  <td className="px-3 py-2 text-right font-bold text-sm">{fmt(total, inv.currency)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {inv.notes && <div className="text-xs text-gray-400 italic">{inv.notes}</div>}
        </div>
      </div>
    </div>
  )
}
