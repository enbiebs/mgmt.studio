'use client'
import { useState, type ReactNode } from 'react'
import { inputClass, selectClass } from '@/components/ui/Modal'

export interface FieldDef {
  key: string
  label: string
  multiline?: boolean
  options?: readonly string[]
  placeholder?: string
}

/** How a saved value reads on screen: links and addresses are clickable, everything else is plain text. */
export function renderValue(v: string): ReactNode {
  if (/^https?:\/\/\S+$/i.test(v)) return <a href={v} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline break-all">{v.replace(/^https?:\/\/(www\.)?/i, '')}</a>
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return <a href={`mailto:${v}`} className="text-accent hover:underline break-all">{v}</a>
  return <span className="whitespace-pre-wrap break-words">{v}</span>
}

export function Card({ title, hint, action, children }: { title: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-canvas p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-base font-medium">{title}</h3>
          {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function FieldGrid({ fields, values }: { fields: FieldDef[]; values: Record<string, string | undefined> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {fields.map(f => (
        <div key={f.key} className={f.multiline ? 'sm:col-span-2' : ''}>
          <dt className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{f.label}</dt>
          <dd className="mt-0.5 text-sm">{values[f.key] ? renderValue(values[f.key]!) : <span className="text-gray-300">—</span>}</dd>
        </div>
      ))}
    </dl>
  )
}

export function FieldInputs({ fields, draft, onChange }: { fields: FieldDef[]; draft: Record<string, string>; onChange: (key: string, value: string) => void }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {fields.map(f => (
        <label key={f.key} className={`block ${f.multiline ? 'sm:col-span-2' : ''}`}>
          <span className="mb-1 block text-xs font-semibold text-gray-500">{f.label}</span>
          {f.options ? (
            <select className={selectClass} value={draft[f.key] ?? ''} onChange={e => onChange(f.key, e.target.value)}>
              {f.options.map(o => <option key={o} value={o}>{o || 'Not set'}</option>)}
            </select>
          ) : f.multiline ? (
            <textarea className={`${inputClass} min-h-[72px]`} value={draft[f.key] ?? ''} placeholder={f.placeholder} onChange={e => onChange(f.key, e.target.value)} />
          ) : (
            <input className={inputClass} value={draft[f.key] ?? ''} placeholder={f.placeholder} onChange={e => onChange(f.key, e.target.value)} />
          )}
        </label>
      ))}
    </div>
  )
}

/** A card of open details that can be edited in place. */
export function FieldsCard({ title, hint, fields, values, canEdit, onSave }: {
  title: string
  hint?: string
  fields: FieldDef[]
  values: Record<string, string | undefined>
  canEdit: boolean
  onSave: (next: Record<string, string>) => Promise<{ ok: boolean; error?: string }>
}) {
  const [draft, setDraft] = useState<Record<string, string> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const start = () => { setError(''); setDraft(Object.fromEntries(fields.map(f => [f.key, values[f.key] ?? '']))) }
  async function save() {
    if (!draft) return
    setBusy(true); setError('')
    const r = await onSave(Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, v.trim()])))
    setBusy(false)
    if (r.ok) setDraft(null); else setError(r.error ?? "Couldn't save. Please try again.")
  }

  return (
    <Card
      title={title}
      hint={hint}
      action={canEdit && !draft ? <button onClick={start} className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-50">Edit</button> : undefined}
    >
      {draft ? (
        <>
          <FieldInputs fields={fields} draft={draft} onChange={(k, v) => setDraft(d => ({ ...(d ?? {}), [k]: v }))} />
          {error && <p role="alert" className="mt-3 text-xs text-red-600">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setDraft(null)} disabled={busy} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium hover:bg-gray-50">Cancel</button>
            <button onClick={save} disabled={busy} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60">{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </>
      ) : (
        <FieldGrid fields={fields} values={values} />
      )}
    </Card>
  )
}
