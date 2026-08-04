'use client'
import type { AnalyticsData } from '@/types'
import { StatCard, SectionHeader, Sparkline, TrendChart, fmtNum, deltaColor, deltaArrow } from './shared'

interface Props { analytics: AnalyticsData; color: string; name: string }

const SCORE_COLOR = (s: number) =>
  s >= 80 ? '#22c55e' : s >= 60 ? '#4c8df6' : s >= 40 ? '#f59e0b' : '#94a3b8'

export function OverviewPanel({ analytics: a, color, name }: Props) {
  const sc = SCORE_COLOR(a.chartmetricScore)
  const mc = a.momentumScore >= 80 ? '#22c55e' : a.momentumScore >= 60 ? '#4c8df6' : '#f59e0b'

  return (
    <div className="p-6 space-y-6">
      {/* Score row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {/* Chartmetric Score */}
        <div className="bg-white border border-gray-100 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">CM Score</div>
          <div
            className="text-4xl font-serif font-bold"
            style={{ color: sc }}
          >
            {a.chartmetricScore.toFixed(1)}
          </div>
          <div className={`text-xs font-semibold mt-1 ${deltaColor(a.chartmetricScoreDelta)}`}>
            {deltaArrow(a.chartmetricScoreDelta)} {Math.abs(a.chartmetricScoreDelta).toFixed(1)} this month
          </div>
        </div>

        {/* Momentum */}
        <div className="bg-white border border-gray-100 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Momentum</div>
          <div className="text-4xl font-serif font-bold" style={{ color: mc }}>{a.momentumScore}</div>
          <div className="text-xs text-gray-400 mt-1">out of 100</div>
        </div>

        {/* Monthly Listeners */}
        <StatCard
          label="Monthly Listeners"
          value={fmtNum(a.streaming.monthlyListeners)}
          delta={a.streaming.monthlyListenersDelta}
          deltaPct={a.streaming.monthlyListenersPct}
          sub="vs last month"
        />

        {/* Playlists */}
        <StatCard
          label="Playlist Features"
          value={a.streaming.playlistCount.toLocaleString()}
          delta={a.streaming.playlistCountDelta}
          sub="added this month"
        />
      </div>

      {/* Follower grid */}
      <div>
        <SectionHeader>Followers Across Platforms</SectionHeader>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {([
            ['Spotify',   '🟢', a.followers.spotify,   a.followersDelta.spotify  ],
            ['Instagram', '📷', a.followers.instagram, a.followersDelta.instagram],
            ['TikTok',    '🎵', a.followers.tiktok,    a.followersDelta.tiktok   ],
            ['YouTube',   '▶️', a.followers.youtube,   a.followersDelta.youtube  ],
            ['Facebook',  '👤', a.followers.facebook,  a.followersDelta.facebook ],
            ['X',         '𝕏',  a.followers.twitter,   a.followersDelta.twitter  ],
          ] as const).map(([platform, icon, count, delta]) => (
            <div key={platform} className="bg-white border border-gray-100 rounded-xl p-3 flex items-center gap-3">
              <span className="text-lg">{icon}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] text-gray-400 font-medium">{platform}</div>
                <div className="font-semibold text-sm">{fmtNum(count as number)}</div>
              </div>
              <div className={`text-[10px] font-semibold ${deltaColor(delta as number)}`}>
                {deltaArrow(delta as number)}{fmtNum(Math.abs(delta as number))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Streaming trend */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4">
        <TrendChart
          data={a.streaming.dailyStreams}
          color={color}
          label="Daily Streams — Last 30 Days"
          height={120}
        />
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Streams"    value={fmtNum(a.streaming.totalStreams)} />
        <StatCard label="Save Estimate"    value={fmtNum(a.streaming.saveEstimate)} sub="library saves" />
        <StatCard label="TikTok Videos"    value={fmtNum(a.tiktok.ugcVideos)} sub="using sounds" />
        <StatCard label="Shazam Total"     value={fmtNum(a.shazamTotal)} sub="all-time" />
      </div>
    </div>
  )
}
