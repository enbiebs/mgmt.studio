'use client'
import type { AnalyticsData } from '@/types'
import { SectionHeader, Sparkline, fmtNum, deltaColor, deltaArrow } from './shared'
import { PLATFORM_COLORS } from './shared'

export function SocialPanel({ analytics: a }: { analytics: AnalyticsData }) {
  const social = a.social

  // Sort by followers desc
  const sorted = [...social].sort((a, b) => b.followers - a.followers)

  return (
    <div className="p-6 space-y-5">
      {/* Platform cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {sorted.map(s => {
          const pc = PLATFORM_COLORS[s.platform] ?? '#4c8df6'
          return (
            <div key={s.platform} className="bg-canvas border border-gray-100 rounded-2xl p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{s.icon}</span>
                  <div>
                    <div className="font-semibold text-sm">{s.platform}</div>
                    <div className="text-xs text-gray-400">{s.engagementRate.toFixed(1)}% engagement</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-serif text-xl font-semibold">{fmtNum(s.followers)}</div>
                  <div className={`text-xs font-semibold ${deltaColor(s.followersDelta)}`}>
                    {deltaArrow(s.followersDelta)} {fmtNum(Math.abs(s.followersDelta))} / mo
                  </div>
                </div>
              </div>

              {/* 7-day sparkline */}
              <div className="flex items-end gap-1 mb-2">
                <Sparkline data={s.weeklyGrowth} color={pc} height={36} width={160} />
                <span className="text-[10px] text-gray-300 mb-1 ml-1">7 days</span>
              </div>

              {/* Top post */}
              {s.topPost && (
                <div className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2 mt-1">
                  🏆 <span className="text-gray-600">{s.topPost}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Engagement comparison */}
      <div className="bg-canvas border border-gray-100 rounded-2xl p-5">
        <SectionHeader>Engagement Rate by Platform</SectionHeader>
        <div className="flex flex-col gap-3">
          {sorted.map(s => {
            const pc = PLATFORM_COLORS[s.platform] ?? '#4c8df6'
            const max = Math.max(...social.map(x => x.engagementRate))
            return (
              <div key={s.platform} className="flex items-center gap-3">
                <span className="text-sm w-20 flex-shrink-0">{s.platform}</span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(s.engagementRate / max) * 100}%`, background: pc }}
                  />
                </div>
                <span className="text-xs font-semibold text-gray-600 w-12 text-right">{s.engagementRate.toFixed(1)}%</span>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Engagement rate = (likes + comments + shares) / followers. Anything above 3% is strong.
        </p>
      </div>

      {/* Combined follower breakdown */}
      <div className="bg-canvas border border-gray-100 rounded-2xl p-5">
        <SectionHeader>Total Social Footprint</SectionHeader>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {sorted.map(s => (
            <div key={s.platform} className="flex items-center gap-2">
              <span className="text-lg">{s.icon}</span>
              <div>
                <div className="text-sm font-semibold">{fmtNum(s.followers)}</div>
                <div className="text-[10px] text-gray-400">{s.platform}</div>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <span className="text-lg">📊</span>
            <div>
              <div className="text-sm font-semibold">
                {fmtNum(social.reduce((sum, s) => sum + s.followers, 0))}
              </div>
              <div className="text-[10px] text-gray-400">Total across all</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
