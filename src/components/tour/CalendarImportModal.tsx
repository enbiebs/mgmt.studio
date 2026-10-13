'use client'
// ──────────────────────────────────────────────────────────
//  CalendarImportModal — bring an artist's master-calendar spreadsheet in as Shows.
//  Pick the file -> pick the tabs -> the app reads every row -> YOU check and fix the rows ->
//  only then are shows created. Nothing is saved before the last button is pressed.
// ──────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { Modal } from '@/components/ui/Modal'
import { findDuplicate, rowToShow, showsOnSameDay, type ImportRow, type SheetTab } from '@/lib/calendar-import'
import { uid } from '@/lib/utils'
import type { Currency, Show } from '@/types'

type Step = 'file' | 'tabs' | 'reading' | 'review' | 'done'
type ReviewRow = ImportRow & { include: boolean }

async function postForm(url: string, form: FormData) {
  const res = await fetch(url, { method: 'POST', body: form })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Something went wrong. Please try again.')
  return json
}

const small = 'px-2 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:border-blue-400 bg-canvas transition-colors'
const longDate = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export function CalendarImportModal({ onClose }: { onClose: () => void }) {
  const clientId = useStore(s => s.clientId)
  const client = useStore(s => s.getClient())
  const importShows = useStore(s => s.importShows)

  const [step, setStep] = useState<Step>('file')
  const [file, setFile] = useState<File | null>(null)
  const [tabs, setTabs] = useState<SheetTab[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [includePast, setIncludePast] = useState(false)
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [skippedPast, setSkippedPast] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ saved: number; failed: number } | null>(null)

  const existing = useMemo(() => client?.tour.shows ?? [], [client])

  async function chooseFile(f: File) {
    setError(null)
    if (!/\.xlsx$/i.test(f.name)) { setError('Please choose an Excel (.xlsx) file. In Google Sheets: File → Download → Microsoft Excel.'); return }
    setBusy(true)
    try {
      const form = new FormData()
      form.append('file', f); form.append('clientId', clientId ?? '')
      const { tabs: found } = await postForm('/api/calendar-import/tabs', form) as { tabs: SheetTab[] }
      const thisYear = new Date().getFullYear()
      setFile(f); setTabs(found)
      setPicked(found.filter(t => t.supported && t.upcoming > 0 && (t.year == null || t.year >= thisYear)).map(t => t.name))
      setStep('tabs')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not open that file') }
    setBusy(false)
  }

  async function readRows() {
    if (!file) return
    setError(null); setStep('reading')
    try {
      const form = new FormData()
      form.append('file', file); form.append('clientId', clientId ?? '')
      form.append('tabs', JSON.stringify(picked)); form.append('includePast', includePast ? '1' : '0')
      const out = await postForm('/api/calendar-import/read', form) as { rows: ImportRow[]; skippedPast: number }
      setRows(out.rows.map(r => ({
        ...r,
        include: r.kind === 'show' && r.venue.trim() !== '' && !findDuplicate(r, existing),
      })))
      setSkippedPast(out.skippedPast)
      setStep('review')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not read the calendar'); setStep('tabs') }
  }

  const patch = (key: string, p: Partial<ReviewRow>) => setRows(prev => prev.map(r => (r.key === key ? { ...r, ...p } : r)))
  const shows = rows.filter(r => r.kind === 'show')
  const others = rows.filter(r => r.kind !== 'show')
  const ready = (r: ReviewRow) => r.include && r.venue.trim() !== '' && /^\d{4}-\d{2}-\d{2}$/.test(r.date)
  const toImport = shows.filter(ready)
  const assumedCount = toImport.filter(r => r.currencyAssumed).length

  async function doImport() {
    setBusy(true)
    const label = (file?.name ?? 'spreadsheet').replace(/\.xlsx$/i, '')
    const made: Show[] = toImport.map(r => rowToShow(r, 'show-' + uid(), `"${label}"`))
    setResult(await importShows(made))
    setBusy(false); setStep('done')
  }

  const title = step === 'review' ? `Check these before they're added${client ? ` to ${client.name}` : ''}` : 'Import a calendar from a spreadsheet'
  const bigStep = step === 'review'

  return (
    <Modal
      title={title}
      onClose={onClose}
      xwide={bigStep}
      wide={!bigStep}
      footer={
        step === 'review' ? (
          <>
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
            <button
              onClick={doImport}
              disabled={busy || toImport.length === 0}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              {busy ? 'Adding…' : `Add ${toImport.length} show${toImport.length === 1 ? '' : 's'}`}
            </button>
          </>
        ) : step === 'tabs' ? (
          <>
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
            <button
              onClick={readRows}
              disabled={picked.length === 0}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              Read these tabs
            </button>
          </>
        ) : step === 'done' ? (
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors">Done</button>
        ) : step === 'file' ? (
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
        ) : undefined
      }
    >
      {error && <div className="rounded-lg border border-red-200 text-red-600 text-xs px-3 py-2">{error}</div>}

      {step === 'file' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            Choose the Excel file your tour calendar lives in. Nothing is added yet &mdash; you&apos;ll check every row first.
          </p>
          <p className="text-xs text-gray-400">In Google Sheets: File → Download → Microsoft Excel (.xlsx).</p>
          <label className="block">
            <span className="sr-only">Choose an Excel file</span>
            <input
              type="file" accept=".xlsx"
              disabled={busy}
              onChange={e => { const f = e.target.files?.[0]; if (f) void chooseFile(f) }}
              className="block w-full text-sm text-gray-500 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border file:border-gray-200 file:bg-canvas file:text-sm file:font-medium hover:file:bg-gray-50"
            />
          </label>
          {busy && <div className="text-xs text-gray-400">Opening the file…</div>}
        </div>
      )}

      {step === 'tabs' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">Which tabs should I read? I&apos;ve ticked the ones that look like this year or later.</p>
          <div className="space-y-1.5">
            {tabs.map(t => (
              <label key={t.name} className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border ${t.supported ? 'border-gray-200 cursor-pointer hover:bg-gray-50' : 'border-gray-100 opacity-50'}`}>
                <input
                  type="checkbox" className="mt-0.5"
                  disabled={!t.supported}
                  checked={picked.includes(t.name)}
                  onChange={e => setPicked(p => (e.target.checked ? [...p, t.name] : p.filter(n => n !== t.name)))}
                />
                <span className="text-sm">
                  <span className="font-medium">{t.name}</span>
                  <span className="block text-xs text-gray-400">
                    {t.supported ? `${t.rows} rows with something on them · ${t.upcoming} from today onward` : t.reason}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <label className="flex items-start gap-2.5 text-sm text-gray-600">
            <input type="checkbox" className="mt-0.5" checked={includePast} onChange={e => setIncludePast(e.target.checked)} />
            <span>
              Also bring in dates that have already passed
              <span className="block text-xs text-gray-400">
                Off by default. Past shows will show up in your Inbox as &ldquo;no settlement yet&rdquo; until each one has a settlement.
              </span>
            </span>
          </label>
        </div>
      )}

      {step === 'reading' && (
        <div className="py-10 text-center space-y-2">
          <div className="text-sm font-medium">Reading your calendar…</div>
          <div className="text-xs text-gray-400">This usually takes about 30 seconds. Please keep this window open.</div>
        </div>
      )}

      {step === 'review' && (
        <div className="space-y-3">
          <div className="text-xs text-gray-500 leading-relaxed">
            I found <b>{shows.length}</b> show{shows.length === 1 ? '' : 's'}
            {others.length > 0 && <> and {others.length} other row{others.length === 1 ? '' : 's'} (travel, days off, notes)</>}
            {!includePast && skippedPast > 0 && <>; {skippedPast} row{skippedPast === 1 ? '' : 's'} on past dates were left out</>}.
            Fix anything that&apos;s wrong, untick what you don&apos;t want, then add them.
          </div>

          {assumedCount > 0 && (
            <div className="rounded-lg border border-amber-300 text-amber-700 text-xs px-3 py-2">
              {assumedCount} fee{assumedCount === 1 ? '' : 's'} had no currency written in the sheet, so I set {assumedCount === 1 ? 'it' : 'them'}{' '}to US dollars. Those are outlined &mdash; change the currency if that&apos;s wrong.
            </div>
          )}

          {shows.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>Set every ticked show to</span>
              <select
                value="" className={`${small} w-36`}
                onChange={e => {
                  const v = e.target.value as 'confirmed' | 'hold' | ''
                  if (v) setRows(prev => prev.map(r => (r.kind === 'show' && r.include ? { ...r, status: v } : r)))
                }}
              >
                <option value="">keep as read…</option>
                <option value="confirmed">Confirmed</option>
                <option value="hold">On hold</option>
              </select>
              <button className="ml-auto underline" onClick={() => setRows(prev => prev.map(r => (r.kind === 'show' ? { ...r, include: r.venue.trim() !== '' && !findDuplicate(r, existing) } : r)))}>
                Reset ticks
              </button>
            </div>
          )}

          <div className="border-t border-gray-100">
            {shows.map(r => (
              <ReviewRowView
                key={r.key} row={r}
                duplicate={findDuplicate(r, existing)}
                sameDay={showsOnSameDay(r.date, existing)}
                alsoInFile={shows.filter(o => o.key !== r.key && o.date === r.date).length}
                onChange={p => patch(r.key, p)}
              />
            ))}
            {shows.length === 0 && <div className="py-6 text-sm text-gray-400 text-center">No shows were found in the tabs you picked.</div>}
          </div>

          {others.length > 0 && (
            <details className="text-xs text-gray-500">
              <summary className="cursor-pointer select-none">{others.length} other row{others.length === 1 ? '' : 's'} that are not shows (not added)</summary>
              <ul className="mt-2 space-y-1">
                {others.map(r => (
                  <li key={r.key} className="flex gap-2">
                    <span className="w-24 flex-shrink-0 text-gray-400">{longDate(r.date)}</span>
                    <span className="w-16 flex-shrink-0 uppercase tracking-wide text-[10px] pt-0.5 text-gray-400">{r.kind}</span>
                    <span>{r.notes || r.source}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {step === 'done' && result && (
        <div className="py-6 text-center space-y-2">
          <div className="text-sm font-semibold">
            {result.failed === 0 ? `Added ${result.saved} show${result.saved === 1 ? '' : 's'}.` : `Added ${result.saved} of ${result.saved + result.failed} shows.`}
          </div>
          <div className="text-xs text-gray-400">
            {result.failed === 0
              ? 'They are on the Tour list and the Calendar now.'
              : `${result.failed} could not be saved. They are showing on screen for now but will be gone after a reload — close this and try importing again.`}
          </div>
        </div>
      )}
    </Modal>
  )
}

function ReviewRowView({ row, duplicate, sameDay, alsoInFile, onChange }: {
  row: ReviewRow
  duplicate: Show | undefined
  sameDay: Show[]
  alsoInFile: number
  onChange: (p: Partial<ReviewRow>) => void
}) {
  const warnings = [...row.warnings]
  if (duplicate) warnings.unshift(`Already in the app: ${duplicate.venue} on ${longDate(duplicate.date)}`)
  else if (sameDay.length > 0) warnings.push(`There is already a show that day: ${sameDay.map(s => s.venue).join(', ')}`)
  if (alsoInFile > 0) warnings.push(`${alsoInFile} other row${alsoInFile === 1 ? '' : 's'} in this file ${alsoInFile === 1 ? 'is' : 'are'} on the same day`)
  if (row.venue.trim() === '') warnings.push('Needs a venue before it can be added')

  return (
    <div className={`border-b border-gray-100 py-2.5 ${row.include ? '' : 'opacity-60'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <input type="checkbox" checked={row.include} onChange={e => onChange({ include: e.target.checked })} aria-label={`Add ${row.venue || 'this row'}`} />
        <input type="date" value={row.date} onChange={e => onChange({ date: e.target.value })} className={`${small} w-[128px]`} />
        <input value={row.venue} onChange={e => onChange({ venue: e.target.value })} placeholder="Venue" className={`${small} flex-1 min-w-[170px]`} />
        <input value={row.city} onChange={e => onChange({ city: e.target.value })} placeholder="City" className={`${small} w-[140px]`} />
        <select value={row.status} onChange={e => onChange({ status: e.target.value as 'confirmed' | 'hold' })} className={`${small} w-[98px]`}>
          <option value="confirmed">Confirmed</option>
          <option value="hold">On hold</option>
        </select>
        <input
          type="number" min={0} value={row.guarantee ?? ''} placeholder="Fee"
          onChange={e => onChange({ guarantee: e.target.value === '' ? undefined : Number(e.target.value) })}
          className={`${small} w-[84px]`}
        />
        <select
          value={row.currency ?? 'USD'}
          onChange={e => onChange({ currency: e.target.value as Currency, currencyAssumed: false })}
          className={`${small} w-[64px] ${row.currencyAssumed ? '!border-amber-400' : ''}`}
          aria-label="Currency"
        >
          <option>USD</option><option>GBP</option><option>EUR</option>
        </select>
      </div>
      <div className="pl-6 mt-1.5">
        <input value={row.notes} onChange={e => onChange({ notes: e.target.value })} placeholder="Notes" className={`${small} w-full`} />
        {warnings.map((w, i) => <div key={i} className="text-[11px] text-amber-700 mt-1">{w}</div>)}
        <details className="mt-1 text-[11px] text-gray-400">
          <summary className="cursor-pointer select-none">What the sheet said (row {row.sheetRow}, {row.tab} tab)</summary>
          <div className="mt-1 break-words">{row.source}</div>
        </details>
      </div>
    </div>
  )
}
