'use client'
import { useStore } from '@/lib/store'
import { fmt } from '@/lib/utils'
import type { RegStatus } from '@/types'

const REG: Record<RegStatus, [string, string]> = {
  ok:   ['ok', 'bg-green-100 text-green-700'],
  warn: ['!',  'bg-amber-100 text-amber-700'],
  no:   ['–',  'bg-gray-100 text-gray-400'],
  q:    ['?',  'bg-gray-100 text-gray-400'],
}

export function CatalogView() {
  const client = useStore(s => s.getClient())
  if (!client) return null
  const works = client.business.catalog.works

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
          Works Catalog · {works.length} works
        </div>
        <button className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors">
          Export catalog
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {works.map(w => (
          <div key={w.id} className="border border-gray-100 rounded-xl px-4 py-3 flex items-center gap-4 hover:bg-gray-50 transition-colors cursor-pointer">
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
          </div>
        ))}
      </div>
    </div>
  )
}
