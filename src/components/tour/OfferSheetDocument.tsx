'use client'
// ──────────────────────────────────────────────────────────
//  OfferSheetDocument — the sheet exactly as the artist gets it. Used for the
//  manager's preview before sending and for the artist's own copy; the PDF is laid
//  out from the same rows (sheetRows / dealRows), so they can't disagree.
// ──────────────────────────────────────────────────────────

import type { OfferSheet } from '@/types'
import { sheetRows, dealGroups, pctLabel, money } from '@/lib/offer-sheet'

type SheetLike = Pick<OfferSheet, 'snapshot' | 'message'> & { version: number }

export function OfferSheetDocument({ sheet }: { sheet: SheetLike }) {
  const sn = sheet.snapshot
  return (
    <div className="border border-gray-100 rounded-xl bg-canvas p-5 text-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Offer sheet</div>
          <div className="font-serif text-xl font-medium mt-0.5">{sn.artistName}</div>
        </div>
        <div className="text-right">
          <div className="font-semibold">V{sheet.version}</div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mt-0.5">Confidential</div>
        </div>
      </div>

      {dealGroups(sn).map((group, gi) => (
        <div key={gi} className={gi === 0 ? 'mt-4 pt-4 border-t border-gray-100' : 'mt-4'}>
          {group.title && <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">{group.title}</div>}
          <dl className="grid grid-cols-[150px_1fr] gap-y-1.5">
            {group.rows.map(([label, value], i) => (
              <div key={`${label}-${i}`} className="contents">
                <dt className="text-gray-400">{label}</dt>
                <dd className="font-semibold whitespace-pre-wrap">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}

      {sheet.message && (
        <div className="mt-4 rounded-lg bg-gray-50 px-3 py-2.5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Message from your manager</div>
          <div className="whitespace-pre-wrap">{sheet.message}</div>
        </div>
      )}

      <div className="mt-5">
        <div className="flex items-center text-[10px] font-bold uppercase tracking-widest text-gray-400 pb-1.5 border-b border-gray-100">
          <span className="flex-1">{sn.lines ? 'Budget' : 'Summary'}</span>
          <span className="w-24 text-right">{sn.currency}</span>
          <span className="w-16 text-right whitespace-nowrap">% gross</span>
        </div>
        {sheetRows(sn).map((r, i) => {
          if (r.kind === 'head') {
            return <div key={i} className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mt-3 mb-0.5">{r.label}</div>
          }
          const strong = r.kind !== 'line'
          return (
            <div
              key={i}
              className={`flex items-start py-1 ${r.kind === 'total' ? 'border-t border-gray-100' : ''} ${r.kind === 'net' ? 'border-t-2 border-gray-800 mt-1.5 pt-2' : ''}`}
            >
              <div className="flex-1 pr-2">
                <div className={strong ? 'font-semibold' : ''}>{r.label}</div>
                {r.sub && <div className="text-[11px] text-gray-400">{r.sub}</div>}
              </div>
              <div className={`w-24 text-right ${strong ? 'font-semibold' : ''}`}>{r.amount === undefined ? '' : money(r.amount, sn.currency)}</div>
              <div className="w-16 text-right text-gray-400">{pctLabel(r.pct)}</div>
            </div>
          )
        })}
      </div>

      {sn.budgetNotes && (
        <div className="mt-4 rounded-lg bg-gray-50 px-3 py-2.5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Notes / assumptions</div>
          <div className="whitespace-pre-wrap">{sn.budgetNotes}</div>
        </div>
      )}
    </div>
  )
}
