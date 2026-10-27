'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import { createClient } from '@/lib/supabase/client'
import { useDismiss } from './useDismiss'
import { applyLook, applyTheme, parseLook, parseTheme, type Look, type Theme } from '@/lib/look'
import { loadMorningEmail, saveMorningEmail } from '@/lib/db'
import { notify } from '@/lib/notify'

const ROLE_LABEL: Record<string, string> = { manager: 'Manager', artist: 'Artist', agent: 'Agent', lawyer: 'Lawyer', team: 'Team' }

/** The account menu: who you are, "view the app as someone else" (managers), and sign out. */
export function UserMenu() {
  const { role, authRole, previewMemberId, previewMembers, previewAs, showUnfinished, setShowUnfinished, signOut } = useStore()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  // The look is chosen per person per browser: it is remembered in a cookie and shown as <html data-look>.
  const [look, setLook] = useState<Look>(() => (typeof document === 'undefined' ? 'glass' : parseLook(document.documentElement.dataset.look)))
  function chooseLook(next: Look) {
    applyLook(next)
    setLook(next)
  }
  const [theme, setTheme] = useState<Theme>(() => (typeof document === 'undefined' ? 'light' : parseTheme(document.documentElement.dataset.theme)))
  function chooseTheme(next: Theme) {
    applyTheme(next)
    setTheme(next)
  }
  // The morning email switch (null = not available, so the line is not shown).
  const [morning, setMorning] = useState<boolean | null>(null)
  function chooseMorning(on: boolean) {
    setMorning(on)
    saveMorningEmail(on).catch(() => { setMorning(!on); notify('That could not be saved. Please try again.') })
  }
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(ref, open, close)

  useEffect(() => {
    let live = true
    createClient().auth.getUser().then(({ data }) => { if (live) setEmail(data.user?.email ?? '') }).catch(() => {})
    if (role !== 'artist') loadMorningEmail().then(v => { if (live) setMorning(v) }).catch(() => {})
    return () => { live = false }
  }, [role])

  const canPreview = (authRole === null || authRole === 'manager') && previewMembers.length > 0

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Account"
        className="w-8 h-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600 hover:bg-gray-200 transition-colors"
      >
        {(email[0] ?? ROLE_LABEL[role]?.[0] ?? '·').toUpperCase()}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1 bg-canvas border border-gray-100 rounded-xl shadow-lg w-[250px] max-h-[75vh] overflow-y-auto z-50 py-1">
          <div className="px-3 py-2">
            <div className="text-sm font-medium truncate">{email || 'Signed in'}</div>
            <div className="text-xs text-gray-500">{ROLE_LABEL[role] ?? role}</div>
          </div>

          {canPreview && (
            <>
              <div className="h-px bg-gray-100 my-1" />
              <div className="px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400">View the app as</div>
              <button
                role="menuitemradio" aria-checked={previewMemberId === null}
                onClick={() => { previewAs(null); setOpen(false) }}
                className={`flex w-full px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors ${previewMemberId === null ? 'font-semibold' : ''}`}
              >
                Manager (you)
              </button>
              {previewMembers.map(m => (
                <button
                  key={m.id}
                  role="menuitemradio" aria-checked={previewMemberId === m.id}
                  onClick={() => { previewAs(m.id); setOpen(false) }}
                  className={`flex items-center justify-between w-full px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors ${previewMemberId === m.id ? 'font-semibold' : ''}`}
                >
                  <span className="truncate">{m.role === 'artist' ? m.clientName : m.personName ?? 'Unnamed'}</span>
                  <span className="text-[10px] text-gray-400 uppercase ml-2 flex-shrink-0">{ROLE_LABEL[m.role] ?? m.role}</span>
                </button>
              ))}
            </>
          )}

          <div className="h-px bg-gray-100 my-1" />
          <div className="px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Look</div>
          <div className="flex gap-1 px-3 pb-2" role="group" aria-label="Look">
            {([['glass', 'Frosted glass'], ['solid', 'Plain paper']] as const).map(([value, label]) => (
              <button
                key={value} role="menuitemradio" aria-checked={look === value} onClick={() => chooseLook(value)}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${look === value ? 'border-accent bg-accent-soft text-accent' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Theme</div>
          <div className="flex gap-1 px-3 pb-2" role="group" aria-label="Theme">
            {([['light', 'Light'], ['dark', 'Dark'], ['auto', 'Auto']] as const).map(([value, label]) => (
              <button
                key={value} role="menuitemradio" aria-checked={theme === value} onClick={() => chooseTheme(value)}
                title={value === 'auto' ? 'Follow this device' : undefined}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${theme === value ? 'border-accent bg-accent-soft text-accent' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="h-px bg-gray-100 my-1" />
          {morning !== null && role !== 'artist' && (
            <label className="flex items-start gap-2 px-3 py-2 text-xs text-gray-500 cursor-pointer hover:bg-gray-50">
              <input type="checkbox" className="mt-0.5 rounded" checked={morning} onChange={e => chooseMorning(e.target.checked)} />
              <span>Morning email<span className="block text-[10px] text-gray-400">A short note on days something needs you, and nothing on quiet days.</span></span>
            </label>
          )}
          {authRole === 'manager' && (
            <label className="flex items-start gap-2 px-3 py-2 text-xs text-gray-500 cursor-pointer hover:bg-gray-50">
              <input type="checkbox" className="mt-0.5 rounded" checked={showUnfinished} onChange={e => setShowUnfinished(e.target.checked)} />
              <span>Show unfinished screens<span className="block text-[10px] text-gray-400">Analytics, Content Studio and Lab. Only on this computer.</span></span>
            </label>
          )}
          <button
            role="menuitem"
            onClick={() => { setOpen(false); signOut() }}
            className="flex w-full px-3 py-2 text-sm text-left text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
