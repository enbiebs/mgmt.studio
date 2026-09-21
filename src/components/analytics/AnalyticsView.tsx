'use client'
// ──────────────────────────────────────────────────────────
//  AnalyticsView — Chartmetric-style analytics dashboard
//  Sub-nav: Overview · Streaming · Playlists · Social ·
//            TikTok · Audience · Charts
// ──────────────────────────────────────────────────────────

import { useStore } from '@/lib/store'

import { OverviewPanel }  from './OverviewPanel'
import { StreamingPanel } from './StreamingPanel'
import { PlaylistPanel }  from './PlaylistPanel'
import { SocialPanel }    from './SocialPanel'
import { TikTokPanel }    from './TikTokPanel'
import { AudiencePanel }  from './AudiencePanel'
import { ChartsPanel }    from './ChartsPanel'

export function AnalyticsView() {
  const analyticsSub = useStore(s => s.analyticsSub)
  const client = useStore(s => s.getClient())
  if (!client) return null
  const a = client.analytics

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
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
