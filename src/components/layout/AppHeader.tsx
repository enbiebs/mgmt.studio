'use client'
import { useStore } from '@/lib/store'
import { initials } from '@/lib/utils'
import { useState, useRef, useEffect } from 'react'
import { useInbox } from '@/lib/useInbox'
import { SHOW_UNFINISHED_KEY, analyticsHasData } from '@/lib/unfinished'
import type { MainSection } from '@/types'

const ROLE_LABEL: Record<string, string> = { manager: 'Manager', artist: 'Artist', agent: 'Agent', lawyer: 'Lawyer', team: 'Team' }

export function AppHeader() {
  const {
    view, section, clientId, data, role, authRole, previewMemberId, previewMembers, previewAs,
    hasAccess, accessibleClientIds, goToDashboard, openClient, setSection, signOut,
  } = useStore()
  const canSwitchRole = authRole === null || authRole === 'manager'
  const client = useStore(s => s.getClient())
  const inboxCount = useInbox().total
  const showUnfinished = useStore(s => s.showUnfinished)
  const setShowUnfinished = useStore(s => s.setShowUnfinished)
  const analyticsVisible = showUnfinished || analyticsHasData(client)
  const [switchOpen, setSwitchOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const switchRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const userRef = useRef<HTMLDivElement>(null)

  const visibleClientIds = accessibleClientIds()
  const rosterClients = visibleClientIds === 'all' ? data.clients : data.clients.filter(c => visibleClientIds.includes(c.id))
  const previewLabel = previewMemberId === null
    ? 'Manager (you)'
    : (() => {
        const m = previewMembers.find(pm => pm.id === previewMemberId)
        if (!m) return 'Manager (you)'
        const who = m.role === 'artist' ? m.clientName : m.personName
        return `${ROLE_LABEL[m.role] ?? m.role} — ${who ?? 'Unnamed'}`
      })()

  // Remember the "show unfinished screens" choice on this computer.
  useEffect(() => {
    try { if (localStorage.getItem(SHOW_UNFINISHED_KEY) === '1') setShowUnfinished(true) } catch { /* ignore */ }
  }, [setShowUnfinished])

  // If Analytics gets hidden while it's open, move somewhere that exists.
  useEffect(() => {
    if (section === 'analytics' && !analyticsVisible) setSection('calendar')
  }, [section, analyticsVisible, setSection])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (switchRef.current && !switchRef.current.contains(e.target as Node)) setSwitchOpen(false)
      if (previewRef.current && !previewRef.current.contains(e.target as Node)) setPreviewOpen(false)
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <header className="flex-shrink-0 flex flex-wrap items-center min-h-[50px] px-3 md:px-4 gap-x-2 md:gap-x-3 border-b border-gray-100 md:flex-nowrap">
      {/* Back button (studio mode only — artists have no roster to go back to) */}
      {view === 'studio' && role !== 'artist' && (
        <>
          <button
            onClick={goToDashboard}
            aria-label="All clients"
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 hover:bg-gray-50 px-2 py-1 rounded-lg transition-colors"
          >
            ←<span className="hidden md:inline"> All clients</span>
          </button>
          <div className="w-px h-4 bg-gray-100 hidden md:block" />
        </>
      )}

      {/* Logo */}
      <div className={`font-serif font-semibold text-base tracking-tight flex-shrink-0 ${view === 'studio' && role !== 'artist' ? 'hidden md:block' : ''}`}>Mgmt Studio</div>

      {/* Main nav (studio mode, everyone except artist — artists get their own dashboard-style view) */}
      {view === 'studio' && role !== 'artist' && (
        <nav className="flex gap-0.5 order-last basis-full pb-1.5 md:order-none md:basis-auto md:pb-0 md:flex-1 overflow-x-auto">
          {([
            ['Calendar', 'calendar'],
            ['Music', 'songs'], ['Tour', 'tour'], ['Content', 'content'],
            ['Finance', 'finance'], ['Team', 'team'], ['Projects', 'projects'], ['Analytics', 'analytics'], ['Legal', 'legal'],
          ] as [string, MainSection][])
            .filter(([, key]) => hasAccess(key, clientId ?? undefined) && (key !== 'analytics' || analyticsVisible))
            .map(([label, key]) => (
            <button
              key={key}
              onClick={() => setSection(key)}
              className={`px-2.5 py-1 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                section === key
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      )}

      {/* Spacer when artist (no main nav) */}
      {view === 'studio' && role === 'artist' && <div className="flex-1" />}

      <div className="flex items-center gap-2 ml-auto py-1.5 md:py-0">
        {/* Inbox — what needs attention across every artist; opens the roster, where it lives. */}
        {role !== 'artist' && (
          <button
            onClick={goToDashboard}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
            title="What needs your attention"
          >
            Inbox
            {inboxCount > 0 && <span className="px-1.5 rounded-full bg-red-500 text-white text-[10px] leading-4">{inboxCount}</span>}
          </button>
        )}
        {/* Preview — a real manager can simulate any other real workspace
            member's actual role + access_grants. Everyone else is locked
            to the role assigned in workspace_members. */}
        {canSwitchRole && previewMembers.length > 0 && (
          <div ref={previewRef} className={`relative ${previewMemberId ? '' : 'hidden md:block'}`}>
            <button
              onClick={() => setPreviewOpen(v => !v)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                previewMemberId ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              title="Preview as another workspace member"
            >
              {previewMemberId ? `Previewing: ${previewLabel}` : 'Preview as…'}
            </button>
            {previewOpen && (
              <div className="absolute right-0 top-full mt-1 bg-canvas border border-gray-100 rounded-xl shadow-lg min-w-[220px] overflow-hidden z-50 py-1">
                <button
                  onClick={() => { previewAs(null); setPreviewOpen(false) }}
                  className={`flex items-center w-full px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors ${previewMemberId === null ? 'font-semibold' : ''}`}
                >
                  Manager (you)
                </button>
                <div className="h-px bg-gray-100 my-1" />
                {previewMembers.map(m => (
                  <button
                    key={m.id}
                    onClick={() => { previewAs(m.id); setPreviewOpen(false) }}
                    className={`flex items-center justify-between w-full px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors ${previewMemberId === m.id ? 'font-semibold' : ''}`}
                  >
                    <span>{m.role === 'artist' ? m.clientName : m.personName ?? 'Unnamed'}</span>
                    <span className="text-[10px] text-gray-400 uppercase ml-2">{ROLE_LABEL[m.role] ?? m.role}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {!canSwitchRole && (
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-500" title="Your assigned role">
            {ROLE_LABEL[role] ?? role}
          </span>
        )}

        {/* Client switcher — hidden for artists, who only ever see their own client */}
        {view === 'studio' && client && role !== 'artist' ? (
          <div ref={switchRef} className="relative">
            <button
              onClick={() => setSwitchOpen(v => !v)}
              className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-gray-50 border border-gray-200 text-sm font-medium hover:bg-gray-100 transition-colors"
            >
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0"
                style={{ background: client.color }}
              >
                {initials(client.name)}
              </div>
              <span className="max-w-[110px] md:max-w-none truncate">{client.name}</span>
            </button>

            {switchOpen && (
              <div className="absolute right-0 top-full mt-1 bg-canvas border border-gray-100 rounded-xl shadow-lg min-w-[160px] max-h-[60vh] overflow-y-auto z-50">
                {rosterClients.map(c => (
                  <button
                    key={c.id}
                    onClick={() => { openClient(c.id); setSwitchOpen(false) }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c.color }} />
                    <span className={c.id === clientId ? 'font-semibold' : ''}>{c.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : view === 'dashboard' && role === 'manager' ? (
          <button
            onClick={() => useStore.getState().openModal('add-client')}
            className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            + Add client
          </button>
        ) : null}

        {/* User / sign-out menu */}
        <div ref={userRef} className="relative ml-1">
          <button
            onClick={() => setUserOpen(v => !v)}
            className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600 hover:bg-gray-300 transition-colors"
            title="Account"
          >
            S
          </button>
          {userOpen && (
            <div className="absolute right-0 top-full mt-1 bg-canvas border border-gray-100 rounded-xl shadow-lg min-w-[140px] overflow-hidden z-50 py-1">
              {authRole === 'manager' && (
                <label className="flex items-start gap-2 px-3 py-2 text-xs text-gray-500 cursor-pointer hover:bg-gray-50 max-w-[220px]">
                  <input type="checkbox" className="mt-0.5 rounded" checked={showUnfinished} onChange={e => setShowUnfinished(e.target.checked)} />
                  <span>Show unfinished screens<span className="block text-[10px] text-gray-400">Analytics, Content Lab. Only on this computer.</span></span>
                </label>
              )}
              <button
                onClick={() => { setUserOpen(false); signOut() }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
