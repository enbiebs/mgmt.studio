'use client'
import type { AnalyticsData } from '@/types'
import { StatCard, SectionHeader, TrendChart, BarChart, fmtNum, deltaColor, deltaArrow } from './shared'
import { PLATFORM_COLORS } from './shared'

export function StreamingPanel({ analytics: a }: { analytics: AnalyticsData }) {
  const s = a.streaming

  return (
    <div className="p-6 space-y-6">
      {/* Top stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Monthly Listeners"
          value={fmtNum(s.monthlyListeners)}
          delta={s.monthlyListenersDelta}
          deltaPct={s.monthlyListenersPct}
        />
        <StatCard label="Total Streams"    value={fmtNum(s.totalStreams)}   sub="all-time" />
        <StatCard label="Save Estimate"    value={fmtNum(s.saveEstimate)}   sub="library saves" />
        <StatCard
          label="Playlist Features"
          value={s.playlistCount.toLocaleString()}
          delta={s.playlistCountDelta}
          sub="this month"
        />
      </div>

      {/* Daily streams chart */}
      <div className="bg-canvas border border-gray-100 rounded-2xl p-5">
        <TrendChart
          data={s.dailyStreams}
          color="#4c8df6"
          label="Daily Streams — Last 30 Days"
          height={140}
        />
      </div>

      {/* DSP Breakdown */}
      <div className="bg-canvas border border-gray-100 rounded-2xl p-5">
        <SectionHeader>Streams by Platform</SectionHeader>
        <div className="space-y-3">
          {s.dspBreakdown.map(dsp => (
            <div key={dsp.name} className="flex items-center gap-4">
              <div className="w-24 text-sm text-gray-600 flex-shrink-0 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PLATFORM_COLORS[dsp.name] ?? '#94a3b8' }} />
                {dsp.name}
              </div>
              <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${dsp.pct}%`, background: PLATFORM_COLORS[dsp.name] ?? '#4c8df6' }}
                />
              </div>
              <div className="text-xs text-gray-500 w-20 text-right flex-shrink-0">
                {fmtNum(dsp.streams)} <span className="text-gray-300">({dsp.pct}%)</span>
              </div>
            </div>
          ))}
        </div>

        {/* Donut-style summary */}
        <div className="mt-4 pt-4 border-t border-gray-50 flex flex-wrap gap-3">
          {s.dspBreakdown.slice(0, 3).map(dsp => (
            <div key={dsp.name} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: PLATFORM_COLORS[dsp.name] ?? '#94a3b8' }} />
              <span className="text-xs text-gray-500">{dsp.name} <strong className="text-gray-700">{dsp.pct}%</strong></span>
            </div>
          ))}
        </div>
      </div>

      {/* Shazam trend */}
      <div className="bg-canvas border border-gray-100 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <SectionHeader>Shazam Trend</SectionHeader>
          <span className="text-sm font-medium text-gray-600">{fmtNum(a.shazamTotal)} total</span>
        </div>
        <TrendChart data={a.shazamDaily} color="#007EF5" height={100} />
        <p className="text-xs text-gray-400 mt-2">
          Shazam volume is often an early indicator of a song gaining traction before streaming numbers follow.
        </p>
      </div>
    </div>
  )
}
