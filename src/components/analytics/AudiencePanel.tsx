'use client'
import type { AnalyticsData } from '@/types'
import { SectionHeader } from './shared'

// Simple color palette for bars
const COLORS = ['#4c8df6', '#8b5cf6', '#ec4899', '#f59e0b', '#22c55e', '#06b6d4', '#f97316']

export function AudiencePanel({ analytics: a }: { analytics: AnalyticsData }) {
  const aud = a.audience

  return (
    <div className="p-6 space-y-6">
      {/* Top row: countries + cities */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Countries */}
        <div className="bg-canvas border border-gray-100 rounded-2xl p-5">
          <SectionHeader>Top Countries</SectionHeader>
          <div className="flex flex-col gap-2.5">
            {aud.topCountries.map((c, i) => (
              <div key={c.name} className="flex items-center gap-3">
                <div className="text-xs text-gray-500 w-28 truncate flex-shrink-0">{c.name}</div>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${c.pct}%`, background: COLORS[i % COLORS.length] }}
                  />
                </div>
                <div className="text-xs font-semibold text-gray-600 w-8 text-right">{c.pct}%</div>
              </div>
            ))}
          </div>
        </div>

        {/* Cities */}
        <div className="bg-canvas border border-gray-100 rounded-2xl p-5">
          <SectionHeader>Top Cities</SectionHeader>
          <div className="flex flex-col gap-2.5">
            {aud.topCities.map((c, i) => (
              <div key={`${c.name}-${i}`} className="flex items-center gap-3">
                <div className="text-xs text-gray-500 w-28 flex-shrink-0 truncate">
                  {c.name}
                  <span className="text-gray-300 ml-1">{c.country}</span>
                </div>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${c.pct}%`, background: COLORS[i % COLORS.length] }}
                  />
                </div>
                <div className="text-xs font-semibold text-gray-600 w-8 text-right">{c.pct}%</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Demographics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Age */}
        <div className="bg-canvas border border-gray-100 rounded-2xl p-5">
          <SectionHeader>Age Breakdown</SectionHeader>
          <div className="flex items-end gap-3 h-32">
            {aud.age.map((a, i) => (
              <div key={a.range} className="flex-1 flex flex-col items-center gap-1">
                <div className="text-xs font-semibold text-gray-600">{a.pct}%</div>
                <div
                  className="w-full rounded-t-md transition-all"
                  style={{
                    height: `${(a.pct / Math.max(...aud.age.map(x => x.pct))) * 80}px`,
                    background: COLORS[i % COLORS.length],
                  }}
                />
                <div className="text-[10px] text-gray-400 text-center leading-tight">{a.range}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Gender */}
        <div className="bg-canvas border border-gray-100 rounded-2xl p-5">
          <SectionHeader>Gender</SectionHeader>
          <div className="flex flex-col gap-4 mt-2">
            {aud.gender.map((g, i) => (
              <div key={g.label} className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                  style={{ background: COLORS[i % COLORS.length] }}
                >
                  {g.pct}%
                </div>
                <div>
                  <div className="font-medium text-sm">{g.label}</div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden w-40 mt-1">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${g.pct}%`, background: COLORS[i % COLORS.length] }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Insights box */}
      <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
        <div className="text-sm font-semibold text-amber-800 mb-2">How to use audience data</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-amber-700">
          <div>🗺️ <strong>Tour routing</strong> — book where the audience already is</div>
          <div>🎯 <strong>Ad targeting</strong> — match paid social to real fan locations</div>
          <div>👕 <strong>Merch</strong> — stock where demand is highest</div>
          <div>📅 <strong>Release timing</strong> — consider time zones for drops</div>
          <div>🌍 <strong>International push</strong> — validate markets before investing</div>
          <div>🎪 <strong>Festival pitching</strong> — show audience data to bookers</div>
        </div>
      </div>
    </div>
  )
}
