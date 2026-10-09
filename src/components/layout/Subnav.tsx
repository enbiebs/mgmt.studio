'use client'
import { useStore } from '@/lib/store'
import { initials } from '@/lib/utils'
import { shareOnlyTabs, effectiveSub } from '@/lib/item-access'

const SUBNAV: Record<string, [string, string][]> = {
  songs:     [['Tracks', 'tracks'], ['Label Copy', 'labelcopy'], ['Checklist', 'checklist'], ['Status', 'status']],
  tour:      [['Shows', 'tour'], ['Offers', 'offers'], ['Budget', 'budget'], ['Advance', 'advance'], ['Day Sheet', 'daysheet'], ['Travel', 'travel'], ['Crew', 'crew'], ['Guests', 'guests']],
  content:   [['Manage', 'manage'], ['Studio', 'studio'], ['Lab', 'lab']],
  finance:   [['Royalties', 'royalties'], ['Banking', 'banking'], ['Catalog', 'catalog'], ['P&L', 'pl'], ['Invoices', 'invoices'], ['Payments', 'payments']],
  analytics: [['Overview', 'overview'], ['Streaming', 'streaming'], ['Playlists', 'playlists'], ['Social', 'social'], ['TikTok', 'tiktok'], ['Audience', 'audience'], ['Charts', 'charts']],
  fandom:    [['Overview', 'overview'], ['Fans', 'fans'], ['Referrals', 'referrals'], ['Messaging', 'messaging']],
  legal:     [['Contract Pipeline', 'pipeline'], ['Alerts', 'alerts'], ['Rights Register', 'register'], ['Templates', 'templates']],
}

export function Subnav() {
  const {
    section, songsSub, contentSub, bizSub, tourSub, analyticsSub, fandomSub, legalSub,
    setSongsSub, setContentSub, setBizSub, setTourSub, setAnalyticsSub, setFandomSub, setLegalSub,
  } = useStore()
  const client = useStore(s => s.getClient())
  // Someone with no grant for this section but a shared item in it gets only
  // the tabs that show that kind of item.
  const shareOnly = useStore(s => s.isShareOnly(section))
  const allowed = shareOnly ? shareOnlyTabs(section, client ?? undefined) : undefined
  // Budgets are money: management side only (Finance access, never the artist).
  const canSeeBudgets = useStore(s => s.role !== 'artist' && s.hasAccess('finance'))
  const subs = (SUBNAV[section] ?? []).filter(([, key]) => (!allowed || allowed.includes(key)) && (key !== 'budget' || canSeeBudgets))

  function isActive(key: string) {
    if (section === 'songs')     return effectiveSub(songsSub, allowed) === key
    if (section === 'content')   return effectiveSub(contentSub, allowed) === key
    if (section === 'finance')   return effectiveSub(bizSub, allowed) === key
    if (section === 'tour')      return effectiveSub(tourSub, allowed) === key
    if (section === 'analytics') return analyticsSub === key
    if (section === 'fandom')    return fandomSub === key
    if (section === 'legal')     return legalSub === key
    return false
  }

  function handleClick(key: string) {
    if (section === 'songs')     setSongsSub(key as typeof songsSub)
    if (section === 'content')   setContentSub(key as typeof contentSub)
    if (section === 'finance')   setBizSub(key as typeof bizSub)
    if (section === 'tour')      setTourSub(key as typeof tourSub)
    if (section === 'analytics') setAnalyticsSub(key as typeof analyticsSub)
    if (section === 'fandom')    setFandomSub(key as typeof fandomSub)
    if (section === 'legal')     setLegalSub(key as typeof legalSub)
  }

  if (subs.length === 0) return null

  return (
    <div className="flex-shrink-0 flex items-center gap-0.5 px-4 py-1.5 border-b border-gray-100">
      {subs.map(([label, key]) => (
        <button
          key={key}
          onClick={() => handleClick(key)}
          className={`px-2.5 py-1 rounded-lg text-sm font-medium transition-colors ${
            isActive(key)
              ? 'bg-gray-100 text-gray-900'
              : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          {label}
        </button>
      ))}

      {client && (
        <div className="ml-auto flex items-center gap-2">
          <div
            className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-white text-[9px] font-bold"
            style={{ background: client.color }}
          >
            {initials(client.name)}
          </div>
          <span className="text-sm font-medium text-gray-700">{client.name}</span>
        </div>
      )}
    </div>
  )
}
