'use client'
import { useEffect, useState } from 'react'
import { privateGroupsFor } from '@/lib/profile-fields'
import { inputClass } from '@/components/ui/Modal'
import { Card, renderValue } from './FieldsCard'
import type { ProfileSecure } from './useProfileSecure'

const HIDE_AFTER_MS = 3 * 60 * 1000

/**
 * One person's private details. They stay hidden, and are not even sent to the browser, until someone
 * clicks Reveal. Each reveal and each change is recorded. They hide again on their own after three minutes.
 */
export function PrivateBlock({ clientId, subject, title, canEdit, secure }: {
  clientId: string
  subject: string
  title: string
  canEdit: boolean
  secure: ProfileSecure
}) {
  const groups = privateGroupsFor(subject)
  const total = groups.reduce((n, g) => n + g.fields.length, 0)
  const filled = secure.summary?.subjects[subject]?.length ?? 0

  const [data, setData] = useState<Record<string, string> | null>(null)       // what was revealed
  const [draft, setDraft] = useState<Record<string, string> | null>(null)     // what is being edited
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Hide again after a few minutes, and whenever another artist is opened.
  useEffect(() => {
    if (!data) return
    const t = window.setTimeout(() => { setData(null); setDraft(null) }, HIDE_AFTER_MS)
    return () => window.clearTimeout(t)
  }, [data])
  useEffect(() => () => { setData(null); setDraft(null) }, [clientId, subject])

  async function reveal() {
    setBusy(true); setError('')
    const r = await secure.reveal(subject)
    setBusy(false)
    if (r.ok) setData(r.data); else setError(r.error)
  }

  async function save() {
    if (!data || !draft) return
    const changes: Record<string, string> = {}
    for (const g of groups) for (const f of g.fields) {
      const next = (draft[f.key] ?? '').trim()
      if (next !== (data[f.key] ?? '')) changes[f.key] = next
    }
    if (Object.keys(changes).length === 0) { setDraft(null); return }
    setBusy(true); setError('')
    const r = await secure.save(subject, changes)
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    const merged = { ...data }
    for (const [k, v] of Object.entries(changes)) { if (v) merged[k] = v; else delete merged[k] }
    setData(merged); setDraft(null)
  }

  const hint = 'Hidden until you reveal them. Every reveal and every change is recorded.'

  if (secure.loading) return <Card title={title} hint={hint}><p className="text-sm text-gray-400">Loading…</p></Card>
  if (secure.failed) return <Card title={title} hint={hint}><p className="text-sm text-gray-500">Couldn&apos;t load the private details. Refresh and try again.</p></Card>
  if (secure.summary && !secure.summary.configured) {
    return (
      <Card title={title} hint={hint}>
        <p className="text-sm text-gray-500">Private details aren&apos;t switched on yet. They need a security key set up on the server before anything can be stored.</p>
      </Card>
    )
  }

  // ── Hidden ──
  if (!data) {
    return (
      <Card title={title} hint={hint}>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gray-50 px-4 py-3">
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 flex-shrink-0 text-gray-400" aria-hidden="true">
              <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
            <div>
              <div className="text-sm font-medium">{filled === 0 ? 'Nothing saved yet' : `${filled} of ${total} details saved`}</div>
              <div className="text-xs text-gray-500">{groups.map(g => g.label).join(' · ')}</div>
            </div>
          </div>
          <button onClick={reveal} disabled={busy} className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-canvas hover:opacity-90 disabled:opacity-60">
            {busy ? 'Opening…' : filled === 0 && canEdit ? 'Add details' : 'Reveal'}
          </button>
        </div>
        {error && <p role="alert" className="mt-3 text-xs text-red-600">{error}</p>}
      </Card>
    )
  }

  // ── Revealed ──
  return (
    <Card
      title={title}
      hint="Showing now. These hide again after three minutes, and this view was recorded."
      action={
        <div className="flex gap-2">
          {canEdit && !draft && <button onClick={() => { setError(''); setDraft({ ...data }) }} className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-50">Edit</button>}
          {!draft && <button onClick={() => { setData(null); setDraft(null) }} className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-50">Hide</button>}
        </div>
      }
    >
      <div className="space-y-5">
        {groups.map(g => (
          <div key={g.key}>
            <div className="mb-2 text-[11px] font-bold uppercase tracking-widest text-gray-400">{g.label}</div>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              {g.fields.map(f => (
                <div key={f.key} className={f.multiline ? 'sm:col-span-2' : ''}>
                  <dt className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{f.label}</dt>
                  <dd className="mt-0.5 text-sm">
                    {draft ? (
                      f.multiline
                        ? <textarea className={`${inputClass} min-h-[64px]`} value={draft[f.key] ?? ''} placeholder={f.hint} onChange={e => setDraft(d => ({ ...(d ?? {}), [f.key]: e.target.value }))} />
                        : <input className={inputClass} value={draft[f.key] ?? ''} placeholder={f.hint} onChange={e => setDraft(d => ({ ...(d ?? {}), [f.key]: e.target.value }))} />
                    ) : data[f.key] ? renderValue(data[f.key]) : <span className="text-gray-300">—</span>}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      {error && <p role="alert" className="mt-3 text-xs text-red-600">{error}</p>}
      {draft && (
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={() => setDraft(null)} disabled={busy} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={busy} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60">{busy ? 'Saving…' : 'Save'}</button>
        </div>
      )}
    </Card>
  )
}
