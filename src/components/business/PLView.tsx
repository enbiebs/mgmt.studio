'use client'
// ──────────────────────────────────────────────────────────
//  PLView — Profit & Loss Dashboard
//  Replaces the need for a traditional business manager's
//  monthly P&L reporting. Shows revenue by stream, expenses
//  by category, net income, and YTD totals.
// ──────────────────────────────────────────────────────────

import { useState } from 'react'
import { useStore } from '@/lib/store'
import type { PLMonth } from '@/types'

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function fmtMonth(iso: string) {
  const [y, m] = iso.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

const REV_LABELS: Record<string, string> = {
  touring: 'Touring', streaming: 'Streaming', sync: 'Sync', brand: 'Brand Deals', merch: 'Merchandise', other: 'Other',
}
const EXP_LABELS: Record<string, string> = {
  travel: 'Travel', recording: 'Recording', marketing: 'Marketing', legal: 'Legal', management: 'Management', equipment: 'Equipment', meals: 'Meals', other: 'Other',
}

const REV_COLORS: Record<string, string> = {
  touring: '#4c8df6', streaming: '#22c55e', sync: '#a855f7', brand: '#f59e0b', merch: '#ec4899', other: '#94a3b8',
}
const EXP_COLORS: Record<string, string> = {
  travel: '#f97316', recording: '#8b5cf6', marketing: '#06b6d4', legal: '#ef4444', management: '#64748b', equipment: '#14b8a6', meals: '#f59e0b', other: '#94a3b8',
}

function totalRev(m: PLMonth) {
  return Object.values(m.revenue).reduce((a, b) => a + b, 0)
}
function totalExp(m: PLMonth) {
  return Object.values(m.expenses).reduce((a, b) => a + b, 0)
}
function netIncome(m: PLMonth) {
  return totalRev(m) - totalExp(m)
}

// Simple bar chart via inline SVG
function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 text-xs text-gray-500 text-right flex-shrink-0">{label}</div>
      <div className="flex-1 h-5 bg-gray-50 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="w-20 text-xs font-medium text-right text-gray-700">{fmt(value)}</div>
    </div>
  )
}

// Mini trend line SVG
function TrendLine({ months, getValue }: { months: PLMonth[]; getValue: (m: PLMonth) => number }) {
  const vals = months.map(getValue)
  const max = Math.max(...vals, 1)
  const min = Math.min(...vals, 0)
  const range = max - min || 1
  const W = 160, H = 40, PAD = 4
  const points = vals.map((v, i) => {
    const x = PAD + (i / Math.max(vals.length - 1, 1)) * (W - PAD * 2)
    const y = H - PAD - ((v - min) / range) * (H - PAD * 2)
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={W} height={H} className="overflow-visible">
      <polyline fill="none" stroke="#4c8df6" strokeWidth="2" strokeLinejoin="round" points={points} />
    </svg>
  )
}

export function PLView() {
  const client = useStore(s => s.getClient())
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)

  if (!client) return null
  const months = client.finance?.plMonths ?? []
  if (months.length === 0) {
    return <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">No P&L data yet</div>
  }

  const sorted = [...months].sort((a, b) => a.month.localeCompare(b.month))
  const active = sorted.find(m => m.month === selectedMonth) ?? sorted[sorted.length - 1]

  // YTD totals
  const ytdRev = sorted.reduce((s, m) => s + totalRev(m), 0)
  const ytdExp = sorted.reduce((s, m) => s + totalExp(m), 0)
  const ytdNet = ytdRev - ytdExp

  // Max values for bar charts
  const maxRev = Math.max(...Object.keys(REV_LABELS).map(k => active.revenue[k as keyof typeof active.revenue] || 0))
  const maxExp = Math.max(...Object.keys(EXP_LABELS).map(k => active.expenses[k as keyof typeof active.expenses] || 0))

  const activeRev = totalRev(active)
  const activeExp = totalExp(active)
  const activeNet = activeRev - activeExp

  return (
    <div className="flex-1 overflow-auto p-6">
      {/* YTD Summary */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <SummaryCard label="YTD Revenue" value={fmt(ytdRev)} color="text-green-700" sub={`${sorted.length} months`} />
        <SummaryCard label="YTD Expenses" value={fmt(ytdExp)} color="text-red-500" sub="All categories" />
        <SummaryCard label="YTD Net Income" value={fmt(ytdNet)} color={ytdNet >= 0 ? 'text-blue-700' : 'text-red-600'} sub={`${((ytdNet / Math.max(ytdRev, 1)) * 100).toFixed(0)}% margin`} />
        <div className="border border-gray-100 rounded-xl p-4">
          <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-2">Net Income Trend</div>
          <TrendLine months={sorted} getValue={netIncome} />
        </div>
      </div>

      {/* Month selector */}
      <div className="flex gap-1 flex-wrap mb-6">
        {sorted.map(m => (
          <button
            key={m.month}
            onClick={() => setSelectedMonth(m.month)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              m.month === active.month ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {fmtMonth(m.month)}
          </button>
        ))}
      </div>

      {/* Month detail */}
      <div className="grid grid-cols-2 gap-6">
        {/* Revenue */}
        <div className="border border-gray-100 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Revenue</div>
            <div className="text-lg font-bold text-green-700">{fmt(activeRev)}</div>
          </div>
          <div className="space-y-2.5">
            {Object.entries(REV_LABELS).map(([k, label]) => {
              const val = active.revenue[k as keyof typeof active.revenue] || 0
              if (val === 0 && maxRev > 0) return null
              return <BarRow key={k} label={label} value={val} max={maxRev} color={REV_COLORS[k]} />
            })}
          </div>
        </div>

        {/* Expenses */}
        <div className="border border-gray-100 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Expenses</div>
            <div className="text-lg font-bold text-red-500">{fmt(activeExp)}</div>
          </div>
          <div className="space-y-2.5">
            {Object.entries(EXP_LABELS).map(([k, label]) => {
              const val = active.expenses[k as keyof typeof active.expenses] || 0
              if (val === 0 && maxExp > 0) return null
              return <BarRow key={k} label={label} value={val} max={maxExp} color={EXP_COLORS[k]} />
            })}
          </div>
        </div>
      </div>

      {/* Net income for selected month */}
      <div className={`mt-4 p-4 rounded-xl border ${activeNet >= 0 ? 'border-blue-100 bg-blue-50' : 'border-red-100 bg-red-50'}`}>
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-600">Net Income — {fmtMonth(active.month)}</div>
          <div className={`text-2xl font-bold ${activeNet >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{fmt(activeNet)}</div>
        </div>
        <div className="text-xs text-gray-400 mt-1">
          Margin: {activeRev > 0 ? ((activeNet / activeRev) * 100).toFixed(0) : 0}%
          &nbsp;·&nbsp; Revenue: {fmt(activeRev)}
          &nbsp;·&nbsp; Expenses: {fmt(activeExp)}
        </div>
      </div>

      {/* Monthly summary table */}
      <div className="mt-6 border border-gray-100 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-2 text-xs text-gray-400 font-medium">Month</th>
              <th className="text-right px-4 py-2 text-xs text-gray-400 font-medium">Revenue</th>
              <th className="text-right px-4 py-2 text-xs text-gray-400 font-medium">Expenses</th>
              <th className="text-right px-4 py-2 text-xs text-gray-400 font-medium">Net Income</th>
              <th className="text-right px-4 py-2 text-xs text-gray-400 font-medium">Margin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {[...sorted].reverse().map(m => {
              const rev = totalRev(m)
              const exp = totalExp(m)
              const net = rev - exp
              const margin = rev > 0 ? ((net / rev) * 100).toFixed(0) : '—'
              const isActive = m.month === active.month
              return (
                <tr
                  key={m.month}
                  onClick={() => setSelectedMonth(m.month)}
                  className={`cursor-pointer hover:bg-gray-50 ${isActive ? 'bg-blue-50/50' : ''}`}
                >
                  <td className="px-4 py-2.5 font-medium text-sm">{fmtMonth(m.month)}</td>
                  <td className="px-4 py-2.5 text-right text-green-700">{fmt(rev)}</td>
                  <td className="px-4 py-2.5 text-right text-red-500">{fmt(exp)}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${net >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{fmt(net)}</td>
                  <td className={`px-4 py-2.5 text-right text-xs ${net >= 0 ? 'text-gray-500' : 'text-red-400'}`}>{margin}%</td>
                </tr>
              )
            })}
            {/* YTD total */}
            <tr className="bg-gray-50 border-t border-gray-200">
              <td className="px-4 py-2.5 font-bold text-xs uppercase tracking-wide text-gray-500">YTD Total</td>
              <td className="px-4 py-2.5 text-right font-bold text-green-700">{fmt(ytdRev)}</td>
              <td className="px-4 py-2.5 text-right font-bold text-red-500">{fmt(ytdExp)}</td>
              <td className={`px-4 py-2.5 text-right font-bold ${ytdNet >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{fmt(ytdNet)}</td>
              <td className="px-4 py-2.5 text-right text-xs text-gray-500">{ytdRev > 0 ? ((ytdNet / ytdRev) * 100).toFixed(0) : 0}%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, color, sub }: { label: string; value: string; color: string; sub: string }) {
  return (
    <div className="border border-gray-100 rounded-xl p-4">
      <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{sub}</div>
    </div>
  )
}
