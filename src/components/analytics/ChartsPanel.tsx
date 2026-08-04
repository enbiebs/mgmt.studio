'use client'
import { useState } from 'react'
import type { AnalyticsData } from '@/types'
import { SectionHeader, MovementBadge, TrendChart, fmtNum } from './shared'
import { PLATFORM_COLORS } from './shared'

export function ChartsPanel({ analytics: a }: { analytics: AnalyticsData }) {
  const [platform, setPlatform] = useState<string>('all')
  const platforms = ['all', ...Array.from(new Set(a.charts.map(c => c.platform)))]
  const charts = platform === 'all' ? a.charts : a.charts.filter(c => c.platform === platform)

  return (
    <div className="p-6 space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-canvas border border-gray-100 rounded-2xl p-4 text-center">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Chart Entries</div>
          <div className="font-serif text-2xl font-semibold">{a.charts.length}</div>
        </div>
        <div className="bg-canvas border border-gray-100 rounded-2xl p-4 text-center">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Best Position</div>
          <div className="font-serif text-2xl font-semibold">
            #{Math.min(...a.charts.map(c => c.peak))}
          </div>
        </div>
        <div className="bg-canvas border border-gray-100 rounded-2xl p-4 text-center">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">New This Week</div>
          <div className="font-serif text-2xl font-semibold">
            {a.charts.filter(c => c.movement === 'new').length}
          </div>
        </div>
        <div className="bg-canvas border border-gray-100 rounded-2xl p-4 text-center">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Moving Up</div>
          <div className="font-serif text-2xl font-semibold text-green-600">
            {a.charts.filter(c => c.movement === 'up').length}
          </div>
        </div>
      </div>

      {/* Platform filter */}
      <div className="flex gap-1 flex-wrap">
        {platforms.map(p => (
          <button
            key={p}
            onClick={() => setPlatform(p)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
              platform === p ? 'bg-gray-900 text-canvas' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {p !== 'all' && (
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: PLATFORM_COLORS[p] ?? '#94a3b8' }} />
            )}
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      {/* Charts table */}
      <div className="bg-canvas border border-gray-100 rounded-2xl overflow-hidden">
        <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-x-4 px-4 py-2 border-b border-gray-50 text-[10px] font-bold uppercase tracking-widest text-gray-300">
          <span>Pos</span>
          <span>Chart</span>
          <span>Peak</span>
          <span>Move</span>
          <span className="text-right">Country</span>
          <span className="text-right">Entered</span>
        </div>
        {charts.length === 0 && (
          <div className="text-center text-sm text-gray-300 py-8">No chart entries for this platform</div>
        )}
        {charts.map(c => (
          <div
            key={c.id}
            className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-x-4 px-4 py-3 border-b border-gray-50 last:border-0 items-center hover:bg-gray-50 transition-colors"
          >
            <div className="font-serif font-bold text-lg w-8 text-center">#{c.position}</div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PLATFORM_COLORS[c.platform] ?? '#94a3b8' }} />
                <span className="font-medium text-sm">{c.chartName}</span>
              </div>
              <div className="text-xs text-gray-400 mt-0.5 ml-4">{c.platform}</div>
            </div>
            <div className="text-xs text-gray-400 text-center">Peak #{c.peak}</div>
            <div><MovementBadge movement={c.movement} amt={c.movementAmt} /></div>
            <div className="text-xs text-gray-500 text-right whitespace-nowrap">{c.country}</div>
            <div className="text-xs text-gray-400 text-right whitespace-nowrap">{c.entered.slice(5)}</div>
          </div>
        ))}
      </div>

      {/* Shazam section */}
      <div className="bg-canvas border border-gray-100 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <SectionHeader>Shazam — Daily Volume</SectionHeader>
          <div className="text-sm font-semibold">{fmtNum(a.shazamTotal)} total</div>
        </div>
        <TrendChart data={a.shazamDaily} color="#007EF5" height={100} />
        <p className="text-xs text-gray-400 mt-2">
          Shazam is a leading indicator — often spikes 2–4 weeks before streaming numbers follow.
          Watch for geographic concentration in Shazam to identify markets worth targeting.
        </p>
      </div>
    </div>
  )
}
