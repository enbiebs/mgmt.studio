'use client'
import { useStore } from '@/lib/store'
import { shareOnlyTabs, effectiveSub } from '@/lib/item-access'
import { TOUR_TAB_HINT, visibleTourTabs } from '@/lib/tour-tabs'
import { SECTION_FOLDER, folderLabel, folderLink } from '@/lib/drive-links'
import { Icon } from '@/components/ui/Icon'

const SUBNAV: Record<string, [string, string][]> = {
  songs:     [['Tracks', 'tracks'], ['Label Copy', 'labelcopy'], ['Checklist', 'checklist'], ['Status', 'status']],
  tour:      [['Shows', 'tour'], ['Offers', 'offers'], ['Budget', 'budget'], ['Settlements', 'settlements'], ['Advance', 'advance'], ['Day Sheet', 'daysheet'], ['Travel', 'travel'], ['Crew', 'crew'], ['Guests', 'guests']],
  content:   [['Manage', 'manage'], ['Studio', 'studio'], ['Lab', 'lab']],
  finance:   [['Royalties', 'royalties'], ['Banking', 'banking'], ['Catalog', 'catalog'], ['P&L', 'pl'], ['Invoices', 'invoices'], ['Payments', 'payments'], ['Forecast', 'forecast']],
  analytics: [['Overview', 'overview'], ['Streaming', 'streaming'], ['Playlists', 'playlists'], ['Social', 'social'], ['TikTok', 'tiktok'], ['Audience', 'audience'], ['Charts', 'charts']],
  legal:     [['Contract Pipeline', 'pipeline'], ['Alerts', 'alerts'], ['Rights Register', 'register'], ['Templates', 'templates']],
}

export function Subnav() {
  const {
    section, songsSub, contentSub, bizSub, tourSub, analyticsSub, legalSub,
    setSongsSub, setContentSub, setBizSub, setTourSub, setAnalyticsSub, setLegalSub,
  } = useStore()
  const client = useStore(s => s.getClient())
  // Someone with no grant for this section but a shared item in it gets only
  // the tabs that show that kind of item.
  const shareOnly = useStore(s => s.isShareOnly(section))
  const allowed = shareOnly ? shareOnlyTabs(section, client ?? undefined) : undefined
  // Budgets and settlements are money: management side only (Finance access, never the artist).
  const canSeeBudgets = useStore(s => s.role !== 'artist' && s.hasAccess('finance'))
  const hasTour = useStore(s => s.hasAccess('tour'))
  const hasDeals = useStore(s => s.hasAccess('deals'))
  const showUnfinished = useStore(s => s.showUnfinished)
  // The Tour page is Tour (schedule side) + Deals & fees (Offers) + Finance (budgets, settlements): each person gets the tabs they have.
  const tourTabs = visibleTourTabs({ tour: hasTour, deals: hasDeals, finance: canSeeBudgets, sharedTabs: allowed })
  const subs = (SUBNAV[section] ?? []).filter(([, key]) => section === 'tour' ? tourTabs.includes(key) : (!allowed || allowed.includes(key)) && (key !== 'lab' || showUnfinished))

  function isActive(key: string) {
    if (section === 'songs')     return effectiveSub(songsSub, allowed) === key
    if (section === 'content')   return effectiveSub(contentSub, allowed) === key
    if (section === 'finance')   return effectiveSub(bizSub, allowed) === key
    if (section === 'tour')      return effectiveSub(tourSub, tourTabs) === key
    if (section === 'analytics') return analyticsSub === key
    if (section === 'legal')     return legalSub === key
    return false
  }

  function handleClick(key: string) {
    if (section === 'songs')     setSongsSub(key as typeof songsSub)
    if (section === 'content')   setContentSub(key as typeof contentSub)
    if (section === 'finance')   setBizSub(key as typeof bizSub)
    if (section === 'tour')      setTourSub(key as typeof tourSub)
    if (section === 'analytics') setAnalyticsSub(key as typeof analyticsSub)
    if (section === 'legal')     setLegalSub(key as typeof legalSub)
  }

  if (subs.length === 0) return null
  const folderKey = SECTION_FOLDER[section]
  const folder = folderKey ? folderLink(client, folderKey) : undefined

  const activeTourTab = section === 'tour' ? effectiveSub(tourSub, tourTabs) : undefined
  const hint = activeTourTab ? TOUR_TAB_HINT[activeTourTab as keyof typeof TOUR_TAB_HINT] : undefined

  return (
    <>
    <div className="flex-shrink-0 flex items-stretch gap-1 px-3 md:px-6 border-b border-gray-100 overflow-x-auto no-scrollbar">
      {subs.map(([label, key]) => (
        <button
          key={key}
          onClick={() => handleClick(key)}
          aria-current={isActive(key) ? 'page' : undefined}
          className={`px-3 py-2.5 -mb-px border-b-2 text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
            isActive(key)
              ? 'text-gray-900 border-accent'
              : 'text-gray-500 border-transparent hover:text-gray-900'
          }`}
        >
          {label}
        </button>
      ))}
      {folder && folderKey && (
        <a
          href={folder} target="_blank" rel="noopener noreferrer" title={`Open the ${folderLabel(folderKey)} folder`}
          className="ml-auto flex flex-shrink-0 items-center gap-1.5 self-center whitespace-nowrap px-2 text-xs font-medium text-gray-500 transition-colors hover:text-accent"
        >
          <Icon name="folder" className="h-4 w-4" /> <span className="hidden sm:inline">{folderLabel(folderKey)} folder</span><span aria-hidden>↗</span>
        </a>
      )}
    </div>
    {hint && <p className="flex-shrink-0 px-3 md:px-6 py-1.5 text-xs text-gray-400 border-b border-gray-100">{hint}</p>}
    </>
  )
}
