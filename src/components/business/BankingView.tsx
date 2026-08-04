'use client'
import { useStore } from '@/lib/store'
import { fmt } from '@/lib/utils'

export function BankingView() {
  const client = useStore(s => s.getClient())
  const { markDepositDone, dismissDeposit } = useStore()
  if (!client) return null

  const deposits = client.business.banking.deposits
  const pending  = deposits.filter(d => !d.done)
  const divided  = deposits.filter(d => d.done)

  return (
    <div className="flex-1 overflow-auto p-6 max-w-3xl">
      {pending.length > 0 && (
        <>
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
            Needs dividing up · {pending.length}
          </div>
          <div className="flex flex-col gap-3 mb-8">
            {pending.map(d => {
              const mgmt   = Math.round(d.amount * d.mgmt)
              const lawyer = Math.round(d.amount * d.lawyer)
              const taxes  = Math.round(d.amount * d.taxes)
              const stays  = d.amount - mgmt - lawyer - taxes
              return (
                <div key={d.id} className="border border-gray-100 rounded-2xl p-4">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="font-semibold text-sm">{d.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{d.date}</div>
                    </div>
                    <div className="font-serif font-semibold text-xl">{fmt(d.amount, d.currency)}</div>
                  </div>
                  <div className="border-t border-gray-100">
                    {[['Management', mgmt], ['Lawyer', lawyer], ['Taxes', taxes], ['Stays in Operating', stays]].map(([lbl, val]) => (
                      <div key={lbl} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0 text-sm">
                        <span className="flex-1 text-gray-500">{lbl}</span>
                        <span className="font-semibold">{fmt(val as number, d.currency)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button onClick={() => markDepositDone(d.id)} className="px-3 py-1.5 bg-blue-500 text-white text-xs font-medium rounded-lg hover:bg-blue-600 transition-colors">Mark all moved</button>
                    <button onClick={() => dismissDeposit(d.id)} className="px-3 py-1.5 border border-gray-200 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors">Dismiss</button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {divided.length > 0 && (
        <>
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
            Divided up · {divided.length}
          </div>
          <div className="flex flex-col gap-2 mb-4 opacity-60">
            {divided.map(d => (
              <div key={d.id} className="border border-gray-100 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-green-500">✓</span>
                    <span className="font-semibold text-sm">{d.name}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">{d.date}</div>
                </div>
                <div className="font-serif font-semibold text-lg">{fmt(d.amount, d.currency)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <button className="text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors">
        + Log a deposit
      </button>
    </div>
  )
}
