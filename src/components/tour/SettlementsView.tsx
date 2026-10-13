'use client'
// ──────────────────────────────────────────────────────────
//  SettlementsView — Tour sub-tab: every settlement received, what is still owed on each,
//  and the past shows that haven't been settled yet. Management side only.
// ──────────────────────────────────────────────────────────

import { useState } from 'react'
import { useStore } from '@/lib/store'
import { SettlementUploadModal } from '@/components/tour/SettlementUploadModal'
import { SettlementDetail } from '@/components/tour/SettlementDetail'
import { money2, paidSoFar } from '@/lib/settlement-math'
import { settlementEarned } from '@/lib/budget'
import { today as localToday } from '@/lib/utils'

const dateText = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export function SettlementsView() {
  const client = useStore(s => s.getClient())
  const editable = useStore(s => s.canEdit('finance'))
  const [adding, setAdding] = useState<{ showId?: string } | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  if (!client) return null

  const settlements = [...(client.finance.settlements ?? [])].sort((a, b) => (b.preparedOn ?? b.confirmedAt).localeCompare(a.preparedOn ?? a.confirmedAt))
  const settledShowIds = new Set(settlements.flatMap(s => s.showIds))
  const today = localToday()
  const waiting = client.tour.shows
    .filter(s => s.status === 'confirmed' && s.date < today && !settledShowIds.has(s.id))
    .sort((a, b) => b.date.localeCompare(a.date))

  // Money still owed, per currency (never added across currencies).
  const owed = new Map<string, number>()
  for (const s of settlements) {
    const balance = s.balanceDue ?? s.totalDue - paidSoFar(s)
    if (balance > 0.005) owed.set(s.currency, (owed.get(s.currency) ?? 0) + balance)
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-end justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">After the show</div>
          <h2 className="text-xl font-semibold">{client.name} — Settlements</h2>
        </div>
        <div className="flex items-end gap-4">
          <div className="text-right">
            <div className={`text-lg font-bold ${owed.size > 0 ? 'text-amber-700' : 'text-green-700'}`}>
              {owed.size === 0 ? '$0' : [...owed.entries()].map(([cur, n]) => money2(n, cur as 'USD' | 'GBP' | 'EUR')).join(' + ')}
            </div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">Still owed to you</div>
          </div>
          {editable && (
            <button onClick={() => setAdding({})} className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors">+ Add settlement</button>
          )}
        </div>
      </div>

      <div className="p-6 max-w-3xl space-y-8">
        {waiting.length > 0 && (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Waiting for a settlement</div>
            <div className="space-y-1.5">
              {waiting.map(s => (
                <div key={s.id} className="flex items-center gap-3 border border-dashed border-gray-200 rounded-xl px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{s.venue}</div>
                    <div className="text-xs text-gray-400">{s.city} · {dateText(s.date)}</div>
                  </div>
                  {editable && <button onClick={() => setAdding({ showId: s.id })} className="text-xs text-blue-500 hover:underline">Add its settlement →</button>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Settlements</div>
          {settlements.length === 0 && (
            <div className="border-2 border-dashed border-gray-100 rounded-xl p-8 text-center text-sm text-gray-300">
              No settlements yet. Add one when a promoter sends it: the app reads it, you check it, and the show&apos;s real income replaces the budgeted number.
            </div>
          )}
          <div className="space-y-2">
            {settlements.map(st => {
              const balance = st.balanceDue ?? st.totalDue - paidSoFar(st)
              const shows = st.showIds.map(id => client.tour.shows.find(s => s.id === id)).filter((x): x is NonNullable<typeof x> => !!x)
              return (
                <button key={st.id} onClick={() => setOpenId(st.id)} className="w-full text-left border border-gray-100 rounded-xl p-4 bg-canvas hover:shadow-sm transition-shadow">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm">{st.venue ?? st.eventName ?? 'Settlement'}</div>
                      <div className="text-xs text-gray-400">
                        {shows.length > 0 ? shows.map(s => dateText(s.date)).join(' · ') : 'No show linked'}
                        {st.promoter ? ` · ${st.promoter}` : ''}
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 ${balance > 0.005 ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`}>
                      {balance > 0.005 ? `Balance due ${money2(balance, st.currency)}` : 'Paid in full'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-xs">
                    <span><span className="text-gray-400">Earned</span> <span className="font-semibold">{money2(settlementEarned(st), st.currency)}</span></span>
                    <span><span className="text-gray-400">Total due</span> <span className="font-semibold">{money2(st.totalDue, st.currency)}</span></span>
                    {st.attendance?.sold ? <span><span className="text-gray-400">Tickets</span> <span className="font-semibold">{st.attendance.sold.toLocaleString('en-US')}</span></span> : null}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {adding && <SettlementUploadModal presetShowId={adding.showId} onClose={() => setAdding(null)} />}
      {openId && <SettlementDetail settlementId={openId} onClose={() => setOpenId(null)} />}
    </div>
  )
}
