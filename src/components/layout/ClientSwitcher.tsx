'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import { today } from '@/lib/utils'
import { isUpcomingShow } from '@/lib/date-state'
import { filterArtists, isSearching, parseRecent, pushRecent, recentArtists, RECENT_KEY, SEARCH_ABOVE } from '@/lib/recent-artists'
import { Icon } from '@/components/ui/Icon'
import { useDismiss } from './useDismiss'
import { useRosterClients } from './nav'
import { ArtistAvatar } from '@/components/ui/ArtistAvatar'

/**
 * Whose work you're looking at: "All artists" or one artist, and a quick way to move between them. Moving keeps you on the same page.
 * `rail` is the roomy card at the top of the sidebar; `compact` is the phone pill.
 */
export function ClientSwitcher({ variant }: { variant: 'rail' | 'compact' }) {
  const view = useStore(s => s.view)
  const client = useStore(s => (s.view === 'studio' ? s.getClient() : null))
  const switchScope = useStore(s => s.switchScope)
  const roster = useRosterClients()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [recent, setRecent] = useState<string[]>([])
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => { setOpen(false); setQuery('') }, [])
  useDismiss(ref, open, close)

  // Remember the artists you open (this browser only), however you got there: the list, a link, the roster page.
  const openId = client?.id
  useEffect(() => {
    if (!openId) return
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(pushRecent(parseRecent(localStorage.getItem(RECENT_KEY)), openId))) } catch { /* blocked storage: no "Recent" row, nothing else changes */ }
  }, [openId])
  function toggle() {
    if (open) { close(); return }
    // Read when the list opens, so it is always the latest.
    try { setRecent(parseRecent(localStorage.getItem(RECENT_KEY))) } catch { setRecent([]) }
    setOpen(true)
  }

  const subtitle = useMemo(() => {
    if (!client) return `${roster.length} artist${roster.length === 1 ? '' : 's'}`
    const t = today()
    const upcoming = client.tour.shows.filter(s => isUpcomingShow(s, t)).length
    const openOffers = (client.agentData?.offers ?? []).filter(o => o.status === 'inquiry' || o.status === 'hold').length
    const parts = [`${upcoming} upcoming`]
    if (openOffers > 0) parts.push(`${openOffers} offer${openOffers === 1 ? '' : 's'}`)
    return parts.join(' · ')
  }, [client, roster.length])

  const rail = variant === 'rail'
  const label = client ? client.name : 'All artists'
  const pick = (to: 'all' | string) => { switchScope(to); close() }
  const searchable = roster.length > SEARCH_ABOVE
  const typed = isSearching(query)
  const matches = useMemo(() => (searchable ? filterArtists(roster, query) : roster), [searchable, roster, query])
  const recents = useMemo(() => (typed || !searchable ? [] : recentArtists(recent, roster, openId)), [typed, searchable, recent, roster, openId])
  const row = (c: (typeof roster)[number]) => (
    <button
      key={c.id}
      role="option"
      aria-selected={c.id === client?.id}
      onClick={() => pick(c.id)}
      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors"
    >
      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c.color }} />
      <span className={`truncate ${c.id === client?.id ? 'font-semibold' : ''}`}>{c.name}</span>
      {c.isDemo && <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-50 rounded-full px-1.5">Demo</span>}
    </button>
  )

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Showing ${label}. Change artist`}
        className={rail
          ? 'flex items-center gap-2.5 w-full text-left p-2 rounded-xl border border-gray-100 bg-canvas hover:border-gray-200 transition-colors'
          : 'flex items-center gap-2 px-2.5 py-1 rounded-full bg-gray-50 border border-gray-200 text-sm font-medium hover:bg-gray-100 transition-colors'}
      >
        {client
          ? <ArtistAvatar client={client} className={rail ? 'w-8 h-8' : 'w-5 h-5'} textClass={rail ? 'text-[11px]' : 'text-[9px]'} />
          : <span className={`flex items-center justify-center rounded-full bg-gray-100 text-gray-500 flex-shrink-0 ${rail ? 'w-8 h-8' : 'w-5 h-5'}`}><Icon name="team" className={rail ? 'w-4 h-4' : 'w-3 h-3'} /></span>}
        {rail ? (
          <>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium leading-tight truncate">{label}</span>
              <span className="block text-[11px] text-gray-500 truncate">{subtitle}</span>
            </span>
            <Icon name="chevron" className="w-4 h-4 text-gray-400" />
          </>
        ) : (
          <span className="max-w-[110px] truncate">{label}</span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 min-w-full w-max max-w-[260px] bg-canvas border border-gray-100 rounded-xl shadow-lg max-h-[60vh] overflow-y-auto z-50 py-1">
          {searchable && (
            <div className="sticky top-0 z-10 bg-canvas px-2 pb-1 pt-1">
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && typed && matches.length > 0) pick(matches[0].id) }}
                placeholder="Find an artist…"
                aria-label="Find an artist"
                className="w-full rounded-lg border border-gray-200 bg-canvas px-2.5 py-1.5 text-sm outline-none focus:border-gray-300"
              />
            </div>
          )}
          <div role="listbox" aria-label="Artist">
            {!typed && (
              <button
                role="option"
                aria-selected={view !== 'studio'}
                onClick={() => pick('all')}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors"
              >
                <Icon name="team" className="w-4 h-4 text-gray-400" />
                <span className={view !== 'studio' ? 'font-semibold' : 'text-gray-500'}>All artists</span>
              </button>
            )}
            {recents.length > 0 && (
              <div role="group" aria-label="Recent">
                <div aria-hidden className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Recent</div>
                {recents.map(row)}
              </div>
            )}
            {!typed && <div className="h-px bg-gray-100 my-1" />}
            <div role="group" aria-label={recents.length > 0 ? 'A to Z' : 'Artists'}>
              {recents.length > 0 && <div aria-hidden className="px-3 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400">A to Z</div>}
              {matches.map(row)}
            </div>
          </div>
          {typed && matches.length === 0 && <div className="px-3 py-2 text-sm text-gray-400">No artist called “{query.trim()}”.</div>}
        </div>
      )}
    </div>
  )
}
