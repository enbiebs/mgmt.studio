'use client'
// ──────────────────────────────────────────────────────────
//  SettlementSections — the read-only pieces of a settlement, used by both the confirm
//  screen and the saved detail view: your payout, ticket sales, the promoter's costs
//  (folded away until opened) and the arithmetic checks.
// ──────────────────────────────────────────────────────────

import type { Currency, PayoutLine, SettlementDraft } from '@/types'
import { checkSettlement, money2, PAYOUT_KIND_LABEL } from '@/lib/settlement-math'

const th = 'text-[10px] font-bold uppercase tracking-widest text-gray-400 py-1.5'

// A section that opens and closes: the "see it high level, or open it up" pattern.
export function Fold({ title, hint, defaultOpen, children }: { title: string; hint?: string; defaultOpen?: boolean; children: React.ReactNode }) {
  return (
    <details open={defaultOpen} className="group border border-gray-100 rounded-xl">
      <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none list-none">
        <span className="text-gray-300 group-open:rotate-90 transition-transform text-xs">▶</span>
        <span className="text-sm font-semibold">{title}</span>
        {hint && <span className="text-xs text-gray-400 ml-auto">{hint}</span>}
      </summary>
      <div className="px-3 pb-3">{children}</div>
    </details>
  )
}

export function PayoutTable({ payout, totalDue, currency }: { payout: PayoutLine[]; totalDue: number; currency: Currency }) {
  return (
    <table className="w-full text-sm">
      <thead><tr className="border-b border-gray-100"><th className={`${th} text-left`}>Line</th><th className={`${th} text-left`}>Type</th><th className={`${th} text-right`}>Amount</th></tr></thead>
      <tbody>
        {payout.map((l, i) => (
          <tr key={i} className="border-b border-gray-50">
            <td className="py-1.5">{l.label}</td>
            <td className="py-1.5 text-xs text-gray-400">{PAYOUT_KIND_LABEL[l.kind]}</td>
            <td className={`py-1.5 text-right tabular-nums ${l.amount < 0 ? 'text-red-500' : ''}`}>{money2(l.amount, currency)}</td>
          </tr>
        ))}
        <tr>
          <td className="pt-2 font-semibold" colSpan={2}>Total due to the artist</td>
          <td className="pt-2 text-right font-semibold tabular-nums">{money2(totalDue, currency)}</td>
        </tr>
      </tbody>
    </table>
  )
}

export function TicketTable({ tiers, currency }: { tiers: SettlementDraft['boxOffice']; currency: Currency }) {
  const multiShow = new Set(tiers.map(t => t.show ?? '')).size > 1
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100">
            {multiShow && <th className={`${th} text-left`}>Show</th>}
            <th className={`${th} text-left`}>Ticket type</th>
            <th className={`${th} text-right`}>Sold</th><th className={`${th} text-right`}>Comps</th>
            <th className={`${th} text-right`}>Price</th><th className={`${th} text-right`}>Gross</th>
          </tr>
        </thead>
        <tbody>
          {tiers.map((t, i) => (
            <tr key={i} className="border-b border-gray-50">
              {multiShow && <td className="py-1 text-gray-400">{t.show}</td>}
              <td className="py-1">{t.tier}</td>
              <td className="py-1 text-right tabular-nums">{t.sold?.toLocaleString('en-US') ?? ''}</td>
              <td className="py-1 text-right tabular-nums text-gray-400">{t.comps?.toLocaleString('en-US') ?? ''}</td>
              <td className="py-1 text-right tabular-nums text-gray-400">{t.price !== undefined ? money2(t.price, currency) : ''}</td>
              <td className="py-1 text-right tabular-nums">{t.gross !== undefined ? money2(t.gross, currency) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// The promoter's own costs, grouped as printed: budget vs actual, with their notes.
export function PromoterCosts({ expenses, currency }: { expenses: SettlementDraft['expenses']; currency: Currency }) {
  const groups = new Map<string, SettlementDraft['expenses']>()
  for (const e of expenses) groups.set(e.group, [...(groups.get(e.group) ?? []), e])
  return (
    <div className="space-y-3">
      <div className="text-[11px] text-gray-400">These are the promoter&apos;s costs for putting on the show, used to work out net show receipts. They aren&apos;t your costs.</div>
      {[...groups.entries()].map(([group, lines]) => {
        const budget = lines.reduce((a, l) => a + (l.budget ?? 0), 0)
        const actual = lines.reduce((a, l) => a + (l.actual ?? 0), 0)
        return (
          <details key={group} className="group border border-gray-50 rounded-lg">
            <summary className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer select-none list-none text-xs">
              <span className="text-gray-300 group-open:rotate-90 transition-transform">▶</span>
              <span className="font-semibold">{group}</span>
              <span className="text-gray-400">{lines.length} line{lines.length === 1 ? '' : 's'}</span>
              <span className="ml-auto tabular-nums text-gray-400">budget {money2(budget, currency)}</span>
              <span className="tabular-nums font-semibold">{money2(actual, currency)}</span>
            </summary>
            <table className="w-full text-xs mb-1.5">
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-t border-gray-50">
                    <td className="py-1 pl-6">{l.label}{l.note && <span className="text-gray-400"> · {l.note}</span>}</td>
                    <td className="py-1 text-right tabular-nums text-gray-400 w-28">{l.budget !== undefined ? money2(l.budget, currency) : ''}</td>
                    <td className="py-1 pr-2.5 text-right tabular-nums w-28">{l.actual !== undefined ? money2(l.actual, currency) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )
      })}
    </div>
  )
}

export function Checks({ settlement, currency }: { settlement: Parameters<typeof checkSettlement>[0]; currency: Currency }) {
  const checks = checkSettlement(settlement, currency)
  return (
    <div className="space-y-1">
      {checks.map(c => (
        <div key={c.label} className="flex items-start gap-2 text-xs">
          <span className={`mt-px font-bold ${c.ok ? 'text-green-600' : 'text-amber-600'}`}>{c.ok ? '✓' : '!'}</span>
          <div>
            <span className={c.ok ? '' : 'font-semibold text-amber-700'}>{c.label}</span>
            <span className="text-gray-400"> · {c.detail}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
