'use client'
import { useStore } from '@/lib/store'
import { initials } from '@/lib/utils'
import { useState, useRef, useEffect } from 'react'

export function AppHeader() {
  const { view, section, clientId, data, role, setRole, goToDashboard, openClient, setSection, signOut } = useStore()
  const client = useStore(s => s.getClient())
  const [switchOpen, setSwitchOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const switchRef = useRef<HTMLDivElement>(null)
  const userRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (switchRef.current && !switchRef.current.contains(e.target as Node)) setSwitchOpen(false)
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <header className="flex-shrink-0 flex items-center h-[50px] px-4 gap-3 border-b border-gray-100">
      {/* Back button (studio mode only) */}
      {view === 'studio' && (
        <>
          <button
            onClick={goToDashboard}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 hover:bg-gray-50 px-2 py-1 rounded-lg transition-colors"
          >
            ← All clients
          </button>
          <div className="w-px h-4 bg-gray-100" />
        </>
      )}

      {/* Logo */}
      <div className="font-serif font-semibold text-base tracking-tight flex-shrink-0">Studio</div>

      {/* Main nav (studio mode, manager role only — agent/lawyer/artist have their own full views) */}
      {view === 'studio' && role === 'manager' && (
        <nav className="flex gap-0.5 flex-1 overflow-x-auto">
          {([
            ['Music', 'songs'], ['Tour', 'tour'], ['Content', 'content'],
            ['Business', 'business'], ['Projects', 'projects'], ['Analytics', 'analytics'], ['Fandom', 'fandom'],
          ] as [string, typeof section][]).map(([label, key]) => (
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

      {/* Spacer when non-manager view (no main nav) */}
      {view === 'studio' && role !== 'manager' && <div className="flex-1" />}

      <div className="flex items-center gap-2 ml-auto">
        {/* Role toggle (only when viewing a client) */}
        {view === 'studio' && client && (
          <div className="flex items-center bg-gray-100 rounded-full p-0.5 text-xs font-semibold gap-0.5">
            {([
              ['manager', 'Manager', 'Full management workspace'],
              ['artist',  'Artist',  'What the artist sees'],
              ['agent',   'Agent',   'Booking agent portal'],
              ['lawyer',  'Lawyer',  'Attorney / contracts view'],
            ] as const).map(([r, label, title]) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`px-3 py-1 rounded-full transition-colors ${
                  role === r
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
                title={title}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Client switcher */}
        {view === 'studio' && client ? (
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
              {client.name}
            </button>

            {switchOpen && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-100 rounded-xl shadow-lg min-w-[160px] overflow-hidden z-50">
                {data.clients.map(c => (
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
        ) : view === 'dashboard' ? (
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
            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-100 rounded-xl shadow-lg min-w-[140px] overflow-hidden z-50 py-1">
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
