'use client'
import { useState } from 'react'
import { useStore } from '@/lib/store'
import { fmt } from '@/lib/utils'
import { Modal, FormField, inputClass, selectClass } from '@/components/ui/Modal'
import type { RegStatus, Currency, BankTransaction } from '@/types'

const REG: Record<RegStatus, [string, string]> = {
  ok:   ['ok', 'bg-green-100 text-green-700'],
  warn: ['!',  'bg-amber-100 text-amber-700'],
  no:   ['–',  'bg-gray-100 text-gray-400'],
  q:    ['?',  'bg-gray-100 text-gray-400'],
}

// Bank income not yet linked to any work — the pool a work's picker offers.
function unlinkedIncome(transactions: BankTransaction[]) {
  return transactions.filter(t => t.amount < 0 && !t.pending && !t.catalogWorkId)
}

function TransactionLinker({ workId, currency }: { workId: string; currency: Currency }) {
  const client = useStore(s => s.getClient())
  const editable = useStore(s => s.canEdit('business'))
  const { linkTransactionToCatalogWork } = useStore()
  const [pickerOpen, setPickerOpen] = useState(false)
  if (!client) return null

  const all = client.business.banking.transactions ?? []
  const linked = all.filter(t => t.catalogWorkId === workId)
  const available = unlinkedIncome(all)
  const confirmedTotal = linked.reduce((s, t) => s + Math.abs(t.amount), 0)

  return (
    <div className="mt-2 pt-2 border-t border-gray-50">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] text-gray-400 uppercase tracking-wide mr-0.5">Confirmed via bank</span>
        {linked.length > 0 && (
          <span className="text-xs font-semibold text-green-700">{fmt(confirmedTotal, currency)}</span>
        )}
        {linked.map(t => (
          <span key={t.id} className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-green-50 text-green-700">
            {t.merchantName ?? t.name} · {t.date}
            {editable && (
              <button onClick={() => linkTransactionToCatalogWork(t.id, null)} className="text-green-400 hover:text-red-400">✕</button>
            )}
          </span>
        ))}
        {linked.length === 0 && <span className="text-[11px] text-gray-300">No bank income linked yet</span>}
        {editable && (
        <div className="relative">
          <button onClick={() => setPickerOpen(v => !v)} className="text-[10px] text-gray-400 hover:text-blue-500 font-medium px-1">+ Link</button>
          {pickerOpen && (
            <div className="absolute left-0 top-full mt-1 bg-canvas border border-gray-100 rounded-lg shadow-lg min-w-[220px] max-h-48 overflow-auto z-50">
              {available.length === 0 ? (
                <div className="px-3 py-2 text-[11px] text-gray-300">No unlinked bank income to attach</div>
              ) : available.map(t => (
                <button
                  key={t.id}
                  onClick={() => { linkTransactionToCatalogWork(t.id, workId); setPickerOpen(false) }}
                  className="flex items-center justify-between gap-3 w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors"
                >
                  <span className="truncate">{t.merchantName ?? t.name}</span>
                  <span className="text-gray-400 flex-shrink-0">{fmt(Math.abs(t.amount), t.currency ?? 'USD')}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  )
}

function AddWorkModal({ onClose }: { onClose: () => void }) {
  const { addCatalogWork } = useStore()
  const [title, setTitle] = useState('')
  const [writers, setWriters] = useState('')
  const [ipi, setIpi] = useState('')
  const [currency, setCurrency] = useState<Currency>('USD')

  function handleSave() {
    if (!title.trim() || !writers.trim()) return
    addCatalogWork({ title: title.trim(), writers: writers.trim(), ipi: ipi.trim() || undefined, currency })
    onClose()
  }

  return (
    <Modal title="Add a work" onClose={onClose} footer={
      <>
        <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
        <button onClick={handleSave} className="px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600">Add work</button>
      </>
    }>
      <FormField label="Title">
        <input className={inputClass} placeholder="Song title" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
      </FormField>
      <FormField label="Writers">
        <input className={inputClass} placeholder="e.g. Artist Name 100%" value={writers} onChange={e => setWriters(e.target.value)} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="IPI (optional)">
          <input className={inputClass} value={ipi} onChange={e => setIpi(e.target.value)} />
        </FormField>
        <FormField label="Currency">
          <select className={selectClass} value={currency} onChange={e => setCurrency(e.target.value as Currency)}>
            <option value="USD">USD</option>
            <option value="GBP">GBP</option>
            <option value="EUR">EUR</option>
          </select>
        </FormField>
      </div>
    </Modal>
  )
}

function exportCatalogCsv(clientName: string, works: { title: string; ipi?: string; writers: string; amount: number; currency: string; bmi: string; mlc: string; sx: string; ppl: string }[]) {
  const header = ['Title', 'IPI', 'Writers', 'Amount', 'Currency', 'BMI', 'MLC', 'SX', 'PPL']
  const rows = works.map(w => [w.title, w.ipi ?? '', w.writers, String(w.amount), w.currency, w.bmi, w.mlc, w.sx, w.ppl])
  const csv = [header, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${clientName.replace(/[^a-z0-9]+/gi, '-')}-catalog.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function CatalogView() {
  const client = useStore(s => s.getClient())
  const editable = useStore(s => s.canEdit('business'))
  const { deleteCatalogWork } = useStore()
  const [addOpen, setAddOpen] = useState(false)
  if (!client) return null
  const works = client.business.catalog.works

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
          Works Catalog · {works.length} works
        </div>
        <div className="flex items-center gap-2">
          {editable && (
            <button
              onClick={() => setAddOpen(true)}
              className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
            >
              + Add work
            </button>
          )}
          <button
            onClick={() => exportCatalogCsv(client.name, works)}
            disabled={works.length === 0}
            className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Export catalog
          </button>
        </div>
      </div>

      {works.length === 0 && (
        <div className="text-sm text-gray-300 text-center py-12">No works registered yet</div>
      )}

      <div className="flex flex-col gap-2">
        {works.map(w => (
          <div key={w.id} className="group border border-gray-100 rounded-xl px-4 py-3 hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{w.title}{w.ipi ? ` ${w.ipi}` : ''}</div>
                <div className="text-xs text-gray-400 mt-0.5">{w.writers}</div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                {(['bmi', 'mlc', 'sx', 'ppl'] as const).map(key => {
                  const status = w[key] as RegStatus
                  const [, cls] = REG[status]
                  return (
                    <span key={key} className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${cls}`} title={`${key.toUpperCase()}: ${status}`}>
                      {key.toUpperCase()}
                    </span>
                  )
                })}
              </div>
              <div className="font-serif font-semibold text-sm text-right flex-shrink-0 w-16">
                {w.amount > 0 ? fmt(w.amount, w.currency) : '—'}
              </div>
              {editable && (
                <button
                  onClick={() => { if (confirm(`Delete "${w.title}"? This also unlinks any bank income confirmed against it.`)) deleteCatalogWork(w.id) }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-400 text-xs flex-shrink-0"
                >
                  ✕
                </button>
              )}
            </div>
            <TransactionLinker workId={w.id} currency={w.currency} />
          </div>
        ))}
      </div>

      {addOpen && <AddWorkModal onClose={() => setAddOpen(false)} />}
    </div>
  )
}
