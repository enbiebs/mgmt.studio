'use client'
// ──────────────────────────────────────────────────────────
//  Accounts: where each of the artist's logins is kept and how the team gets in.
//  This is a directory. It never holds a password: those belong in a team password manager,
//  and each row can link to the shared entry there.
// ──────────────────────────────────────────────────────────
import { useState } from 'react'
import { useStore } from '@/lib/store'
import { Badge } from '@/components/ui/Badge'
import { Modal, FormField, inputClass, selectClass } from '@/components/ui/Modal'
import { today, uid } from '@/lib/utils'
import {
  ACCESS_LABEL, ACCESS_OPTIONS, CATEGORIES, PLATFORM_PRESETS, TWO_FACTOR_LABEL, TWO_FACTOR_OPTIONS,
  accountIssues, categoryLabel, guessCategory, needsAttention, parseAccountsSheet, parseCsv, type ParsedLogin,
} from '@/lib/accounts'
import type { AccountAccess, AccountTwoFactor, ArtistAccount, Client } from '@/types'
import { Card } from './FieldsCard'

const isWebAddress = (v: string) => /^https?:\/\/\S+$/i.test(v)
const ACCESS_TONE: Record<AccountAccess, 'green' | 'blue' | 'amber' | 'red'> = { platform: 'green', manager: 'blue', artist: 'amber', unsorted: 'red' }
const TWO_FACTOR_TONE: Record<AccountTwoFactor, 'green' | 'gray' | 'amber' | 'red'> = { app: 'green', key: 'green', email: 'gray', sms: 'amber', none: 'red', unknown: 'gray' }
const OWNERS = ['The artist', 'Management', 'The label', 'The distributor', 'Someone else']

export function AccountsTab({ client, canEdit }: { client: Client; canEdit: boolean }) {
  const removeAccount = useStore(s => s.removeAccount)
  const accounts = client.accounts ?? []
  const todayIso = today()
  const [filter, setFilter] = useState<'all' | 'attention' | string>('all')
  const [editing, setEditing] = useState<ArtistAccount | null>(null)
  const [importing, setImporting] = useState(false)

  const attention = accounts.filter(a => needsAttention(a, todayIso))
  const shown = accounts.filter(a => filter === 'all' ? true : filter === 'attention' ? needsAttention(a, todayIso) : a.category === filter)
  const usedCategories = CATEGORIES.filter(([key]) => accounts.some(a => a.category === key))

  return (
    <>
      <Card
        title="Accounts and logins"
        hint="Where each login lives and how the team gets in. Passwords are never kept here: use a team password manager (1Password or Bitwarden) and link to the shared entry."
        action={canEdit ? (
          <div className="flex gap-2">
            <button onClick={() => setImporting(true)} className="whitespace-nowrap rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-50">Import from a sheet</button>
            <button onClick={() => setEditing({ id: 'acct-' + uid(), platform: '', category: 'other', access: 'unsorted', twoFactor: 'unknown' })} className="whitespace-nowrap rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-hover">+ Add an account</button>
          </div>
        ) : undefined}
      >
        {accounts.length === 0 ? (
          <p className="text-sm text-gray-500">No accounts listed yet. Add the platforms this artist uses, or import them from the sheet you keep today (the passwords in it are never read).</p>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-gray-500">{accounts.length} accounts</span>
              <span className="text-gray-300">·</span>
              <span className={attention.length ? 'font-medium text-amber-700' : 'text-green-700'}>{attention.length ? `${attention.length} need attention` : 'nothing needs attention'}</span>
            </div>
            <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Filter accounts">
              {([['all', 'All'], ['attention', 'Needs attention'], ...usedCategories] as [string, string][]).map(([key, label]) => (
                <button
                  key={key} onClick={() => setFilter(key)} aria-pressed={filter === key}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${filter === key ? 'bg-gray-900 text-canvas' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {shown.length === 0 && <p className="text-sm text-gray-500">Nothing here.</p>}
            {CATEGORIES.map(([cat, label]) => {
              const rows = shown.filter(a => a.category === cat)
              if (rows.length === 0) return null
              return (
                <div key={cat} className="mb-5 last:mb-0">
                  <div className="mb-1 text-[11px] font-bold uppercase tracking-widest text-gray-400">{label}</div>
                  <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
                    {rows.map(a => {
                      const issues = accountIssues(a, todayIso)
                      return (
                        <li key={a.id} className="px-4 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                            <div className="min-w-0">
                              <div className="text-sm font-medium">{a.platform}{a.label && <span className="font-normal text-gray-500"> · {a.label}</span>}</div>
                              {a.username && <div className="font-mono text-xs text-gray-500 break-all">{a.username}</div>}
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                <Badge variant={ACCESS_TONE[a.access]}>{ACCESS_LABEL[a.access]}</Badge>
                                <Badge variant={TWO_FACTOR_TONE[a.twoFactor]}>{TWO_FACTOR_LABEL[a.twoFactor]}</Badge>
                                {a.owner && <Badge variant="gray">Owned by {a.owner.toLowerCase()}</Badge>}
                              </div>
                            </div>
                            <div className="flex flex-shrink-0 items-center gap-3 text-xs">
                              {a.loginUrl && isWebAddress(a.loginUrl) && <a href={a.loginUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Sign in ↗</a>}
                              {a.vaultUrl && isWebAddress(a.vaultUrl) && <a href={a.vaultUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Password entry ↗</a>}
                              {canEdit && <button onClick={() => setEditing(a)} className="text-gray-500 hover:text-gray-900">Edit</button>}
                            </div>
                          </div>
                          {issues.length > 0 && (
                            <ul className="mt-2 space-y-0.5">
                              {issues.map(i => (
                                <li key={i.key} className="flex items-start gap-1.5 text-xs text-gray-600">
                                  <span className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${i.level === 'attention' ? 'bg-amber-500' : 'bg-gray-300'}`} />{i.text}
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            })}
          </>
        )}
      </Card>

      {editing && (
        <AccountForm
          key={editing.id}
          initial={editing}
          exists={accounts.some(a => a.id === editing.id)}
          onClose={() => setEditing(null)}
          onRemove={async () => { const r = await removeAccount(editing.id); if (r.ok) setEditing(null); return r }}
        />
      )}
      {importing && <ImportModal existing={accounts} onClose={() => setImporting(false)} />}
    </>
  )
}

// ── Add or edit one account ──────────────────────────────────
function AccountForm({ initial, exists, onClose, onRemove }: {
  initial: ArtistAccount
  exists: boolean
  onClose: () => void
  onRemove: () => Promise<{ ok: boolean; error?: string }>
}) {
  const saveAccounts = useStore(s => s.saveAccounts)
  const [a, setA] = useState<ArtistAccount>(initial)
  const [categoryTouched, setCategoryTouched] = useState(exists)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = <K extends keyof ArtistAccount>(k: K, v: ArtistAccount[K]) => setA(prev => ({ ...prev, [k]: v }))

  // Picking a known platform fills in its group and sign-in page (unless they were already chosen).
  function onPlatform(name: string) {
    const preset = PLATFORM_PRESETS.find(p => p.name.toLowerCase() === name.trim().toLowerCase())
    setA(prev => ({
      ...prev, platform: name,
      category: categoryTouched ? prev.category : guessCategory(name),
      loginUrl: prev.loginUrl || preset?.loginUrl || prev.loginUrl,
    }))
  }

  async function save() {
    const platform = a.platform.trim()
    const loginUrl = (a.loginUrl ?? '').trim(), vaultUrl = (a.vaultUrl ?? '').trim()
    if (!platform) { setError('What is this account for? Enter the platform or service.'); return }
    if (loginUrl && !isWebAddress(loginUrl)) { setError('The sign-in page must start with https://'); return }
    if (vaultUrl && !isWebAddress(vaultUrl)) { setError('The password entry link must start with https://'); return }
    setBusy(true); setError('')
    const clean = (v?: string) => (v ?? '').trim() || undefined
    const r = await saveAccounts([{
      ...a, platform, label: clean(a.label), username: clean(a.username), owner: clean(a.owner),
      loginUrl: clean(loginUrl), vaultUrl: clean(vaultUrl), notes: clean(a.notes), lastChanged: clean(a.lastChanged),
    }])
    setBusy(false)
    if (r.ok) onClose(); else setError(r.error)
  }

  return (
    <Modal
      title={exists ? 'Edit account' : 'Add an account'} wide onClose={onClose}
      footer={
        <>
          {exists && (
            <button
              onClick={async () => { if (!confirm(`Remove ${initial.platform} from the list? This does not touch the account itself.`)) return; const r = await onRemove(); if (!r.ok) setError(r.error ?? "Couldn't remove it.") }}
              className="mr-auto text-sm text-red-500 hover:text-red-600"
            >
              Remove
            </button>
          )}
          <button onClick={onClose} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={busy} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60">{busy ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Platform or service">
          <input list="account-platforms" className={inputClass} value={a.platform} onChange={e => onPlatform(e.target.value)} placeholder="Spotify for Artists" autoFocus />
          <datalist id="account-platforms">{PLATFORM_PRESETS.map(p => <option key={p.name} value={p.name} />)}</datalist>
        </FormField>
        <FormField label="Group">
          <select className={selectClass} value={a.category} onChange={e => { setCategoryTouched(true); set('category', e.target.value) }}>
            {CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </FormField>
        <FormField label="What it is used for (optional)"><input className={inputClass} value={a.label ?? ''} onChange={e => set('label', e.target.value)} placeholder="Bookings inbox" /></FormField>
        <FormField label="Username or login email (not the password)"><input className={inputClass} value={a.username ?? ''} onChange={e => set('username', e.target.value)} autoComplete="off" /></FormField>
        <FormField label="Who owns the account">
          <input list="account-owners" className={inputClass} value={a.owner ?? ''} onChange={e => set('owner', e.target.value)} placeholder="The artist" />
          <datalist id="account-owners">{OWNERS.map(o => <option key={o} value={o} />)}</datalist>
        </FormField>
        <FormField label="Password last changed (optional)"><input type="date" className={inputClass} value={a.lastChanged ?? ''} onChange={e => set('lastChanged', e.target.value)} /></FormField>
        <FormField label="How the team gets in">
          <select className={selectClass} value={a.access} onChange={e => set('access', e.target.value as AccountAccess)}>
            {ACCESS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label} — {o.hint}</option>)}
          </select>
        </FormField>
        <FormField label="Second step when signing in">
          <select className={selectClass} value={a.twoFactor} onChange={e => set('twoFactor', e.target.value as AccountTwoFactor)}>
            {TWO_FACTOR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </FormField>
        <FormField label="Sign-in page"><input className={inputClass} value={a.loginUrl ?? ''} onChange={e => set('loginUrl', e.target.value)} placeholder="https://" /></FormField>
        <FormField label="Link to the shared password entry"><input className={inputClass} value={a.vaultUrl ?? ''} onChange={e => set('vaultUrl', e.target.value)} placeholder="https://" /></FormField>
        <div className="sm:col-span-2"><FormField label="Notes"><textarea className={`${inputClass} min-h-[64px]`} value={a.notes ?? ''} onChange={e => set('notes', e.target.value)} /></FormField></div>
      </div>
      <p className="text-xs text-gray-400">Never type a password here. If one is needed, put it in the password manager and paste that entry&apos;s link above.</p>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </Modal>
  )
}

// ── Import from a sheet of logins ────────────────────────────
type Pick = ParsedLogin & { key: string; selected: boolean; duplicate: boolean }

function ImportModal({ existing, onClose }: { existing: ArtistAccount[]; onClose: () => void }) {
  const saveAccounts = useStore(s => s.saveAccounts)
  const [picks, setPicks] = useState<Pick[] | null>(null)
  const [hadPasswords, setHadPasswords] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [added, setAdded] = useState<number | null>(null)

  // The file is opened right here in the browser. The password column is recognised by its heading and skipped:
  // it is never read into the list and nothing is uploaded.
  async function choose(file: File) {
    setNote(''); setPicks(null)
    try {
      let sheets: { rows: unknown[][] }[]
      if (/\.csv$/i.test(file.name)) sheets = [{ rows: parseCsv(await file.text()) }]
      else if (/\.xlsx$/i.test(file.name)) {
        const { default: readXlsxFile } = await import('read-excel-file/browser')
        sheets = (await readXlsxFile(file)).map(s => ({ rows: s.data as unknown[][] }))
      } else { setNote('Please choose an Excel (.xlsx) or CSV file. In Google Sheets: File, then Download.'); return }

      const parsed = sheets.map(s => parseAccountsSheet(s.rows)).filter(p => p.found)
      if (parsed.length === 0) { setNote("Couldn't find a list of logins in that file. It needs a column for the website or app, and one for the username."); return }
      setHadPasswords(parsed.some(p => p.hadPasswordColumn))
      const have = new Set(existing.map(a => `${a.platform.toLowerCase()}|${(a.username ?? '').toLowerCase()}`))
      setPicks(parsed.flatMap(p => p.items).map((it, i) => {
        const key = `${it.platform.toLowerCase()}|${it.username.toLowerCase()}`
        const duplicate = have.has(key)
        return { ...it, key: `${i}-${key}`, duplicate, selected: !duplicate && it.username !== '' }
      }))
    } catch {
      setNote("Couldn't open that file. Is it a real Excel or CSV file?")
    }
  }

  async function add() {
    const chosen = (picks ?? []).filter(p => p.selected && !p.duplicate)
    if (chosen.length === 0) return
    setBusy(true)
    const r = await saveAccounts(chosen.map(p => {
      const preset = PLATFORM_PRESETS.find(x => x.name.toLowerCase() === p.platform.toLowerCase())
      return { id: 'acct-' + uid(), platform: p.platform, category: guessCategory(p.platform), username: p.username || undefined, access: 'unsorted', twoFactor: 'unknown', loginUrl: preset?.loginUrl } as ArtistAccount
    }))
    setBusy(false)
    if (r.ok) setAdded(chosen.length); else setNote(r.error)
  }

  const count = (picks ?? []).filter(p => p.selected && !p.duplicate).length

  if (added !== null) {
    return (
      <Modal title="Imported" onClose={onClose} footer={<button onClick={onClose} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover">Done</button>}>
        <p className="text-sm">Added {added} account{added === 1 ? '' : 's'}. For each one, set how the team gets in and what protects the sign-in.</p>
        {hadPasswords && (
          <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <b className="font-semibold">The passwords were not read.</b> Next: import that sheet into your team password manager (both 1Password and Bitwarden accept a CSV), then delete the file from your computer and delete the sheet.
          </div>
        )}
      </Modal>
    )
  }

  return (
    <Modal
      title="Import accounts from a sheet" wide onClose={onClose}
      footer={<>
        <button onClick={onClose} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium hover:bg-gray-50">Cancel</button>
        {picks && <button onClick={add} disabled={busy || count === 0} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">{busy ? 'Adding…' : `Add ${count} account${count === 1 ? '' : 's'}`}</button>}
      </>}
    >
      <p className="text-sm text-gray-600">Choose the sheet you keep logins in (Excel or CSV). Only the website or app and the username are used. The password column is skipped, and the file never leaves your computer.</p>
      <input type="file" accept=".xlsx,.csv" onChange={e => { const f = e.target.files?.[0]; if (f) choose(f) }} className="block w-full text-sm" />
      {note && <p role="alert" className="text-sm text-red-600">{note}</p>}
      {picks && (
        <>
          {hadPasswords && <p className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">A password column was found and ignored.</p>}
          <ul className="max-h-[40vh] divide-y divide-gray-100 overflow-auto rounded-xl border border-gray-100">
            {picks.map(p => (
              <li key={p.key} className="flex items-center gap-3 px-3 py-2 text-sm">
                <input
                  type="checkbox" checked={p.selected && !p.duplicate} disabled={p.duplicate}
                  onChange={e => setPicks(list => (list ?? []).map(x => x.key === p.key ? { ...x, selected: e.target.checked } : x))}
                  aria-label={`Add ${p.platform}`}
                />
                <span className="font-medium">{p.platform}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-gray-500">{p.username || 'no login in the sheet'}</span>
                <span className="text-xs text-gray-400">{p.duplicate ? 'Already listed' : categoryLabel(guessCategory(p.platform))}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  )
}
