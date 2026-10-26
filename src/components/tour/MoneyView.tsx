'use client'
// MoneyView — the Money tab: budgets (what a show will cost and earn) and settlements (the promoter's final numbers), one switch
// between them. A show's own Money step opens its budget here.

import { useStore } from '@/lib/store'
import { effectiveSub } from '@/lib/item-access'
import { BudgetView } from '@/components/tour/BudgetView'
import { SettlementsView } from '@/components/tour/SettlementsView'
import { useTourTabs } from '@/components/tour/useTourTabs'

export function MoneyView() {
  const rawSub = useStore(s => s.tourSub)
  const setTourSub = useStore(s => s.setTourSub)
  const tabs = useTourTabs()
  const sub = effectiveSub(rawSub, tabs)
  const both = tabs.includes('budget') && tabs.includes('settlements')

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {both && (
        <div className="flex-shrink-0 border-b border-gray-100 px-4 py-2.5 md:px-6">
          <div role="group" aria-label="Money" className="inline-flex p-0.5 bg-gray-100 rounded-lg text-xs font-medium">
            {([['budget', 'Budgets'], ['settlements', 'Settlements']] as const).map(([key, label]) => (
              <button
                key={key}
                aria-pressed={sub === key}
                onClick={() => setTourSub(key)}
                className={`px-3 py-1 rounded-md transition-colors ${sub === key ? 'bg-canvas shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
              >{label}</button>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        {sub === 'settlements' ? <SettlementsView /> : <BudgetView />}
      </div>
    </div>
  )
}
