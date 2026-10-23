'use client'
// ──────────────────────────────────────────────────────────
//  SetupChecklist — "Getting started with <artist>" at the top of an artist's Calendar.
//  Steps tick themselves off from real data (see lib/setup.ts); a step that doesn't apply can be
//  skipped, for the whole team. The card disappears once every step is done or skipped.
// ──────────────────────────────────────────────────────────

import { useState } from 'react'
import { useStore } from '@/lib/store'
import { useSetup } from '@/lib/useSetup'
import type { Client } from '@/types'

/** `className` sets the card's outer spacing: the Calendar's gutters by default, the Overview's own. */
export function SetupChecklist({ client, className = 'mx-3 md:mx-5 mt-3' }: { client: Client; className?: string }) {
  const setup = useSetup(client)
  const { setSection, setTourSub, setSetupSkipped } = useStore()
  const [open, setOpen] = useState(true)
  if (!setup || setup.complete) return null

  const skippedKeys = client.setupSkipped ?? []
  const pct = Math.round((setup.done / setup.total) * 100)

  return (
    <div className={`flex-shrink-0 ${className} border border-gray-100 rounded-2xl bg-canvas overflow-hidden`}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Getting started with {client.name}</div>
          <div className="text-xs text-gray-400">{setup.done} of {setup.total} done{!open && setup.open[0] ? ` · next: ${setup.open[0].title.toLowerCase()}` : ''}</div>
        </div>
        <div className="hidden sm:block w-28 h-1.5 rounded-full bg-gray-100 overflow-hidden flex-shrink-0">
          <div className="h-full bg-accent rounded-full" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-gray-400 text-sm flex-shrink-0">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <ul className="border-t border-gray-100 max-h-[45vh] overflow-y-auto">
          {setup.steps.map(s => (
            <li key={s.key} className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 border-t border-gray-50 first:border-t-0 ${s.done || s.skipped ? 'opacity-50' : ''}`}>
              <span
                className={`w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold ${s.done ? 'bg-green-500 text-white' : 'border border-gray-300 text-transparent'}`}
                aria-hidden
              >
                ✓
              </span>
              <div className="min-w-0 flex-1 basis-[calc(100%-2rem)] sm:basis-auto">
                <div className={`text-sm font-medium ${s.done ? 'line-through' : ''}`}>{s.title}</div>
                {!s.done && <div className="text-xs text-gray-400">{s.hint}</div>}
              </div>
              {!s.done && (
                <div className="flex items-center gap-2 ml-8 sm:ml-0">
                  {s.skipped ? (
                    <button
                      onClick={() => setSetupSkipped(client.id, skippedKeys.filter(k => k !== s.key))}
                      className="text-xs text-accent hover:underline"
                    >
                      Skipped · bring back
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => { setSection(s.go.section); if (s.go.tourSub) setTourSub(s.go.tourSub) }}
                        className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50"
                      >
                        {s.action} →
                      </button>
                      <button
                        onClick={() => setSetupSkipped(client.id, [...skippedKeys, s.key])}
                        className="text-xs text-gray-400 hover:text-gray-600"
                        title="This doesn't apply to this artist"
                      >
                        Skip
                      </button>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
