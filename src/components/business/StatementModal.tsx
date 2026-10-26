'use client'
// "Artist statement": pick a period, see the figures, download the PDF. The figures are worked out from what is recorded (lib/statement.ts);
// the window says so, because a statement that goes to an artist should be checked first.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Client } from '@/types'
import { useStore } from '@/lib/store'
import { today } from '@/lib/utils'
import { fmtMoney } from '@/lib/money'
import { buildStatement, periodChoices } from '@/lib/statement'
import { downloadStatementPdf } from '@/lib/statement-download'
import { notify } from '@/lib/notify'

export function StatementModal({ client, onClose }: { client: Client; onClose: () => void }) {
  const company = useStore(s => s.companyName)
  const day = today()
  const periods = periodChoices(day)
  const [key, setKey] = useState(periods[0].key)
  const [busy, setBusy] = useState(false)
  const [includeShows, setIncludeShows] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const period = periods.find(p => p.key === key) ?? periods[0]
  const statement = buildStatement(client, period, { company: company ?? '', today: day, includeShows })

  function makePdf() {
    if (busy) return
    setBusy(true)
    downloadStatementPdf(statement)
      .catch(e => { console.error(e); notify('The PDF could not be made. Please try again.') })
      .finally(() => setBusy(false))
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md space-y-4 rounded-2xl bg-canvas p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Statement for {client.name}</h2>
          <button onClick={onClose} aria-label="Close" className="text-xl leading-none text-gray-400 hover:text-gray-600">×</button>
        </div>
        <label className="block text-sm text-gray-600">
          Which period?
          <select value={key} onChange={e => setKey(e.target.value as typeof key)} className="mt-1 block w-full rounded-lg border border-gray-200 bg-canvas px-2.5 py-2 text-sm">
            {periods.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </label>

        <label className="flex items-start gap-2 text-sm text-gray-600">
          <input type="checkbox" className="mt-1 rounded" checked={includeShows} onChange={e => setIncludeShows(e.target.checked)} />
          <span>Also list each show&apos;s fee and what was taken from it<span className="block text-[11px] text-gray-400">Leave it off if the artist shouldn&apos;t see what shows pay.</span></span>
        </label>

        {statement.sections.length === 0
          ? <div className="rounded-lg bg-gray-50 px-3 py-3 text-sm text-gray-500">Nothing is recorded for {period.label}.</div>
          : (
            <div className="space-y-3">
              {statement.sections.map(s => (
                <div key={s.currency} className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
                  {statement.sections.length > 1 && <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">{s.currency}</div>}
                  <div className="flex justify-between"><span className="text-gray-500">Money in</span><span className="tabular-nums">{fmtMoney(s.incomeTotal, s.currency)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Money out</span><span className="tabular-nums">{fmtMoney(s.costsTotal, s.currency)}</span></div>
                  <div className="flex justify-between font-semibold"><span>Net</span><span className="tabular-nums">{fmtMoney(s.net, s.currency)}</span></div>
                  {s.shows.length > 0 && <div className="mt-1 text-xs text-gray-400">{s.shows.length} show{s.shows.length === 1 ? '' : 's'} · cuts taken {fmtMoney(s.showTotals.agency + s.showTotals.management, s.currency)}</div>}
                  {s.owed > 0 && <div className="mt-1 text-xs text-gray-400">Invoices still unpaid today: {fmtMoney(s.owed, s.currency)}</div>}
                </div>
              ))}
            </div>
          )}

        <p className="text-[11px] leading-snug text-gray-400">These figures come from what is recorded here. Money that was never recorded isn&apos;t in them, so look them over before the statement goes to the artist.</p>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-gray-200 py-2 text-sm font-medium hover:bg-gray-50">Close</button>
          <button onClick={makePdf} disabled={busy || statement.sections.length === 0} className="flex-1 rounded-xl bg-gray-900 py-2 text-sm font-semibold text-canvas transition-colors hover:bg-gray-700 disabled:opacity-50">{busy ? 'Making the PDF…' : 'Download PDF'}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
