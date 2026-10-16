'use client'
// ──────────────────────────────────────────────────────────
//  Home's "Cash coming up": the next 30 and 90 days of money in and out, per company, then each artist with anything
//  expected. A person who works for several companies sees each company's money apart (never added together), and only
//  for artists whose money they may see. Tapping an artist opens their Finance → Forecast.
// ──────────────────────────────────────────────────────────

import { useMemo } from 'react'
import { useStore } from '@/lib/store'
import { Badge } from '@/components/ui/Badge'
import { fmtAmount, totalsByCurrency, windowTotals, type CurrencyTotals, type ForecastItem } from '@/lib/forecast'
import { useForecastRollup, type ForecastGroup } from '@/lib/useForecast'
import { today } from '@/lib/utils'

function Totals({ totals }: { totals: CurrencyTotals[] }) {
  if (totals.length === 0) return <span className="text-gray-400">Nothing expected</span>
  return (
    <>
      {totals.map(t => (
        <span key={t.currency} className="mr-3 tabular-nums">
          <span className="font-semibold text-green-700">+{fmtAmount(t.in, t.currency)}</span>
          {t.out > 0 && <span className="ml-1.5 text-gray-600">−{fmtAmount(t.out, t.currency)}</span>}
          <span className="ml-1 text-xs text-gray-400">{t.currency}</span>
        </span>
      ))}
    </>
  )
}

function CompanyBlock({ group, showName }: { group: ForecastGroup; showName: boolean }) {
  const openClient = useStore(s => s.openClient)
  const setSection = useStore(s => s.setSection)
  const setBizSub = useStore(s => s.setBizSub)
  const day = today()

  const windows = useMemo(() => windowTotals(group.items, day, [30, 90]), [group.items, day])
  const lateTotals = useMemo(() => totalsByCurrency(group.items.filter(i => i.late)), [group.items])
  const lateCount = group.items.filter(i => i.late).length
  const artists = useMemo(() => {
    const by = new Map<string, ForecastItem[]>()
    for (const i of group.items) by.set(i.clientId, [...(by.get(i.clientId) ?? []), i])
    return [...by.entries()].map(([id, items]) => ({ id, name: items[0].clientName, items, next30: windowTotals(items, day, [30])[0].totals, late: items.filter(i => i.late).length }))
      .sort((a, b) => b.late - a.late || a.name.localeCompare(b.name))
  }, [group.items, day])

  return (
    <div className="glass rounded-2xl border border-gray-100 px-4 py-3">
      {showName && <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">{group.name}</div>}
      <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
        {windows.map(w => (
          <div key={w.days}>
            <span className="mr-2 text-xs text-gray-500">Next {w.days} days</span>
            <Totals totals={w.totals} />
          </div>
        ))}
      </div>
      {lateCount > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-red-700">
          <Badge variant="red">{lateCount} late</Badge>
          <span>Expected before today and not recorded: {lateTotals.map(t => `${t.in > 0 ? `+${fmtAmount(t.in, t.currency)}` : ''}${t.out > 0 ? ` −${fmtAmount(t.out, t.currency)}` : ''} ${t.currency}`).join(' · ')}</span>
        </div>
      )}
      <div className="mt-2 flex flex-col divide-y divide-gray-100 border-t border-gray-100">
        {artists.map(a => (
          <button key={a.id} onClick={() => { openClient(a.id); setSection('finance'); setBizSub('forecast') }}
            className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2 text-left text-sm hover:bg-gray-50">
            <span className="min-w-0 flex-1 basis-40 truncate font-medium">{a.name}</span>
            {a.late > 0 && <Badge variant="red">{a.late} late</Badge>}
            <span className="text-xs text-gray-500">Next 30 days <Totals totals={a.next30} /></span>
            <span className="text-xs text-accent">Forecast →</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function ForecastCard() {
  const groups = useForecastRollup()
  if (groups.length === 0) return null
  return (
    <section aria-label="Cash coming up" className="mb-8">
      <div className="mb-2 font-serif text-lg font-medium leading-tight">Cash coming up</div>
      <div className="flex flex-col gap-3">
        {groups.map(g => <CompanyBlock key={g.workspaceId ?? 'company'} group={g} showName={groups.length > 1} />)}
      </div>
    </section>
  )
}
