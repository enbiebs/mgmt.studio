'use client'
import { useStore } from '@/lib/store'
import { fmt } from '@/lib/utils'

export function RoyaltiesView() {
  const client = useStore(s => s.getClient())
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
          <div key={s.id} className="border border-gray-100 rounded-2xl p-4">
            <div className="flex items-start justify-between mb-1.5">
              <div>
                <div className="font-semibold text-sm">{s.name}</div>
                <div className="text-xs text-gray-400 mt-0.5">{s.type} · {s.period}</div>
              </div>
              <div className="font-serif font-semibold text-lg">{fmt(s.amount, s.currency)}</div>
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700">
              Awaiting payment
            </span>
          </div>
        ))}
      </div>
      <button className="text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors">
        + Add income stream
      </button>
    </div>
  )
}
