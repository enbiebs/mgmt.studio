'use client'
// ──────────────────────────────────────────────────────────
//  InvoicesView — Invoice tracking & creation
//  Part of the Business Manager replacement.
// ──────────────────────────────────────────────────────────

import { useState } from 'react'
import { useStore } from '@/lib/store'
import { Modal, FormField, inputClass, selectClass } from '@/components/ui/Modal'
import { addDays } from '@/lib/utils'
import type { Invoice, InvoiceStatus, Currency, RevenueStream, BankTransaction } from '@/types'

export const STATUS_CONFIG: Record<InvoiceStatus, { label: string; color: string; bg: string }> = {
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

export function isOverdue(inv: Invoice) {
  return inv.status === 'sent' && inv.dueDate < new Date().toISOString().slice(0, 10)
}

type InvFilter = 'all' | InvoiceStatus

export function InvoicesView() {
  const client = useStore(s => s.getClient())
  const editable = useStore(s => s.canEdit('finance'))
  const [filter, setFilter] = useState<InvFilter>('all')
  const [selected, setSelected] = useState<Invoice | null>(null)
  const [addOpen, setAddOpen] = useState(false)

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
  // Keep the drawer's copy of the selected invoice in sync once a bank payment gets linked to it.
  const selectedLive = selected ? invoices.find(i => i.id === selected.id) ?? null : null

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="flex items-center justify-end mb-4">
        {editable && (
          <button
            onClick={() => setAddOpen(true)}
            className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
          >
            + New invoice
          </button>
        )}
      </div>

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
      {selectedLive && (
        <InvoiceDetail invoice={selectedLive} onClose={() => setSelected(null)} />
      )}

      {addOpen && <AddInvoiceModal onClose={() => setAddOpen(false)} />}
    </div>
  )
}

function AddInvoiceModal({ onClose }: { onClose: () => void }) {
  const { addInvoice } = useStore()
  const [to, setTo] = useState('')
  const [toEmail, setToEmail] = useState('')
  const [category, setCategory] = useState<RevenueStream>('other')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [currency, setCurrency] = useState<Currency>('USD')
  const [dueDate, setDueDate] = useState(addDays(new Date().toISOString().slice(0, 10), 30))

  function handleSave() {
    const rate = Number(amount)
    if (!to.trim() || !dueDate || !rate) return
    addInvoice({
      number: 'INV-' + Date.now().toString().slice(-6),
      to: to.trim(),
      toEmail: toEmail.trim() || undefined,
      category,
      currency,
      issuedDate: new Date().toISOString().slice(0, 10),
      dueDate,
      items: [{ description: description.trim() || 'Services', quantity: 1, rate }],
    })
    onClose()
  }

  return (
    <Modal title="New invoice" onClose={onClose} footer={
      <>
        <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
        <button onClick={handleSave} className="px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600">Create draft</button>
      </>
    }>
      <FormField label="Bill to">
        <input className={inputClass} placeholder="Payee name" value={to} onChange={e => setTo(e.target.value)} autoFocus />
      </FormField>
      <FormField label="Email (optional)">
        <input className={inputClass} type="email" value={toEmail} onChange={e => setToEmail(e.target.value)} />
      </FormField>
      <FormField label="Description">
        <input className={inputClass} placeholder="What's this for?" value={description} onChange={e => setDescription(e.target.value)} />
      </FormField>
      <div className="grid grid-cols-3 gap-3">
        <FormField label="Category">
          <select className={selectClass} value={category} onChange={e => setCategory(e.target.value as RevenueStream)}>
            <option value="touring">Touring</option>
            <option value="streaming">Streaming</option>
            <option value="sync">Sync</option>
            <option value="brand">Brand</option>
            <option value="merch">Merch</option>
            <option value="other">Other</option>
          </select>
        </FormField>
        <FormField label="Amount">
          <input className={inputClass} type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)} />
        </FormField>
        <FormField label="Currency">
          <select className={selectClass} value={currency} onChange={e => setCurrency(e.target.value as Currency)}>
            <option value="USD">USD</option>
            <option value="GBP">GBP</option>
            <option value="EUR">EUR</option>
          </select>
        </FormField>
      </div>
      <FormField label="Due date">
        <input className={inputClass} type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
        <div className="text-xs text-gray-400 mt-1">Defaults to 30 days out — change if this deal has different terms.</div>
      </FormField>
    </Modal>
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
  const editable = useStore(s => s.canEdit('finance'))
  const { updateInvoiceStatus, deleteInvoice } = useStore()
  const total = invTotal(inv)
  const cfg   = STATUS_CONFIG[inv.status]

  function handleDelete() {
    if (!confirm(`Delete draft invoice ${inv.number}? This can't be undone.`)) return
    deleteInvoice(inv.id)
    onClose()
  }

  function handleVoid() {
    if (!confirm(`Void invoice ${inv.number}? It'll stay on record but won't count toward outstanding or paid totals.`)) return
    updateInvoiceStatus(inv.id, 'void')
  }

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

          {inv.status !== 'void' && inv.status !== 'draft' && <InvoicePaymentLinker invoice={inv} />}
        </div>

        {/* Status actions — one clear primary action for where this invoice is right now */}
        {editable && (inv.status === 'draft' || inv.status === 'sent' || inv.status === 'overdue') && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-2">
            {inv.status === 'draft' && (
              <>
                <button
                  onClick={() => updateInvoiceStatus(inv.id, 'sent')}
                  className="px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors"
                >
                  Mark as sent
                </button>
                <button onClick={handleDelete} className="ml-auto px-3 py-1.5 border border-red-200 text-red-500 text-sm rounded-lg hover:bg-red-50 transition-colors">
                  Delete draft
                </button>
              </>
            )}
            {(inv.status === 'sent' || inv.status === 'overdue') && (
              <button onClick={handleVoid} className="ml-auto px-3 py-1.5 border border-gray-200 text-gray-500 text-sm rounded-lg hover:bg-gray-50 transition-colors">
                Void invoice
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function InvoicePaymentLinker({ invoice: inv }: { invoice: Invoice }) {
  const client = useStore(s => s.getClient())
  const editable = useStore(s => s.canEdit('finance'))
  const { linkTransactionToInvoice } = useStore()
  const [pickerOpen, setPickerOpen] = useState(false)
  if (!client) return null

  const all = client.business.banking.transactions ?? []
  const linked: BankTransaction | undefined = all.find(t => t.invoiceId === inv.id)
  const available = all.filter(t => t.amount < 0 && !t.pending && !t.invoiceId)

  return (
    <div className="pt-3 mt-1 border-t border-gray-100">
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Bank payment</div>
      {linked ? (
        <div className="flex items-center justify-between text-xs bg-green-50 text-green-700 rounded-lg px-3 py-2">
          <span>Confirmed — {linked.merchantName ?? linked.name} · {linked.date} · {fmt(Math.abs(linked.amount), linked.currency)}</span>
          {editable && (
            <button onClick={() => linkTransactionToInvoice(linked.id, null)} className="text-green-500 hover:text-red-500 font-medium">Unlink</button>
          )}
        </div>
      ) : !editable ? (
        <div className="text-xs text-gray-400 italic px-3 py-2">No bank payment linked yet</div>
      ) : (
        <div className="relative">
          <button
            onClick={() => setPickerOpen(v => !v)}
            className="w-full text-left text-xs border border-dashed border-gray-200 rounded-lg px-3 py-2 text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors"
          >
            + Link a payment from your connected bank
          </button>
          {pickerOpen && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-canvas border border-gray-100 rounded-lg shadow-lg max-h-48 overflow-auto z-50">
              {available.length === 0 ? (
                <div className="px-3 py-2 text-[11px] text-gray-300">No unlinked incoming bank transactions</div>
              ) : available.map(t => (
                <button
                  key={t.id}
                  onClick={() => { linkTransactionToInvoice(t.id, inv.id); setPickerOpen(false) }}
                  className="flex items-center justify-between gap-3 w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors"
                >
                  <span className="truncate">{t.merchantName ?? t.name} · {t.date}</span>
                  <span className="text-gray-400 flex-shrink-0">{fmt(Math.abs(t.amount), t.currency ?? 'USD')}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
