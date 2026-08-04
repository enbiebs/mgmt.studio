'use client'
import type { AnalyticsData } from '@/types'
import { StatCard, SectionHeader, TrendChart, fmtNum } from './shared'

export function TikTokPanel({ analytics: a }: { analytics: AnalyticsData }) {
  const t = a.tiktok

  return (
    <div className="p-6 space-y-6">
      {/* Top stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="UGC Videos"      value={fmtNum(t.ugcVideos)}   sub="using this sound" />
        <StatCard label="Total Views"     value={fmtNum(t.totalViews)}  sub="across all videos" />
        <StatCard label="Chart Peak"      value={`#${t.chartPeak}`}     sub="global sound chart" />
        <StatCard label="TikTok Followers" value={fmtNum(a.followers.tiktok)}
          delta={a.followersDelta.tiktok} sub="this month" />
      </div>

      {/* Trend chart */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <TrendChart
          data={t.weeklyTrend}
          color="#010101"
          label="Daily Video Views — Last 30 Days"
          height={130}
        />
        <p className="text-xs text-gray-400 mt-2">
          Spikes indicate viral moments — cross-reference with playlist additions and streaming data to see downstream impact.
        </p>
      </div>

      {/* Top creators */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <SectionHeader>Top Creators Using This Sound</SectionHeader>
        <div className="flex flex-col gap-2">
          {t.topCreators.map((c, i) => (
            <div key={c.handle} className="flex items-center gap-4 py-2 border-b border-gray-50 last:border-0">
              <div className="w-5 text-xs text-gray-300 font-mono text-center flex-shrink-0">{i + 1}</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{c.handle}</div>
                <div className="text-xs text-gray-400">{c.videos} videos</div>
              </div>
              <div className="text-sm font-semibold text-gray-700">{fmtNum(c.views)} views</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-3">
          These creators are organically amplifying the song. Consider reaching out for authentic partnerships.
        </p>
      </div>

      {/* Geographic spread */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <SectionHeader>Geographic Spread</SectionHeader>
        <div className="flex flex-col gap-2.5">
          {t.geoSpread.map(g => (
            <div key={g.country} className="flex items-center gap-3">
              <div className="text-sm text-gray-600 w-36 flex-shrink-0">{g.country}</div>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-[#010101] rounded-full" style={{ width: `${g.pct}%` }} />
              </div>
              <div className="text-xs font-medium text-gray-600 w-8 text-right">{g.pct}%</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Use geographic concentration to inform tour routing and ad targeting.
        </p>
      </div>

      {/* How to use */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-sm text-blue-800">
        <div className="font-semibold mb-1">How to read TikTok data</div>
        <ul className="text-xs space-y-1 text-blue-700">
          <li>• High UGC volume + low chart position = organic, not pushed</li>
          <li>• Spike from 1–2 creators = not yet viral, could be seeded</li>
          <li>• Geographic spread outside US = genuine international traction</li>
          <li>• Cross-reference video peaks with streaming spikes on Streaming tab</li>
        </ul>
      </div>
    </div>
  )
}
