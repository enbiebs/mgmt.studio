'use client'
import { useEffect, useSyncExternalStore } from 'react'
import { useStore } from '@/lib/store'
import { useTodayBadge } from '@/lib/useInbox'
import { SHOW_UNFINISHED_KEY, analyticsHasData } from '@/lib/unfinished'
import { ARTIST_SIDE_NAME, PRODUCT_NAME } from '@/lib/brand'
import { BrandMark, Icon } from '@/components/ui/Icon'
import { ClientSwitcher } from './ClientSwitcher'
import { OPEN_COMMAND_BAR } from './CommandBar'
import { UserMenu } from './UserMenu'
import { ROSTER_PAGE_LABEL } from '@/lib/nav-map'
import { sectionLabel, useVisibleNav, useVisibleRosterPages } from './nav'

const ROLE_LABEL: Record<string, string> = { manager: 'Manager', artist: 'Artist', agent: 'Agent', lawyer: 'Lawyer', team: 'Team' }

// "⌘K" on a Mac, "Ctrl K" elsewhere.
const noSubscribe = () => () => {}
const onMac = () => /Mac|iPhone|iPad/.test(navigator.platform)

/** The slim bar across the top: where you are, search, the few actions that belong everywhere, and your account. */
export function AppHeader() {
  const {
    view, section, rosterPage, role, authRole, previewMemberId, previewMembers,
    switchScope, goToRoster, setSection, previewAs, setShowUnfinished,
  } = useStore()
  const client = useStore(s => s.getClient())
  const showUnfinished = useStore(s => s.showUnfinished)
  const groups = useVisibleNav()
  const rosterPages = useVisibleRosterPages()
  const mac = useSyncExternalStore(noSubscribe, onMac, () => true)
  const analyticsVisible = showUnfinished || analyticsHasData(client)
  const isArtist = role === 'artist'
  const inStudio = view === 'studio' && !isArtist
  const openArtistId = useStore(s => s.clientId)
  const todayBadge = useTodayBadge(inStudio, openArtistId)   // the number on the phone's Today link, same as the side rail's

  // Remember the "show unfinished screens" choice on this computer.
  useEffect(() => {
    try { if (localStorage.getItem(SHOW_UNFINISHED_KEY) === '1') setShowUnfinished(true) } catch { /* ignore */ }
  }, [setShowUnfinished])

  // If Analytics gets hidden while it's open, move somewhere that exists.
  useEffect(() => {
    if (section === 'analytics' && !analyticsVisible) setSection('calendar')
  }, [section, analyticsVisible, setSection])

  const previewLabel = (() => {
    const m = previewMembers.find(pm => pm.id === previewMemberId)
    if (!m) return ''
    const who = m.role === 'artist' ? m.clientName : m.personName
    return `${ROLE_LABEL[m.role] ?? m.role} — ${who ?? 'Unnamed'}`
  })()

  return (
    <>
      {previewMemberId && (
        <div className="flex-shrink-0 flex items-center justify-center gap-3 bg-amber-50 text-amber-800 text-xs px-4 py-1.5 border-b border-amber-100">
          <span>Previewing the app as <strong className="font-semibold">{previewLabel}</strong></span>
          <button onClick={() => previewAs(null)} className="font-semibold underline underline-offset-2 hover:text-amber-900">Exit preview</button>
        </div>
      )}

      <header className="glass glass-strong glass-bar flex-shrink-0 flex flex-wrap items-center min-h-[52px] px-3 md:px-6 gap-x-3 border-b border-gray-100 md:flex-nowrap">
        {/* Phone: a way back to all artists (same page) when inside an artist */}
        {inStudio && (
          <button
            onClick={() => switchScope('all')}
            aria-label="All artists"
            className="md:hidden flex items-center text-gray-500 hover:text-gray-900 hover:bg-gray-50 px-2 py-1 rounded-lg transition-colors"
          >
            ←
          </button>
        )}

        {/* Brand: always for artists (they have no rail); on phones for everyone not inside an artist */}
        {(isArtist || !inStudio) && (
          <div className={`flex items-center gap-2 font-serif font-semibold text-base flex-shrink-0 ${isArtist ? '' : 'md:hidden'}`}>
            <BrandMark className="w-6 h-6" /> {isArtist ? ARTIST_SIDE_NAME : PRODUCT_NAME}
          </div>
        )}

        {/* Desktop: where you are */}
        {!isArtist && (
          <nav aria-label="Breadcrumb" className="hidden md:flex items-center gap-2 text-sm text-gray-400 min-w-0">
            {inStudio && client ? (
              <>
                <button onClick={() => switchScope('all')} className="hover:text-gray-700 transition-colors">All artists</button>
                <span>/</span>
                <span className="truncate">{client.name}</span>
                <span>/</span>
                <span className="text-gray-900 font-medium">{sectionLabel(section)}</span>
              </>
            ) : view === 'company' ? (
              <>
                <button onClick={() => goToRoster('today')} className="hover:text-gray-700 transition-colors">All artists</button>
                <span>/</span>
                <span className="text-gray-900 font-medium">Company</span>
              </>
            ) : (
              <>
                <span>All artists</span>
                <span>/</span>
                <span className="text-gray-900 font-medium">{ROSTER_PAGE_LABEL[rosterPage]}</span>
              </>
            )}
          </nav>
        )}

        <div className="flex items-center gap-2 ml-auto py-1.5 md:py-0">
          {!isArtist && (
            <button
              onClick={() => window.dispatchEvent(new Event(OPEN_COMMAND_BAR))}
              aria-label="Search or jump to"
              className="flex items-center gap-2 px-2.5 py-1.5 md:w-[280px] rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-400 hover:border-gray-300 transition-colors"
            >
              <Icon name="search" className="w-4 h-4" />
              <span className="hidden md:inline">Search or jump to…</span>
              <kbd className="hidden md:inline ml-auto font-mono text-[11px] text-gray-500 border border-gray-200 bg-canvas rounded px-1.5">{mac ? '⌘K' : 'Ctrl K'}</kbd>
            </button>
          )}

          {authRole !== null && authRole !== 'manager' && (
            <span className="hidden md:inline px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-500" title="Your assigned role">
              {ROLE_LABEL[role] ?? role}
            </span>
          )}

          {!isArtist && <div className="md:hidden"><ClientSwitcher variant="compact" /></div>}

          {view === 'dashboard' && role === 'manager' && (
            <button
              onClick={() => useStore.getState().openModal('add-client')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Icon name="plus" className="w-4 h-4" /> Add client
            </button>
          )}

          <UserMenu />
        </div>

        {/* Phone: the pages, as a scrolling strip (the sidebar is not shown on small screens) */}
        {!isArtist && view !== 'company' && (
          <nav aria-label="Pages" className="md:hidden flex gap-0.5 order-last basis-full pb-1.5 overflow-x-auto no-scrollbar">
            {(inStudio
              ? groups.flatMap(g => g.items).map(i => ({ key: i.key as string, label: i.label, on: section === i.key, go: () => setSection(i.key) }))
              : rosterPages.map(p => ({ key: p as string, label: ROSTER_PAGE_LABEL[p], on: rosterPage === p, go: () => goToRoster(p) }))
            ).map(i => (
              <button
                key={i.key}
                onClick={i.go}
                aria-current={i.on ? 'page' : undefined}
                className={`px-2.5 py-1 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  i.on ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {i.label}
                {i.key === 'today' && todayBadge > 0 && (
                  <span className="ml-1.5 px-1.5 rounded-full bg-accent text-white text-[10px] font-semibold leading-4 align-middle">{todayBadge}<span className="sr-only"> need action</span></span>
                )}
              </button>
            ))}
          </nav>
        )}
      </header>
    </>
  )
}
