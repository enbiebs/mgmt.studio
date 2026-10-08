'use client'
// ──────────────────────────────────────────────────────────
//  BillUploadModal — attach a bill PDF, have it read automatically, then
//  confirm everything before it's saved. The bill becomes an Expense; its
//  vendor is matched against (or added to) the saved vendor list, and any
//  vendor detail that differs from what's saved is flagged.
// ──────────────────────────────────────────────────────────

import { useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import { Modal, FormField, inputClass, selectClass } from '@/components/ui/Modal'
import { createClient } from '@/lib/supabase/client'
import { normalizeVendorName, diffVendor, VENDOR_FIELD_LABEL } from '@/lib/vendors'
import { CAT_LABELS } from '@/lib/expense-categories'
import { uid, today } from '@/lib/utils'
import type { Currency, ExpenseCategory, Vendor } from '@/types'

type Step = 'pick' | 'working' | 'review'

type Extracted = {
  vendorName: string
  address: string | null; email: string | null; phone: string | null; taxId: string | null
  bankLast4: string | null; bankFingerprint: string | null
  billNumber: string | null; description: string; amount: number; currency: Currency
  billDate: string | null; dueDate: string | null; category: ExpenseCategory
}

const MAX_BYTES = 20 * 1024 * 1024

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
  return data
}

export function BillUploadModal({ onClose }: { onClose: () => void }) {
  const clientId = useStore(s => s.clientId)
  const client = useStore(s => s.getClient())
  const addBill = useStore(s => s.addBill)

  const [step, setStep] = useState<Step>('pick')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [readError, setReadError] = useState('')
  const [filePath, setFilePath] = useState('')
  const [bank, setBank] = useState<{ bankLast4?: string; bankFingerprint?: string }>({})
  const [resolution, setResolution] = useState<'keep' | 'update'>('keep')
  const [f, setF] = useState({
    vendorName: '', billNumber: '', description: '', amount: '', currency: 'USD' as Currency,
    category: 'other' as ExpenseCategory, date: today(), dueDate: '',
    address: '', email: '', phone: '', taxId: '',
  })
  const saved = useRef(false)
  const fileInput = useRef<HTMLInputElement>(null)

  function discardFile(path: string) {
    if (!clientId || !path) return
    fetch('/api/bills/file', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, path }),
    }).catch(console.error)
  }

  function handleClose() {
    if (!saved.current) discardFile(filePath)
    onClose()
  }

  async function handleFile(file: File) {
    setError('')
    if (file.type !== 'application/pdf') { setError('Please choose a PDF file.'); return }
    if (file.size > MAX_BYTES) { setError('That PDF is too large (20MB max).'); return }
    if (!clientId) return

    let uploaded = ''
    setStep('working')
    try {
      setStatus('Uploading…')
      const { path, token } = await post('/api/bills/upload-url', { clientId })
      const { error: uploadErr } = await createClient().storage.from('bills').uploadToSignedUrl(path, token, file, { contentType: 'application/pdf' })
      if (uploadErr) throw new Error('The upload failed - please try again.')
      uploaded = path
      setFilePath(path)

      setStatus('Reading the bill…')
      const data: { extracted: Extracted | null; readError?: string } = await post('/api/bills/extract', { clientId, path })
      const x = data.extracted
      if (x) {
        setF({
          vendorName: x.vendorName, billNumber: x.billNumber ?? '', description: x.description,
          amount: String(x.amount), currency: x.currency, category: x.category,
          date: x.billDate ?? today(), dueDate: x.dueDate ?? '',
          address: x.address ?? '', email: x.email ?? '', phone: x.phone ?? '', taxId: x.taxId ?? '',
        })
        setBank({ bankLast4: x.bankLast4 ?? undefined, bankFingerprint: x.bankFingerprint ?? undefined })
      } else {
        setReadError(data.readError ?? "Couldn't read this bill automatically - fill in the details by hand.")
      }
      setStep('review')
    } catch (e) {
      discardFile(uploaded)
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setStep('pick')
    }
  }

  // Matching and change-checking run live against the current form values,
  // so editing the vendor name or a detail updates the warnings instantly.
  const vendors = client?.finance?.vendors ?? []
  const matched = vendors.find(v => normalizeVendorName(v.name) === normalizeVendorName(f.vendorName)) ?? null
  const clean = (s: string) => s.trim() || undefined
  const details = { address: clean(f.address), email: clean(f.email), phone: clean(f.phone), taxId: clean(f.taxId), ...bank }
  const changes = matched ? diffVendor(matched, details) : []
  const amount = Number(f.amount)
  const canSave = f.vendorName.trim().length > 0 && amount > 0

  function handleSave() {
    if (!canSave) return
    let vendor: Vendor
    if (matched) {
      // A detail the saved vendor lacks is always filled in from this bill;
      // where the two disagree, the person's choice decides.
      const keep = changes.length > 0 && resolution === 'keep'
      const pick = <T,>(savedValue: T | undefined, newValue: T | undefined) => keep ? (savedValue ?? newValue) : (newValue ?? savedValue)
      const bankFrom = keep ? (matched.bankLast4 ? matched : details) : (details.bankLast4 ? details : matched)
      vendor = {
        ...matched,
        address: pick(matched.address, details.address), email: pick(matched.email, details.email),
        phone: pick(matched.phone, details.phone), taxId: pick(matched.taxId, details.taxId),
        bankLast4: bankFrom.bankLast4, bankFingerprint: bankFrom.bankFingerprint,
      }
    } else {
      vendor = { id: 'ven-' + uid(), name: f.vendorName.trim(), ...details }
    }
    addBill({
      expense: {
        description: f.description.trim() || `Bill from ${f.vendorName.trim()}`,
        vendor: matched?.name ?? f.vendorName.trim(),
        amount, currency: f.currency, category: f.category, date: f.date, paid: false,
        dueDate: f.dueDate || undefined,
        billNumber: clean(f.billNumber),
        billFilePath: filePath || undefined,
        vendorFlags: changes.length ? changes.map(c => c.field) : undefined,
      },
      vendor,
    })
    saved.current = true
    onClose()
  }

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF(p => ({ ...p, [k]: e.target.value }))
  const cancelBtn = <button onClick={handleClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>

  if (step === 'pick' || step === 'working') {
    return (
      <Modal title="Upload a bill" onClose={handleClose} footer={step === 'pick' ? cancelBtn : undefined}>
        {step === 'working' ? (
          <div className="py-8 text-center text-sm text-gray-500 animate-pulse">{status}</div>
        ) : (
          <>
            <p className="text-sm text-gray-500">Attach the bill as a PDF. The details are read automatically and you&apos;ll check them before anything is saved.</p>
            <input
              ref={fileInput} type="file" accept="application/pdf" className="hidden"
              onChange={e => { const file = e.target.files?.[0]; if (file) handleFile(file); e.target.value = '' }}
            />
            <button
              onClick={() => fileInput.current?.click()}
              className="w-full py-6 border-2 border-dashed border-gray-200 rounded-xl text-sm font-medium text-gray-500 hover:border-blue-300 hover:text-blue-500 transition-colors"
            >
              Choose a PDF…
            </button>
            {error && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
          </>
        )}
      </Modal>
    )
  }

  return (
    <Modal wide title="Confirm this bill" onClose={handleClose} footer={
      <>
        {cancelBtn}
        <button
          onClick={handleSave} disabled={!canSave}
          className="px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Looks good — save bill
        </button>
      </>
    }>
      {readError ? (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">{readError}</div>
      ) : (
        <div className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
          Read from the bill. Check every field below, fix anything that&apos;s wrong, then confirm.
        </div>
      )}
      {filePath && clientId && (
        <a
          href={`/api/bills/file?clientId=${encodeURIComponent(clientId)}&path=${encodeURIComponent(filePath)}`}
          target="_blank" rel="noreferrer" className="inline-block text-xs font-semibold text-blue-500 hover:underline"
        >
          Open the PDF to compare →
        </a>
      )}

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Vendor"><input type="text" className={inputClass} value={f.vendorName} onChange={set('vendorName')} /></FormField>
        <FormField label="Bill / invoice #"><input type="text" className={inputClass} value={f.billNumber} onChange={set('billNumber')} /></FormField>
        <div className="col-span-2">
          <FormField label="What it's for"><input type="text" className={inputClass} value={f.description} onChange={set('description')} /></FormField>
        </div>
        <FormField label="Amount due"><input type="number" className={inputClass} value={f.amount} onChange={set('amount')} /></FormField>
        <FormField label="Currency">
          <select className={selectClass} value={f.currency} onChange={set('currency')}>
            <option value="USD">USD</option><option value="GBP">GBP</option><option value="EUR">EUR</option>
          </select>
        </FormField>
        <FormField label="Bill date"><input type="date" className={inputClass} value={f.date} onChange={set('date')} /></FormField>
        <FormField label="Due date"><input type="date" className={inputClass} value={f.dueDate} onChange={set('dueDate')} /></FormField>
        <div className="col-span-2">
          <FormField label="Category">
            <select className={selectClass} value={f.category} onChange={set('category')}>
              {Object.entries(CAT_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </FormField>
        </div>
      </div>

      <div className="pt-1">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Vendor details</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <FormField label="Address"><input type="text" className={inputClass} value={f.address} onChange={set('address')} /></FormField>
          </div>
          <FormField label="Email"><input type="text" className={inputClass} value={f.email} onChange={set('email')} /></FormField>
          <FormField label="Phone"><input type="text" className={inputClass} value={f.phone} onChange={set('phone')} /></FormField>
          <FormField label="Tax ID"><input type="text" className={inputClass} value={f.taxId} onChange={set('taxId')} /></FormField>
          <FormField label="Bank account">
            <div className="px-2.5 py-2 text-sm text-gray-500 border border-gray-100 rounded-lg bg-gray-50">
              {bank.bankLast4 ? `Account ending ${bank.bankLast4}` : 'None on this bill'}
            </div>
          </FormField>
        </div>
        <div className="mt-2 text-xs text-gray-500">
          {matched
            ? <>Matches your saved vendor <b>{matched.name}</b>.</>
            : f.vendorName.trim() ? <>New vendor — will be added to your vendor list.</> : null}
        </div>
      </div>

      {changes.length > 0 && matched && (
        <div className="border border-red-200 bg-red-50 rounded-xl p-3 space-y-2">
          <div className="text-sm font-semibold text-red-700">⚠ Vendor details changed since the last bill</div>
          <ul className="text-xs text-red-800 space-y-0.5">
            {changes.map(c => (
              <li key={c.field}>
                <b>{VENDOR_FIELD_LABEL[c.field]}</b>: was “{c.saved ?? '—'}”, now “{c.incoming ?? '—'}”
              </li>
            ))}
          </ul>
          <div className="text-xs text-red-700">Changed payment details are a common sign of invoice fraud — confirm with the vendor directly before paying.</div>
          <div className="space-y-1 pt-1">
            <label className="flex items-center gap-2 text-sm text-red-800">
              <input type="radio" checked={resolution === 'keep'} onChange={() => setResolution('keep')} />
              Keep the saved details
            </label>
            <label className="flex items-center gap-2 text-sm text-red-800">
              <input type="radio" checked={resolution === 'update'} onChange={() => setResolution('update')} />
              Update the vendor to the new details
            </label>
          </div>
          <div className="text-[11px] text-red-600">Either way, this bill will be marked with a warning.</div>
        </div>
      )}
    </Modal>
  )
}
