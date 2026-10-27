'use client'
// ──────────────────────────────────────────────────────────
//  ContractModal — add a contract, or open one to read or change it. A new contract can start from a file or pasted words: the AI
//  reader fills the form in and shows the sentence each answer came from, with "Check this" on anything it was not sure of. Nothing is
//  saved until the person presses Save. People who can only look at Legal open the same screen with the boxes locked.
// ──────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import { Modal, FormField, inputClass, selectClass } from '@/components/ui/Modal'
import { TYPE_LABELS } from '@/components/legal/contract-labels'
import { contractProblemFor, contractToDraft, draftToFields, emptyDraft, type ContractDraft } from '@/lib/contract-form'
import { askConfirm } from '@/lib/confirm'
import { contractImpact } from '@/lib/delete-effects'
import { termFieldsFor } from '@/lib/contract-terms'
import { CONTRACT_TYPES, readingToDraft, type ContractReading, type ReadResult } from '@/lib/contract-reading'
import { CONTRACT_FILE_TYPES, contractFileKind, contractFileUrl, defaultFileLabel, removeContractFiles, uploadContractFile } from '@/lib/contract-files-client'
import { uid, today as todayStr } from '@/lib/utils'
import type { Contract, ContractStatus, Currency } from '@/types'

const STATUSES: { value: ContractStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' }, { value: 'review', label: 'In review' }, { value: 'negotiation', label: 'Negotiating' },
  { value: 'signed', label: 'Signed' }, { value: 'terminated', label: 'Ended or cancelled' },
]

export function ContractModal({ clientId, contract, initial, attachOnOpen, editable, onClose }: {
  clientId: string
  contract?: Contract                    // open this one (omit to add a new one)
  initial?: Partial<ContractDraft>       // start a new one with these filled in (e.g. from a template)
  attachOnOpen?: File                    // a file to keep with the new contract straight away (e.g. the document a template made)
  editable: boolean
  onClose: () => void
}) {
  const workspaceId = useStore(s => s.workspaceId)
  const addContract = useStore(s => s.addContract)
  const updateContract = useStore(s => s.updateContract)
  const deleteContract = useStore(s => s.deleteContract)

  const [draft, setDraft] = useState<ContractDraft>(() => (contract ? contractToDraft(contract) : { ...emptyDraft(), ...initial }))
  const [read, setRead] = useState<ReadResult | null>(null)
  const [edited, setEdited] = useState<Set<string>>(new Set())      // fields the person has changed since the reader filled them
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasted, setPasted] = useState('')
  const added = useRef<string[]>([])    // files uploaded in this window: removed again if the window is closed without saving
  const savedRef = useRef(false)        // set once the contract has been saved or deleted, so closing does not remove its files
  const banner = useRef<HTMLDivElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const attachPicker = useRef<HTMLInputElement>(null)

  const live = !!workspaceId          // without a signed-in company (the sample copy of the app) there is nowhere to keep a file
  const disabled = !editable || !!busy
  const saved = new Set((contract?.files ?? []).map(f => f.path))
  const termFields = termFieldsFor(draft.type)

  function set<K extends keyof ContractDraft>(key: K, value: ContractDraft[K]) {
    setDraft(d => ({ ...d, [key]: value }))
    setEdited(e => new Set(e).add(key as string))
  }
  function setTerm(key: string, value: string) {
    setDraft(d => ({ ...d, terms: { ...d.terms, [key]: value } }))
    setEdited(e => new Set(e).add(`terms.${key}`))
  }

  function note(field: string) {
    const n = read?.notes[field]
    const check = !!read?.check.has(field) && !edited.has(field)
    if (!n && !check) return null
    return (
      <div className="mt-1 text-[11px] leading-snug">
        {check && <span className="mr-1.5 inline-block rounded bg-amber-50 px-1.5 py-px font-semibold text-amber-700">Check this</span>}
        {n && <span className="text-gray-400 italic">From the contract: &ldquo;{n.quote}&rdquo;</span>}
      </div>
    )
  }

  function applyReading(reading: ContractReading) {
    const result = readingToDraft(reading)
    setRead(result)
    setEdited(new Set())
    setDraft(d => ({ ...result.draft, files: d.files }))
  }

  async function readFrom(input: { file?: File; text?: string }) {
    setError('')
    try {
      let path: string | undefined
      if (input.file) {
        setBusy('Uploading the file…')
        path = (await uploadContractFile(clientId, input.file)).path
        added.current.push(path)
        setDraft(d => ({ ...d, files: [...d.files, { id: 'cf-' + uid(), path: path!, name: input.file!.name, label: defaultFileLabel(d.files), addedAt: todayStr() }] }))
      }
      if (path && contractFileKind(input.file!.name) === 'rtf') { setBusy(''); showProblem("That kind of file can't be read automatically. It is attached; fill in the details by hand."); return }
      setBusy('Reading the contract…')
      const res = await fetch('/api/contracts/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, ...(path ? { path } : {}), ...(input.text ? { text: input.text } : {}) }) })
      const json = await res.json().catch(() => ({})) as { reading?: ContractReading | null; readError?: string; error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Could not read that. Fill in the details by hand.')
      if (json.reading) applyReading(json.reading)
      else showProblem(json.readError ?? 'Could not read that automatically. Fill in the details by hand.')
    } catch (e) {
      showProblem(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy('')
      if (picker.current) picker.current.value = ''
    }
  }

  async function attach(file: File) {
    setError('')
    try {
      setBusy('Uploading the file…')
      const { path } = await uploadContractFile(clientId, file)
      added.current.push(path)
      setDraft(d => ({ ...d, files: [...d.files, { id: 'cf-' + uid(), path, name: file.name, label: defaultFileLabel(d.files), addedAt: todayStr() }] }))
    } catch (e) {
      showProblem(e instanceof Error ? e.message : 'The file could not be uploaded.')
    } finally {
      setBusy('')
      if (attachPicker.current) attachPicker.current.value = ''
    }
  }

  const attachStarted = useRef(false)
  useEffect(() => {
    if (attachOnOpen && live && editable && !contract && !attachStarted.current) { attachStarted.current = true; void attach(attachOnOpen) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A problem is shown where the person is looking: scrolled into view, with the box it is about ready to type in.
  const BOX: Partial<Record<keyof ContractDraft, string>> = { title: 'contract-title', counterparty: 'contract-counterparty', expiryDate: 'contract-ends', noticeDays: 'contract-notice', renewalMonths: 'contract-renewal', value: 'contract-value', reminders: 'contract-reminders' }
  function showProblem(message: string, field?: keyof ContractDraft) {
    setError(message)
    window.setTimeout(() => {
      banner.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      const id = field ? BOX[field] : undefined
      if (id) document.getElementById(id)?.focus({ preventScroll: true })
    }, 0)
  }

  function close() {
    // Files uploaded here but never saved with a contract are not kept.
    const leftover = added.current.filter(p => !(contract?.files ?? []).some(f => f.path === p))
    if (leftover.length > 0 && !savedRef.current) void removeContractFiles(clientId, leftover)
    onClose()
  }

  async function save() {
    const problem = contractProblemFor(draft)
    if (problem) { showProblem(problem.message, problem.field); return }
    const fields = draftToFields(draft)
    setBusy('Saving…')
    let ok = true
    if (contract) {
      ok = await updateContract(contract.id, fields)
      // A copy taken off the contract is only removed once the save has gone through (so it is never removed while it is still listed).
      const gone = (contract.files ?? []).filter(f => !draft.files.some(x => x.path === f.path)).map(f => f.path)
      if (ok && gone.length > 0) void removeContractFiles(clientId, gone)
    } else {
      addContract(fields)
    }
    // Files uploaded and then taken out again before saving are not kept either.
    const dropped = added.current.filter(p => !draft.files.some(f => f.path === p))
    if (dropped.length > 0) void removeContractFiles(clientId, dropped)
    savedRef.current = true
    onClose()
  }

  async function remove() {
    if (!contract) return
    const impact = contractImpact(contract)
    const ok = await askConfirm({ title: `Delete "${contract.title}"?`, items: impact.items, confirmLabel: 'Delete contract', note: 'You can undo it for a few seconds right after.' })
    if (!ok) return
    deleteContract(contract.id)
    savedRef.current = true
    const stray = added.current.filter(p => !(contract.files ?? []).some(f => f.path === p))
    if (stray.length > 0) void removeContractFiles(clientId, stray)
    onClose()
  }

  const title = contract ? (editable ? 'Edit contract' : 'Contract') : 'Add a contract'

  return (
    <Modal
      wide
      title={title}
      onClose={close}
      footer={editable ? (
        <>
          {contract && <button onClick={() => void remove()} disabled={!!busy} className="mr-auto px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-40">Delete</button>}
          <button onClick={close} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button onClick={() => void save()} disabled={!!busy} className="px-3 py-1.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover disabled:opacity-40">{contract ? 'Save' : 'Add contract'}</button>
        </>
      ) : (
        <button onClick={close} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Close</button>
      )}
    >
      <div ref={banner}>{error && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}</div>
      {busy && <div role="status" className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">{busy}</div>}

      {/* Start from a file or pasted words (new contracts only) */}
      {!contract && editable && live && (
        <div className="rounded-xl border border-dashed border-gray-200 p-3">
          <div className="text-xs font-semibold text-gray-600">Start from the contract itself</div>
          <div className="mt-0.5 text-[11px] text-gray-400">Choose a PDF or Word file, or paste its words, and the form fills itself in. You check it before anything is saved.</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input ref={picker} type="file" accept={CONTRACT_FILE_TYPES} className="hidden" aria-label="Choose a contract file" onChange={e => { const f = e.target.files?.[0]; if (f) void readFrom({ file: f }) }} />
            <button onClick={() => picker.current?.click()} disabled={!!busy} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 disabled:opacity-40">Choose a PDF or Word file</button>
            <button onClick={() => setPasteOpen(o => !o)} disabled={!!busy} className="px-3 py-1.5 text-xs text-accent hover:underline disabled:opacity-40">{pasteOpen ? 'Hide pasted text' : 'or paste its words'}</button>
          </div>
          {pasteOpen && (
            <div className="mt-2 space-y-2">
              <textarea className={`${inputClass} resize-y`} rows={5} placeholder="Paste the contract's text here" value={pasted} onChange={e => setPasted(e.target.value)} aria-label="Pasted contract text" />
              <button onClick={() => void readFrom({ text: pasted })} disabled={!!busy || !pasted.trim()} className="px-3 py-1.5 bg-accent text-white text-xs font-medium rounded-lg hover:bg-accent-hover disabled:opacity-40">Read it</button>
            </div>
          )}
        </div>
      )}

      {read && read.checkThese.length > 0 && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <div className="font-semibold">Worth a second look</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">{read.checkThese.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}

      <FormField label="Name">
        <input id="contract-title" className={inputClass} value={draft.title} onChange={e => set('title', e.target.value)} disabled={disabled} placeholder="e.g. Management Agreement" autoFocus={!contract} />
        {note('title')}
      </FormField>
      <FormField label="Who it is with">
        <input id="contract-counterparty" className={inputClass} value={draft.counterparty} onChange={e => set('counterparty', e.target.value)} disabled={disabled} placeholder="e.g. Noted Management" />
        {note('counterparty')}
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Kind of contract">
          <select id="contract-type" className={selectClass} value={draft.type} onChange={e => set('type', e.target.value as ContractDraft['type'])} disabled={disabled}>
            {CONTRACT_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
          {note('type')}
        </FormField>
        <FormField label="Where it stands">
          <select id="contract-status" className={selectClass} value={draft.status} onChange={e => set('status', e.target.value as ContractStatus)} disabled={disabled}>
            {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            {draft.status === 'expired' && <option value="expired">Expired</option>}
          </select>
          {note('status')}
        </FormField>
        <FormField label="Signed on">
          <input id="contract-signed" type="date" className={inputClass} value={draft.signedDate} onChange={e => set('signedDate', e.target.value)} disabled={disabled} />
          {note('signedDate')}
        </FormField>
        <FormField label={draft.autoRenews ? 'First term ends on' : 'Ends on'}>
          <input id="contract-ends" type="date" className={inputClass} value={draft.expiryDate} onChange={e => set('expiryDate', e.target.value)} disabled={disabled} />
          {note('expiryDate')}
        </FormField>
      </div>

      <div className="rounded-xl bg-gray-50/70 p-3 space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input id="contract-renews" type="checkbox" checked={draft.autoRenews} onChange={e => set('autoRenews', e.target.checked)} disabled={disabled} />
          <span>It renews by itself unless someone gives notice</span>
        </label>
        {note('autoRenews')}
        <div className="grid grid-cols-2 gap-3">
          {draft.autoRenews && (
            <FormField label="Each renewal lasts (months)">
              <input id="contract-renewal" inputMode="numeric" className={inputClass} value={draft.renewalMonths} onChange={e => set('renewalMonths', e.target.value)} disabled={disabled} placeholder="12" />
              {note('renewalMonths')}
            </FormField>
          )}
          <FormField label="Days of notice needed">
            <input id="contract-notice" inputMode="numeric" className={inputClass} value={draft.noticeDays} onChange={e => set('noticeDays', e.target.value)} disabled={disabled} placeholder="e.g. 60" />
            {note('noticeDays')}
          </FormField>
        </div>
        <div className="text-[11px] text-gray-400">
          {draft.noticeDays.trim()
            ? 'We will remind you before the last day to give notice.'
            : draft.autoRenews
              ? 'It renews by itself: if the contract needs written notice to stop that, enter the days and we will warn you in time. Without it we can only tell you in the last month before it renews.'
              : 'If the contract needs written notice to stop it renewing, to extend it or to end it, enter the number of days and we will remind you in time.'}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <FormField label="Value (optional)">
            <input id="contract-value" inputMode="decimal" className={inputClass} value={draft.value} onChange={e => set('value', e.target.value)} disabled={disabled} placeholder="e.g. 25,000" />
            {note('value')}
          </FormField>
        </div>
        <FormField label="Currency">
          <select id="contract-currency" className={selectClass} value={draft.currency} onChange={e => set('currency', e.target.value as Currency)} disabled={disabled}>
            <option value="USD">USD</option><option value="GBP">GBP</option><option value="EUR">EUR</option>
          </select>
        </FormField>
      </div>

      {termFields.length > 0 && (
        <details className="rounded-xl border border-gray-100 p-3" open={Object.keys(draft.terms).length > 0 || undefined}>
          <summary className="cursor-pointer text-xs font-semibold text-gray-600">Key terms ({TYPE_LABELS[draft.type]})</summary>
          <div className="mt-3 space-y-3">
            {termFields.map(f => (
              <FormField key={f.key} label={f.label}>
                <input id={`contract-term-${f.key}`} className={inputClass} value={draft.terms[f.key] ?? ''} onChange={e => setTerm(f.key, e.target.value)} disabled={disabled} placeholder={f.hint} />
                {note(`terms.${f.key}`)}
              </FormField>
            ))}
          </div>
        </details>
      )}

      <FormField label="Also remind (optional)">
        <textarea id="contract-reminders" className={`${inputClass} resize-none`} rows={2} value={draft.reminders} onChange={e => set('reminders', e.target.value)} disabled={disabled}
          placeholder="e.g. your lawyer's email, your assistant's email" />
        <div className="mt-1 text-[11px] leading-snug text-gray-400">Once the contract is marked Signed, these people get an email 90, 30 and 7 days before the date that matters (the last day to give notice, or the renewal or end). They don&apos;t need a login. They see the artist&apos;s name, the contract&apos;s name, who it is with and the date, not the money or the terms, and each email has a link that stops them. Up to 5 addresses.</div>
      </FormField>

      <FormField label="Notes">
        <textarea id="contract-notes" className={`${inputClass} resize-none`} rows={3} value={draft.notes} onChange={e => set('notes', e.target.value)} disabled={disabled} />
      </FormField>
      <label className="flex items-center gap-2 text-sm">
        <input id="contract-flagged" type="checkbox" checked={draft.flagged} onChange={e => set('flagged', e.target.checked)} disabled={disabled} />
        <span>Flag it for the lawyer&apos;s review</span>
      </label>

      {/* Copies of the contract itself */}
      {(live || draft.files.length > 0) && (
        <div className="rounded-xl border border-gray-100 p-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-gray-600">Copies of the contract</div>
            {editable && live && (
              <>
                <input ref={attachPicker} type="file" accept={CONTRACT_FILE_TYPES} className="hidden" aria-label="Attach a copy of the contract" onChange={e => { const f = e.target.files?.[0]; if (f) void attach(f) }} />
                <button onClick={() => attachPicker.current?.click()} disabled={!!busy} className="text-xs text-accent hover:underline disabled:opacity-40">+ Attach a file</button>
              </>
            )}
          </div>
          {draft.files.length === 0 ? (
            <div className="mt-2 text-[11px] text-gray-400">Keep the signed PDF or the lawyer&apos;s Word version here so everyone finds the same copy.</div>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {draft.files.map(f => (
                <li key={f.id} className="flex items-center gap-2 text-sm">
                  <input aria-label={`Label for ${f.name}`} className="w-36 flex-shrink-0 rounded-md border border-gray-200 bg-canvas px-2 py-1 text-xs disabled:opacity-60" value={f.label} disabled={disabled}
                    onChange={e => setDraft(d => ({ ...d, files: d.files.map(x => x.id === f.id ? { ...x, label: e.target.value } : x) }))} />
                  {contract && saved.has(f.path)
                    ? <a href={contractFileUrl(clientId, contract.id, f.path)} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-accent hover:underline">{f.name}</a>
                    : <span className="min-w-0 flex-1 truncate text-gray-500" title="Opens once the contract is saved">{f.name}</span>}
                  {editable && <button aria-label={`Remove ${f.name}`} onClick={() => setDraft(d => ({ ...d, files: d.files.filter(x => x.id !== f.id) }))} disabled={!!busy} className="text-gray-300 hover:text-red-500 disabled:opacity-40">✕</button>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  )
}
