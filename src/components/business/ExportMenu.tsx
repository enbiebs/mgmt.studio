'use client'
// "Download for your accountant": the money as spreadsheets (lib/finance-export.ts), made in the person's own browser from what they can
// already see. Nothing is sent anywhere.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Client } from '@/types'
import { today } from '@/lib/utils'
import { buildExport, EXPORTS, type ExportKind } from '@/lib/finance-export'
import { csvFileName } from '@/lib/csv'
import { downloadCsv } from '@/lib/csv-download'
import { notify } from '@/lib/notify'
import { StatementModal } from './StatementModal'

const MENU_WIDTH = 300
const noun = (n: number) => `${n} row${n === 1 ? '' : 's'}`

/**
 * `scopeName` goes in the file name ("Invoices - Mascolo - 2026-10-26.csv"): an artist's name, or the company's for all artists.
 * `statementFor` (one artist's page only) adds the artist statement to the list.
 */
export function ExportMenu({ clients, scopeName, statementFor }: { clients: Client[]; scopeName: string; statementFor?: Client }) {
  const [open, setOpen] = useState(false)
  const [statement, setStatement] = useState(false)
  const [at, setAt] = useState<{ top: number; left: number } | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)

  // The list is drawn on the page itself (not inside the tab bar, which clips anything that hangs below it) and opened where the button is.
  function toggle() {
    // Under the button's right edge, but never off either side of the screen.
    if (!open && button.current) { const r = button.current.getBoundingClientRect(); setAt({ top: r.bottom + 4, left: Math.max(8, Math.min(r.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)) }) }
    setOpen(v => !v)
  }
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onDown = (e: MouseEvent) => { const t = e.target as Node; if (!menu.current?.contains(t) && !button.current?.contains(t)) close() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey); window.addEventListener('resize', close)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', close) }
  }, [open])

  function download(kind: ExportKind, label: string) {
    const day = today()
    const file = buildExport(kind, clients, day)
    setOpen(false)
    if (file.rows.length === 0) { notify(`There is nothing to put in the “${label}” file yet.${kind === 'commissions' ? ' (Show fees only appear for people who are allowed to see them.)' : ''}`); return }
    downloadCsv(csvFileName([label, scopeName], day), file.csv)
    notify(`${label} downloaded (${noun(file.rows.length)}). Open it in Excel or Numbers.`)
  }

  return (
    <div className="relative flex-shrink-0">
      <button
        ref={button}
        onClick={toggle}
        aria-haspopup="menu" aria-expanded={open}
        className="whitespace-nowrap rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
      >
        <span className="hidden sm:inline">Download for your accountant</span><span className="sm:hidden">Download</span> ▾
      </button>
      {open && at && createPortal(
        <div ref={menu} role="menu" style={{ position: 'fixed', top: at.top, left: at.left, width: MENU_WIDTH }} className="z-[70] max-w-[calc(100vw-16px)] rounded-xl border border-gray-100 bg-canvas py-1 shadow-lg">
          <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">A spreadsheet of…</div>
          {EXPORTS.map(e => (
            <button key={e.key} role="menuitem" onClick={() => download(e.key, e.label)} className="block w-full px-3 py-2 text-left transition-colors hover:bg-gray-50">
              <div className="text-sm font-medium text-gray-800">{e.label}</div>
              <div className="text-[11px] text-gray-400">{e.hint}</div>
            </button>
          ))}
          {statementFor && (
            <>
              <div className="my-1 h-px bg-gray-100" />
              <button role="menuitem" onClick={() => { setOpen(false); setStatement(true) }} className="block w-full px-3 py-2 text-left transition-colors hover:bg-gray-50">
                <div className="text-sm font-medium text-gray-800">Artist statement (PDF)</div>
                <div className="text-[11px] text-gray-400">for the artist: money in and out for a month, three months or a year</div>
              </button>
            </>
          )}
        </div>,
        document.body,
      )}
      {statement && statementFor && <StatementModal client={statementFor} onClose={() => setStatement(false)} />}
    </div>
  )
}
