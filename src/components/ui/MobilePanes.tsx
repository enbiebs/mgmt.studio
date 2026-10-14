'use client'
// ──────────────────────────────────────────────────────────
//  MobilePanes — list + detail screens on a phone.
//
//  On a computer these screens show a list on the left and the selected item on the right. A
//  phone has no room for both, so there it shows the list first, then the item with a "back"
//  bar on top. Each screen keeps its own selection logic; it just remembers whether the phone
//  is currently looking at the detail:
//
//    const pane = useMobilePane()
//    <aside className={`${listPaneClass(pane.detail)} w-full md:w-[272px] ...`}>
//      <button onClick={() => { select(item); pane.openDetail() }}>…</button>
//    <main className={`${detailPaneClass(pane.detail)} flex-1 ...`}>
//      <BackToList onClick={pane.closeDetail} label="All shows" />
// ──────────────────────────────────────────────────────────

import { useState } from 'react'

// `start`: open on the detail (e.g. when something already chose an item before arriving).
export function useMobilePane(start = false) {
  const [detail, setDetail] = useState(start)
  return { detail, openDetail: () => setDetail(true), closeDetail: () => setDetail(false) }
}

// Phone: only one of the two panes is shown. md and up: both, exactly as before.
export const listPaneClass = (detail: boolean) => (detail ? 'hidden md:flex' : 'flex')
// (Tailwind needs the full class names, so the two display types are spelled out.)
export const detailPaneClass = (detail: boolean, display: 'block' | 'flex' = 'block') =>
  detail ? (display === 'flex' ? 'flex' : '') : display === 'flex' ? 'hidden md:flex' : 'hidden md:block'

export function BackToList({ onClick, label, className = '' }: { onClick: () => void; label: string; className?: string }) {
  return (
    <div className={`md:hidden flex-shrink-0 ${className}`}>
      <button
        onClick={onClick}
        className="block w-full px-4 py-2.5 text-sm font-medium text-gray-500 border-b border-gray-100 bg-canvas text-left"
      >
        ← {label}
      </button>
    </div>
  )
}
