'use client'
// The phone's bottom bar (lib/phone-tabs.ts): the pages you open most as big tap targets, the rest under "More". Bigger screens have the sidebar,
// so this is not drawn there. Same pages, same Today badge and same access rules as the sidebar.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import { useTodayBadge } from '@/lib/useInbox'
import { ROSTER_PAGE_LABEL } from '@/lib/nav-map'
import { Icon, type IconName } from '@/components/ui/Icon'
import { phoneTabs } from '@/lib/phone-tabs'
import { useDismiss } from './useDismiss'
import { ROSTER_PAGE_ICON, useVisibleNav, useVisibleRosterPages } from './nav'

interface Tab { key: string; label: string; icon: IconName; on: boolean; go: () => void }

// The open page is marked three ways, not by colour alone: a bar on top, bolder letters, and (for screen readers) aria-current.
const TAB = 'relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 border-t-2 px-1 text-[11px] transition-colors'
const tabLook = (on: boolean) => (on ? 'border-accent font-semibold text-accent' : 'border-transparent font-medium text-gray-500')

export function PhoneTabBar() {
  const view = useStore(s => s.view)
  const section = useStore(s => s.section)
  const rosterPage = useStore(s => s.rosterPage)
  const clientId = useStore(s => s.clientId)
  const goToRoster = useStore(s => s.goToRoster)
  const goToCompany = useStore(s => s.goToCompany)
  const setSection = useStore(s => s.setSection)
  const isManager = useStore(s => s.role === 'manager')
  const groups = useVisibleNav()
  const pages = useVisibleRosterPages()
  const inArtist = view === 'studio'
  const todayBadge = useTodayBadge(inArtist, clientId)
  const [moreOpen, setMoreOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const moreButton = useRef<HTMLButtonElement>(null)
  const sheet = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setMoreOpen(false), [])
  useDismiss(ref, moreOpen, close)
  // Opening the sheet puts the cursor on its first page, so the keyboard (and a screen reader) start in the right place.
  useEffect(() => { if (moreOpen) sheet.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus() }, [moreOpen])

  const tabs: Tab[] = inArtist
    ? groups.flatMap(g => g.items).map(i => ({ key: i.key as string, label: i.label, icon: i.icon, on: section === i.key, go: () => setSection(i.key) }))
    : pages.map(p => ({ key: p as string, label: ROSTER_PAGE_LABEL[p], icon: ROSTER_PAGE_ICON[p], on: view === 'dashboard' && rosterPage === p, go: () => goToRoster(p) }))
  // Managers also reach the whole company's people and access from here (the sidebar has the same link).
  if (isManager) tabs.push({ key: 'company', label: 'Company access', icon: 'team', on: view === 'company', go: () => goToCompany() })

  const { bar, more, moreActive } = phoneTabs(tabs, tabs.find(t => t.on)?.key)
  if (tabs.length === 0) return null
  const pick = (t: Tab) => { t.go(); close() }

  return (
    <div
      ref={ref}
      className="md:hidden flex-shrink-0"
      onKeyDown={e => { if (e.key === 'Escape' && moreOpen) { close(); moreButton.current?.focus() } }}
    >
      <nav aria-label="Pages" className="glass glass-strong flex border-t border-gray-100 pb-[env(safe-area-inset-bottom)]">
        {bar.map(t => (
          <button key={t.key} onClick={() => pick(t)} aria-current={t.on ? 'page' : undefined} className={`${TAB} ${tabLook(t.on)}`}>
            <span className="relative">
              <Icon name={t.icon} className="h-[22px] w-[22px]" />
              {t.key === 'today' && todayBadge > 0 && (
                <span className="absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] font-semibold leading-4 text-white">{todayBadge}<span className="sr-only"> need action</span></span>
              )}
            </span>
            {t.label}
          </button>
        ))}
        {more.length > 0 && (
          <button ref={moreButton} onClick={() => setMoreOpen(v => !v)} aria-haspopup="menu" aria-expanded={moreOpen} className={`${TAB} ${tabLook(moreActive || moreOpen)}`}>
            <span className="text-[22px] leading-[22px]" aria-hidden>⋯</span>
            More
          </button>
        )}
      </nav>
      {/* Sits above the bar and scrolls when the list is longer than the screen (a phone turned sideways, say), so no page is ever out of reach. */}
      {moreOpen && more.length > 0 && (
        <div
          ref={sheet} role="menu" aria-label="More pages"
          className="fixed inset-x-2 bottom-[calc(60px+env(safe-area-inset-bottom))] z-40 max-h-[calc(100dvh-140px-env(safe-area-inset-bottom))] overflow-y-auto overscroll-contain rounded-2xl border border-gray-100 bg-canvas py-1 shadow-lg"
        >
          {more.map(t => (
            <button
              key={t.key} role="menuitem" onClick={() => pick(t)} aria-current={t.on ? 'page' : undefined}
              className={`flex min-h-[48px] w-full items-center gap-3 px-4 text-left text-sm font-medium ${t.on ? 'text-accent' : 'text-gray-700'}`}
            >
              <Icon name={t.icon} /> {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
