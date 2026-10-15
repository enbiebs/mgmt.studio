'use client'
// ──────────────────────────────────────────────────────────
//  A role menu that SHOWS what each role means (like the permission list in Google Calendar's share box): the role's
//  name, and one plain sentence under it. It opens in place, so it never gets clipped inside a pop-up window.
// ──────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { LEVELS, type AccessPreset } from '@/lib/access-presets'

export function RoleMenu({ value, onChange, ariaLabel, placeholder = 'Choose a role…', shownAs, options = LEVELS, busy = false }: {
  /** The chosen role's key, or '' / 'custom' / 'none' when it is not one of the menu's choices. */
  value: string
  onChange: (key: string) => void
  ariaLabel: string
  placeholder?: string
  /** What to call the current state when it is not a role in the menu ("Custom pages", "No pages yet"). */
  shownAs?: string
  options?: AccessPreset[]
  busy?: boolean
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const current = options.find(o => o.key === value)

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  function move(e: React.KeyboardEvent, from: number) {
    const items = root.current?.querySelectorAll<HTMLButtonElement>('[role="option"]')
    if (!items?.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); items[Math.min(from + 1, items.length - 1)].focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[Math.max(from - 1, 0)].focus() }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); trigger.current?.focus() }
  }

  return (
    <div ref={root} className="w-full">
      <button
        ref={trigger} type="button" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} aria-busy={busy}
        onClick={() => { if (!busy) setOpen(o => !o) }}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 bg-canvas px-2.5 py-2 text-left text-sm transition-colors hover:border-gray-300 focus:border-accent focus:outline-none"
      >
        <span className={current || shownAs ? '' : 'text-gray-400'}>{current?.label ?? shownAs ?? placeholder}</span>
        <span aria-hidden="true" className="text-xs text-gray-400">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <ul role="listbox" aria-label={ariaLabel} className="mt-1 overflow-hidden rounded-lg border border-gray-200 bg-canvas">
          {options.map((o, i) => (
            <li key={o.key} role="presentation" className="border-b border-gray-100 last:border-b-0">
              <button
                type="button" role="option" aria-selected={o.key === value}
                onClick={() => { setOpen(false); trigger.current?.focus(); if (o.key !== value) onChange(o.key) }}
                onKeyDown={e => move(e, i)}
                className={`block w-full px-3 py-2 text-left transition-colors hover:bg-gray-50 focus:bg-gray-50 focus:outline-none ${o.key === value ? 'bg-blue-50/60' : ''}`}
              >
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  {o.key === value && <span aria-hidden="true" className="text-accent">✓</span>}
                  {o.label}
                </span>
                <span className="mt-0.5 block text-xs text-gray-500">{o.blurb}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
