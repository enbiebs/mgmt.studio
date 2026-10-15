'use client'
// ──────────────────────────────────────────────────────────
//  SettlementUploadModal — attach a settlement (PDF or a photo/scan), have it read, then
//  check what it found before anything is saved: which show(s) it is for, your payout
//  lines (editable), and the arithmetic checks. Confirming saves it, freezes today's
//  exchange rates into it and settles the linked offers.
// ──────────────────────────────────────────────────────────

import { useMemo, useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import { Modal, FormField, inputClass, selectClass } from '@/components/ui/Modal'
import { createClient } from '@/lib/supabase/client'
import { Checks, Fold, PromoterCosts, TicketTable } from '@/components/tour/SettlementSections'
import { money2, PAYOUT_KIND_LABEL } from '@/lib/settlement-math'
import type { Currency, PayoutKind, SettlementDraft } from '@/types'

type Step = 'pick' | 'working' | 'review'
const MAX_BYTES = 20 * 1024 * 1024
const KINDS = Object.keys(PAYOUT_KIND_LABEL) as PayoutKind[]
const EXT_BY_TYPE: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const EMPTY: SettlementDraft = {
  currency: 'USD', showDates: [], boxOffice: [], expenses: [], payout: [], totalDue: 0, payments: [],
}

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
  return data
}

export function SettlementUploadModal({ onClose, presetShowId }: { onClose: () => void; presetShowId?: string }) {
  const clientId = useStore(s => s.clientId)
  const client = useStore(s => s.getClient())
  const confirmSettlement = useStore(s => s.confirmSettlement)

  const [step, setStep] = useState<Step>('pick')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [readError, setReadError] = useState('')
  const [file, setFile] = useState<{ path: string; name: string } | null>(null)
  const [draft, setDraft] = useState<SettlementDraft>(EMPTY)
  // Amounts are typed as text so half-typed numbers ("-", "12.") don't fight the input.
  const [lines, setLines] = useState<{ label: string; kind: PayoutKind; amount: string }[]>([])
  const [totalText, setTotalText] = useState('')
  const [showIds, setShowIds] = useState<string[]>(presetShowId ? [presetShowId] : [])
  const [busy, setBusy] = useState(false)
  const saved = useRef(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const shows = useMemo(() => [...(client?.tour.shows ?? [])].sort((a, b) => b.date.localeCompare(a.date)), [client])
  const settledShowIds = new Set((client?.finance.settlements ?? []).flatMap(s => s.showIds))

  function discardFile(path: string) {
    if (!clientId || !path) return
    fetch('/api/settlements/file', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, path }),
    }).catch(console.error)
  }

  function handleClose() {
    if (!saved.current && file) discardFile(file.path)
    onClose()
  }

  async function handleFile(f: File) {
    setError('')
    const ext = EXT_BY_TYPE[f.type]
    if (!ext) { setError('Please choose a PDF, JPG, PNG or WEBP file.'); return }
    if (f.size > MAX_BYTES) { setError('That file is too large (20MB max).'); return }
    if (!clientId) return

    let uploaded = ''
    setStep('working')
    try {
      setStatus('Uploading…')
      const { path, token } = await post('/api/settlements/upload-url', { clientId, ext })
      const { error: uploadErr } = await createClient().storage.from('settlements').uploadToSignedUrl(path, token, f, { contentType: f.type })
      if (uploadErr) throw new Error('The upload failed - please try again.')
      uploaded = path
      setFile({ path, name: f.name })

      setStatus('Reading the settlement… this can take up to a minute')
      const data: { draft: SettlementDraft | null; readError?: string } = await post('/api/settlements/extract', { clientId, path })
      const d = data.draft ?? EMPTY
      if (!data.draft) setReadError(data.readError ?? "Couldn't read this settlement automatically - fill it in by hand.")
      setDraft(d)
      setLines(d.payout.map(l => ({ label: l.label, kind: l.kind, amount: String(l.amount) })))
      setTotalText(data.draft ? String(d.totalDue) : '')
      // Suggest the shows whose date matches a date printed on the statement.
      if (!presetShowId) {
        const matches = shows.filter(s => d.showDates.includes(s.date)).map(s => s.id)
        if (matches.length > 0) setShowIds(matches)
      }
      setStep('review')
    } catch (e) {
      discardFile(uploaded)
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setStep('pick')
    }
  }

  // What would be saved, built from the form as it stands (so the checks update as you edit).
  const num = (s: string) => { const n = Number(s); return Number.isFinite(n) ? n : 0 }
  const built: SettlementDraft = {
    ...draft,
    payout: lines.filter(l => l.label.trim() !== '').map(l => ({ label: l.label.trim(), kind: l.kind, amount: num(l.amount) })),
    totalDue: num(totalText),
  }
  const canSave = showIds.length > 0 && built.payout.length > 0 && !busy
  const cur = draft.currency

  async function handleSave() {
    if (!canSave) return
    setBusy(true)
    setError('')
    const result = await confirmSettlement(built, { showIds, filePath: file?.path, fileName: file?.name })
    setBusy(false)
    if (result.ok) { saved.current = true; onClose() } else setError(result.error)
  }

  // ── Step 1: choose the file ──
  if (step === 'pick' || step === 'working') {
    return (
      <Modal title="Add a settlement" onClose={handleClose} footer={<button onClick={handleClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>}>
        <p className="text-sm text-gray-500">Upload the settlement the promoter sent (a PDF, or a photo or scan). The app reads it, then you check what it found before anything is saved.</p>
        {step === 'working' ? (
          <div className="flex items-center gap-3 py-6 justify-center text-sm text-gray-500">
            <div className="w-4 h-4 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />{status}
          </div>
        ) : (
          <button
            onClick={() => fileInput.current?.click()}
            className="w-full border-2 border-dashed border-gray-200 rounded-xl py-8 text-sm text-gray-400 hover:border-accent hover:text-accent transition-colors"
          >Choose a settlement file…</button>
        )}
        <input ref={fileInput} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
        {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
      </Modal>
    )
  }

  // ── Step 2: check what was found ──
  const s = draft.summary
  return (
    <Modal title="Check this settlement" onClose={handleClose} wide footer={
      <>
        <button onClick={handleClose} disabled={busy} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
        <button onClick={handleSave} disabled={!canSave} className="px-3 py-1.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover disabled:opacity-50">
          {busy ? 'Saving…' : 'Confirm settlement'}
        </button>
      </>
    }>
      {readError && <div className="text-sm rounded-lg bg-amber-50 text-amber-800 px-3 py-2">{readError}</div>}

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Event"><input className={inputClass} value={draft.eventName ?? ''} onChange={e => setDraft({ ...draft, eventName: e.target.value || undefined })} /></FormField>
        <FormField label="Venue"><input className={inputClass} value={draft.venue ?? ''} onChange={e => setDraft({ ...draft, venue: e.target.value || undefined })} /></FormField>
        <FormField label="Promoter"><input className={inputClass} value={draft.promoter ?? ''} onChange={e => setDraft({ ...draft, promoter: e.target.value || undefined })} /></FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Prepared on"><input type="date" className={inputClass} value={draft.preparedOn ?? ''} onChange={e => setDraft({ ...draft, preparedOn: e.target.value || undefined })} /></FormField>
          <FormField label="Currency">
            <select className={selectClass} value={cur} onChange={e => setDraft({ ...draft, currency: e.target.value as Currency })}>
              <option>USD</option><option>GBP</option><option>EUR</option>
            </select>
          </FormField>
        </div>
      </div>

      <FormField label="Which show(s) is this settlement for?">
        <div className="border border-gray-100 rounded-lg max-h-36 overflow-auto p-1.5 space-y-0.5">
          {shows.length === 0 && <div className="text-xs text-gray-300 px-1">No shows yet</div>}
          {shows.map(sh => (
            <label key={sh.id} className="flex items-center gap-2 text-xs px-1 py-0.5 hover:bg-gray-50 rounded cursor-pointer">
              <input type="checkbox" className="rounded" checked={showIds.includes(sh.id)} onChange={e => setShowIds(e.target.checked ? [...showIds, sh.id] : showIds.filter(id => id !== sh.id))} />
              {sh.venue} <span className="text-gray-400">· {sh.city} · {sh.date}</span>
              {draft.showDates.includes(sh.date) && <span className="text-[10px] font-semibold text-green-700 bg-green-50 rounded-full px-1.5">date on the statement</span>}
              {settledShowIds.has(sh.id) && <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 rounded-full px-1.5">already settled</span>}
            </label>
          ))}
        </div>
        <div className="text-[11px] text-gray-400 mt-1">
          {draft.showDates.length > 0 ? `The statement covers ${draft.showDates.join(' and ')}. ` : ''}
          {showIds.length > 1 ? `Your money is split evenly across the ${showIds.length} shows.` : 'If it covers several nights, tick each one and the money is split evenly.'}
        </div>
      </FormField>

      {(s?.gross || draft.attendance?.sold || draft.deal?.description) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          {[
            ['Tickets sold', draft.attendance?.sold ? `${draft.attendance.sold.toLocaleString('en-US')}${draft.attendance.capacity ? ` / ${draft.attendance.capacity.toLocaleString('en-US')}` : ''}` : '—'],
            ['Gross', s?.gross ? money2(s.gross, cur) : '—'],
            ['Net show receipts', s?.netShowReceipts ? money2(s.netShowReceipts, cur) : '—'],
            ['Deal', draft.deal?.description ?? '—'],
          ].map(([label, value]) => (
            <div key={label} className="bg-gray-50 rounded-lg px-2 py-2">
              <div className="text-[10px] uppercase tracking-widest text-gray-400">{label}</div>
              <div className="text-sm font-semibold break-words">{value}</div>
            </div>
          ))}
        </div>
      )}

      <FormField label="Your payout (edit anything that was read wrongly)">
        <div className="space-y-1.5">
          {lines.map((l, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input className={`${inputClass} flex-1 min-w-[9rem]`} value={l.label} onChange={e => setLines(lines.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
              <select className={`${selectClass} !w-36`} value={l.kind} onChange={e => setLines(lines.map((x, j) => j === i ? { ...x, kind: e.target.value as PayoutKind } : x))}>
                {KINDS.map(k => <option key={k} value={k}>{PAYOUT_KIND_LABEL[k]}</option>)}
              </select>
              <input className={`${inputClass} !w-32 text-right`} inputMode="decimal" value={l.amount} onChange={e => setLines(lines.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} />
              <button type="button" aria-label="Remove line" onClick={() => setLines(lines.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-400 px-1">×</button>
            </div>
          ))}
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setLines([...lines, { label: '', kind: 'deduction', amount: '' }])} className="text-xs text-accent hover:underline">+ Add a line</button>
            <span className="ml-auto text-xs text-gray-400">Total due to the artist</span>
            <input className={`${inputClass} !w-32 text-right font-semibold`} inputMode="decimal" value={totalText} onChange={e => setTotalText(e.target.value)} />
          </div>
          <div className="text-[11px] text-gray-400">Money earned is positive; a deposit, tax or deduction is negative. Deposits and tax are not counted as income.</div>
        </div>
      </FormField>

      <Checks settlement={built} currency={cur} />

      {(draft.boxOffice.length > 0 || draft.expenses.length > 0) && (
        <div className="space-y-2">
          {draft.boxOffice.length > 0 && <Fold title="Ticket sales" hint={`${draft.boxOffice.length} ticket types`}><TicketTable tiers={draft.boxOffice} currency={cur} /></Fold>}
          {draft.expenses.length > 0 && <Fold title="The promoter's costs" hint={`${draft.expenses.length} lines`}><PromoterCosts expenses={draft.expenses} currency={cur} /></Fold>}
        </div>
      )}

      <div className="text-[11px] text-gray-400">Today&apos;s exchange rates are saved with the settlement, so its numbers never change after this.</div>
      {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
    </Modal>
  )
}
