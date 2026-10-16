'use client'
// Small inputs shared by the budget editor and its assumptions panel.
import { useState } from 'react'

// A number box that only saves when you tab/click away or press Enter, so typing
// a figure doesn't save a half-typed value on every keystroke.
export function NumInput({ value, onCommit, disabled, className = '' }: { value: number; onCommit: (n: number) => void; disabled?: boolean; className?: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? String(value)
  function commit() {
    if (draft === null) return
    const n = Number(draft.replace(/,/g, ''))
    setDraft(null)
    if (Number.isFinite(n) && n !== value) onCommit(n)
  }
  return (
    <input
      type="text" inputMode="decimal" disabled={disabled}
      className={`w-full px-2 py-1 border border-gray-200 rounded-md text-sm text-right outline-none focus:border-accent bg-canvas disabled:opacity-60 disabled:border-transparent ${className}`}
      value={shown}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
    />
  )
}

export function TextInput({ value, onCommit, disabled, className = '' }: { value: string; onCommit: (s: string) => void; disabled?: boolean; className?: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  function commit() {
    if (draft === null) return
    const v = draft.trim()
    setDraft(null)
    if (v && v !== value) onCommit(v)
  }
  return (
    <input
      type="text" disabled={disabled}
      className={`w-full px-2 py-1 border border-transparent hover:border-gray-200 rounded-md text-sm outline-none focus:border-accent bg-transparent disabled:opacity-100 ${className}`}
      value={draft ?? value}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
    />
  )
}

