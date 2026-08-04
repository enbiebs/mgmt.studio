'use client'
// ──────────────────────────────────────────────────────────
//  AnalyticsView — Chartmetric-style analytics dashboard
//  Sub-nav: Overview · Streaming · Playlists · Social ·
//            TikTok · Audience · Charts
// ──────────────────────────────────────────────────────────

import { useStore } from '@/lib/store'
import type { AnalyticsSub } from '@/types'

import { OverviewPanel }  from './OverviewPanel'
import { StreamingPanel } from './StreamingPanel'
import { PlaylistPanel }  from './PlaylistPanel'
import { SocialPanel }    from './SocialPanel'
import { TikTokPanel }    from './TikTokPanel'
import { AudiencePanel }  from './AudiencePanel'
import { ChartsPanel }    from './ChartsPanel'

const TABS: { key: AnalyticsSub; label: string }[] = [
  { key: 'overview',  label: 'Overview'  },
  { key: 'streaming', label: 'Streaming' },
  { key: 'playlists', label: 'Playlists' },
  { key: 'social',    label: 'Social'    },
  { key: 'tiktok',    label: 'TikTok'   },
  { key: 'audience',  label: 'Audience'  },
  { key: 'charts',    label: 'Charts'    },
]

export function AnalyticsView() {
  const { analyticsSub, setAnalyticsSub } = useStore()
  const client = useStore(s => s.getClient())
  if (!client) return null
  const a = client.analytics

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Analytics sub-nav */}
      <div className="flex-shrink-0 border-b border-gray-100 px-5 flex items-center gap-1 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setAnalyticsSub(t.key)}
            className={`px-3 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              analyticsSub === t.key
                ? 'border-[#4c8df6] text-[#4c8df6]'
                : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex-shrink-0 pb-1">
          <span className="text-[10px] text-gray-300 uppercase tracking-widest">Powered by Chartmetric</span>
        </div>
      </div>

      {/* Panel */}
      <div className="flex-1 overflow-auto">
        {analyticsSub === 'overview'  && <OverviewPanel  analytics={a} color={client.color} name={client.name} />}
        {analyticsSub === 'streaming' && <StreamingPanel analytics={a} />}
        {analyticsSub === 'playlists' && <PlaylistPanel  analytics={a} />}
        {analyticsSub === 'social'    && <SocialPanel    analytics={a} />}
        {analyticsSub === 'tiktok'    && <TikTokPanel    analytics={a} />}
        {analyticsSub === 'audience'  && <AudiencePanel  analytics={a} />}
        {analyticsSub === 'charts'    && <ChartsPanel    analytics={a} />}
      </div>
    </div>
  )
}
