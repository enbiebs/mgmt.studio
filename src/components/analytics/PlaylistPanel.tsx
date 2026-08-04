'use client'
import { useState } from 'react'
import type { AnalyticsData } from '@/types'
import { SectionHeader, MovementBadge, fmtNum } from './shared'
import { PLATFORM_COLORS } from './shared'

const TYPE_BADGE: Record<string, string> = {
  editorial:   'bg-blue-50 text-blue-600',
  algorithmic: 'bg-purple-50 text-purple-600',
  user:        'bg-gray-100 text-gray-500',
}

export function PlaylistPanel({ analytics: a }: { analytics: AnalyticsData }) {
  const [filter, setFilter] = useState<'all' | 'editorial' | 'algorithmic' | 'user'>('all')

  const playlists = filter === 'all' ? a.playlists : a.playlists.filter(p => p.type === filter)
  const totFollowers = a.playlists.reduce((s, p) => s + p.followers, 0)
  const editorial = a.playlists.filter(p => p.type === 'editorial').length

  return (
    <div className="p-6 space-y-5">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-gray-100 rounded-2xl p-4 text-center">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Total Playlists</div>
          <div className="font-serif text-2xl font-semibold">{a.streaming.playlistCount.toLocaleString()}</div>
          <div className="text-xs text-green-600 font-semibold mt-0.5">+{a.streaming.playlistCountDelta} this month</div>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4 text-center">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Reach (shown)</div>
          <div className="font-serif text-2xl font-semibold">{fmtNum(totFollowers)}</div>
          <div className="text-xs text-gray-400 mt-0.5">combined followers</div>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4 text-center">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Editorial</div>
          <div className="font-serif text-2xl font-semibold">{editorial}</div>
          <div className="text-xs text-gray-400 mt-0.5">of {a.playlists.length} shown</div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-1 flex-wrap">
        {(['all', 'editorial', 'algorithmic', 'user'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === f ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Playlist table */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 px-4 py-2 border-b border-gray-50 text-[10px] font-bold uppercase tracking-widest text-gray-300">
          <span>Playlist</span>
          <span className="text-right">Followers</span>
          <span className="text-right">Pos</span>
          <span className="text-right">Move</span>
          <span className="text-right">Added</span>
        </div>
        {playlists.length === 0 && (
          <div className="text-center text-sm text-gray-300 py-8">No playlists in this category</div>
        )}
        {playlists.map(pl => (
          <div
            key={pl.id}
            className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 px-4 py-3 border-b border-gray-50 last:border-0 items-center hover:bg-gray-50 transition-colors"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PLATFORM_COLORS[pl.platform] ?? '#94a3b8' }} />
                <span className="font-medium text-sm truncate">{pl.name}</span>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${TYPE_BADGE[pl.type]}`}>
                  {pl.type.toUpperCase()}
                </span>
              </div>
              <div className="text-xs text-gray-400 mt-0.5 ml-4">
                {pl.trackTitle} · {pl.platform} · {pl.curator}
              </div>
            </div>
            <div className="text-xs text-gray-600 text-right">{fmtNum(pl.followers)}</div>
            <div className="text-sm font-semibold text-center w-8">#{pl.position}</div>
            <div className="text-right"><MovementBadge movement={pl.movement} amt={pl.movementAmt} /></div>
            <div className="text-xs text-gray-400 text-right whitespace-nowrap">{pl.dateAdded.slice(5)}</div>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400">
        Showing top playlists. Full list (all {a.streaming.playlistCount} placements) available via Chartmetric export.
      </p>
    </div>
  )
}
