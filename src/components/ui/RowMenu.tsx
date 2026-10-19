'use client'
import { useCallback, useRef, useState } from 'react'
import { useDismiss } from '@/components/layout/useDismiss'

export interface RowMenuItem { label: string; onSelect: () => void; danger?: boolean }

/**
 * A "⋯" button that opens a short menu. Dangerous actions (delete) live in here, not out in the open beside an amount,
 * so a stray click on a row of money can never remove it.
 */
export function RowMenu({ items, label = 'More actions', up = false }: { items: RowMenuItem[]; label?: string; up?: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(ref, open, close)

  return (
    <div ref={ref} className="relative inline-block" onClick={e => e.stopPropagation()}>
      <button
        type="button" aria-haspopup="menu" aria-expanded={open} aria-label={label} title={label}
        onClick={() => setOpen(v => !v)}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-base leading-none text-gray-400 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        ⋯
      </button>
      {open && (
        <div role="menu" className={`absolute right-0 z-30 min-w-[150px] overflow-hidden rounded-lg border border-gray-100 bg-canvas py-1 shadow-lg ${up ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
          {items.map(item => (
            <button
              key={item.label} role="menuitem" type="button"
              onClick={() => { setOpen(false); item.onSelect() }}
              className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 ${item.danger ? 'text-red-600' : 'text-gray-700'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
