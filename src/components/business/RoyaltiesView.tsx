'use client'
import { useState } from 'react'
import { useStore } from '@/lib/store'
import { fmt } from '@/lib/utils'
import { Modal, FormField, inputClass } from '@/components/ui/Modal'
import type { Currency } from '@/types'

export function RoyaltiesView() {
  const client = useStore(s => s.getClient())
  const editable = useStore(s => s.canEdit('finance'))
  const { deleteRoyaltyStream } = useStore()
  const [addOpen, setAddOpen] = useState(false)

  if (!client) return null
  const streams = client.business.royalties.streams
  const usd = streams.filter(s => s.currency === 'USD').reduce((a, b) => a + b.amount, 0)
  const gbp = streams.filter(s => s.currency === 'GBP').reduce((a, b) => a + b.amount, 0)

  return (
    <div className="flex-1 overflow-auto p-6 max-w-3xl">
      {/* Totals */}
      <div className="flex gap-4 mb-7">
        {usd > 0 && (
          <div className="bg-gray-50 rounded-2xl px-5 py-5 flex-1">
            <div className="font-serif text-3xl font-medium">{fmt(usd, 'USD')}</div>
            <div className="text-xs text-gray-400 mt-1">USD owed · statements issued</div>
          </div>
        )}
        {gbp > 0 && (
          <div className="bg-gray-50 rounded-2xl px-5 py-5 flex-1">
            <div className="font-serif text-3xl font-medium">{fmt(gbp, 'GBP')}</div>
            <div className="text-xs text-gray-400 mt-1">GBP owed · statements issued</div>
          </div>
        )}
        {usd === 0 && gbp === 0 && (
          <div className="bg-gray-50 rounded-2xl px-5 py-5 flex-1">
            <div className="font-serif text-3xl font-medium">$0</div>
            <div className="text-xs text-gray-400 mt-1">Nothing owed yet</div>
          </div>
        )}
      </div>

      {/* Streams */}
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
        Income Streams · {streams.length}
      </div>
      <div className="flex flex-col gap-2.5 mb-3">
        {streams.map(s => (
          <div key={s.id} className="group border border-gray-100 rounded-2xl p-4">
            <div className="flex items-start justify-between mb-1.5">
              <div>
                <div className="font-semibold text-sm">{s.name}</div>
                <div className="text-xs text-gray-400 mt-0.5">{s.type} · {s.period}</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="font-serif font-semibold text-lg">{fmt(s.amount, s.currency)}</div>
                {editable && (
                  <button
                    onClick={() => { if (confirm(`Remove "${s.name}"?`)) deleteRoyaltyStream(s.id) }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-400 text-xs flex-shrink-0"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700">
              Awaiting payment
            </span>
          </div>
        ))}
      </div>
      {editable && (
        <button
          onClick={() => setAddOpen(true)}
          className="text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors"
        >
          + Add income stream
        </button>
      )}

      {addOpen && <AddStreamModal onClose={() => setAddOpen(false)} />}
    </div>
  )
}

function AddStreamModal({ onClose }: { onClose: () => void }) {
  const { addRoyaltyStream } = useStore()
  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<Currency>('USD')
  const [period, setPeriod] = useState('')

  function handleAdd() {
    const n = Number(amount)
    if (!name.trim() || !n) return
    addRoyaltyStream(name.trim(), type.trim() || 'Other', n, currency, period.trim())
    onClose()
  }

  return (
    <Modal title="Add an income stream" onClose={onClose} footer={
      <>
        <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
        <button onClick={handleAdd} className="px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600">Add stream</button>
      </>
    }>
      <FormField label="Source">
        <input className={inputClass} placeholder="e.g. BMI, Defected Records" value={name} onChange={e => setName(e.target.value)} autoFocus />
      </FormField>
      <FormField label="Type">
        <input className={inputClass} placeholder="e.g. Performance, Master" value={type} onChange={e => setType(e.target.value)} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Amount">
          <input type="number" min="0" className={inputClass} value={amount} onChange={e => setAmount(e.target.value)} />
        </FormField>
        <FormField label="Currency">
          <select className={inputClass} value={currency} onChange={e => setCurrency(e.target.value as Currency)}>
            <option value="USD">USD</option>
            <option value="GBP">GBP</option>
            <option value="EUR">EUR</option>
          </select>
        </FormField>
      </div>
      <FormField label="Statement period">
        <input className={inputClass} placeholder="e.g. Dec 2025 statement" value={period} onChange={e => setPeriod(e.target.value)} />
      </FormField>
    </Modal>
  )
}
