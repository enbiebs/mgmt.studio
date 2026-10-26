'use client'
import { useState } from 'react'
import { useStore } from '@/lib/store'
import { shareOnlyTabs, effectiveSub } from '@/lib/item-access'
import { TOUR_GROUP_LABEL, TOUR_TAB_HINT, gigChoices, groupOfSub, subForGroup, visibleTourGroups, type TourGroup } from '@/lib/tour-tabs'
import { useTourTabs } from '@/components/tour/useTourTabs'
import { NewGigModal } from '@/components/tour/NewGigModal'
import { SECTION_FOLDER, folderLabel, folderLink } from '@/lib/drive-links'
import { Icon } from '@/components/ui/Icon'

const SUBNAV: Record<string, [string, string][]> = {
  songs:     [['Tracks', 'tracks'], ['Label Copy', 'labelcopy'], ['Checklist', 'checklist'], ['Status', 'status']],
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
  const [gigOpen, setGigOpen] = useState(false)
  // A new gig is a show (Tour) or an offer (Deals & fees): the button shows to anyone who may add either.
  const canAddGig = useStore(s => gigChoices({ show: s.canEdit('tour'), offer: s.canEdit('deals') }).button)
  // Someone with no grant for this section but a shared item in it gets only
  // the tabs that show that kind of item.
  const shareOnly = useStore(s => s.isShareOnly(section))
  const allowed = shareOnly ? shareOnlyTabs(section, client ?? undefined) : undefined
  const showUnfinished = useStore(s => s.showUnfinished)
  // The Tour page is Tour (schedule side) + Deals & fees (Offers) + Finance (budgets, settlements): each person gets the tabs they have.
  const tourTabs = useTourTabs()
  // Tour shows four tabs (Shows, Offers, Money, Crew); the screens inside Shows are the steps of one show (see TourView).
  const subs: [string, string][] = section === 'tour'
    ? visibleTourGroups(tourTabs).map(g => [TOUR_GROUP_LABEL[g], g])
    : (SUBNAV[section] ?? []).filter(([, key]) => (!allowed || allowed.includes(key)) && (key !== 'lab' || showUnfinished))
  const currentTourSub = effectiveSub(tourSub, tourTabs)

  function isActive(key: string) {
    if (section === 'songs')     return effectiveSub(songsSub, allowed) === key
    if (section === 'content')   return effectiveSub(contentSub, allowed) === key
    if (section === 'finance')   return effectiveSub(bizSub, allowed) === key
    if (section === 'tour')      return groupOfSub(currentTourSub) === key
    if (section === 'analytics') return analyticsSub === key
    if (section === 'legal')     return legalSub === key
    return false
  }

  function handleClick(key: string) {
    if (section === 'songs')     setSongsSub(key as typeof songsSub)
    if (section === 'content')   setContentSub(key as typeof contentSub)
    if (section === 'finance')   setBizSub(key as typeof bizSub)
    if (section === 'tour')      setTourSub(subForGroup(key as TourGroup, currentTourSub, tourTabs) as typeof tourSub)
    if (section === 'analytics') setAnalyticsSub(key as typeof analyticsSub)
    if (section === 'legal')     setLegalSub(key as typeof legalSub)
  }

  if (subs.length === 0) return null
  const folderKey = SECTION_FOLDER[section]
  const folder = folderKey ? folderLink(client, folderKey) : undefined

  const hint = section === 'tour' ? TOUR_TAB_HINT[currentTourSub as keyof typeof TOUR_TAB_HINT] : undefined

  return (
    <>
    <div className="flex-shrink-0 flex items-stretch gap-1 px-3 md:px-6 border-b border-gray-100 overflow-x-auto no-scrollbar">
      {subs.map(([label, key]) => (
        <button
          key={key}
          onClick={() => handleClick(key)}
          aria-current={isActive(key) ? 'page' : undefined}
          className={`${section === 'tour' ? 'px-2 sm:px-3' : 'px-3'} py-2.5 -mb-px border-b-2 text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
            isActive(key)
              ? 'text-gray-900 border-accent'
              : 'text-gray-500 border-transparent hover:text-gray-900'
          }`}
        >
          {label}
        </button>
      ))}
      <div className="ml-auto flex flex-shrink-0 items-center gap-2 self-center pl-2">
        {section === 'tour' && canAddGig && (
          <button onClick={() => setGigOpen(true)} className="whitespace-nowrap rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover">
            + New gig
          </button>
        )}
        {folder && folderKey && (
          <a
            href={folder} target="_blank" rel="noopener noreferrer" title={`Open the ${folderLabel(folderKey)} folder`}
            className="flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap px-2 text-xs font-medium text-gray-500 transition-colors hover:text-accent"
          >
            <Icon name="folder" className="h-4 w-4" /> <span className="hidden sm:inline">{folderLabel(folderKey)} folder</span><span aria-hidden>↗</span>
          </a>
        )}
      </div>
      {gigOpen && <NewGigModal onClose={() => setGigOpen(false)} />}
    </div>
    {hint && <p className="flex-shrink-0 px-3 md:px-6 py-1.5 text-xs text-gray-400 border-b border-gray-100">{hint}</p>}
    </>
  )
}
