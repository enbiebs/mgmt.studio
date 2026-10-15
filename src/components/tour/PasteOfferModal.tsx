'use client'
// ──────────────────────────────────────────────────────────
//  PasteOfferModal — paste an offer (an email, a message) or attach it as a PDF / Word file,
//  and the offer form opens with everything it says already filled in. Nothing is saved until
//  the person has looked it over in the form and pressed "Add offer".
// ──────────────────────────────────────────────────────────

import { useState } from 'react'
import { useStore } from '@/lib/store'
import { Modal, inputClass } from '@/components/ui/Modal'
import { toPrefill, type OfferPrefill, type OfferReading } from '@/lib/offer-paste'

export function PasteOfferModal({ onClose, onRead }: {
  onClose: () => void
  onRead: (prefill: OfferPrefill, notices: string[]) => void
}) {
  const clientId = useStore(s => s.clientId)
  const loadFxRates = useStore(s => s.loadFxRates)
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function read() {
    setError(null); setBusy(true)
    try {
      const form = new FormData()
      form.append('clientId', clientId ?? ''); form.append('text', text)
      if (file) form.append('file', file)
      const res = await fetch('/api/offer-paste/read', { method: 'POST', body: form })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Something went wrong. Please try again.')
      // Today's exchange rates, so an offer in pounds or euros can be shown in dollars.
      await loadFxRates().catch(console.error)
      const { prefill, notices } = toPrefill(json.reading as OfferReading, useStore.getState().fxRates)
      onRead(prefill, notices)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the offer')
      setBusy(false)
    }
  }

  const empty = text.trim() === '' && !file

  return (
    <Modal
      title="Paste an offer"
      onClose={onClose}
      wide
      footer={
        <>
          <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button
            onClick={read}
            disabled={busy || empty}
            className="px-3 py-1.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover disabled:opacity-40"
          >
            {busy ? 'Reading…' : 'Fill in the offer form'}
          </button>
        </>
      }
    >
      <p className="text-sm text-gray-500">
        Paste the offer email or message, or attach it as a PDF or Word file. I&apos;ll fill in the offer form for you to check &mdash; nothing is saved until you press Add offer.
      </p>
      {error && <div className="rounded-lg border border-red-200 text-red-600 text-xs px-3 py-2">{error}</div>}
      <textarea
        className={`${inputClass} h-56 resize-y font-sans leading-relaxed`}
        placeholder="Paste the offer here…"
        value={text}
        onChange={e => setText(e.target.value)}
        disabled={busy}
        autoFocus
      />
      <div className="space-y-1">
        <label className="block text-xs font-semibold text-gray-500">Or attach a file (PDF or Word, up to 3.5MB)</label>
        <input
          type="file" accept=".pdf,.docx"
          disabled={busy}
          onChange={e => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-gray-500 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border file:border-gray-200 file:bg-canvas file:text-sm file:font-medium hover:file:bg-gray-50"
        />
      </div>
      {busy && <div className="text-xs text-gray-400">Reading the offer… this takes a few seconds.</div>}
    </Modal>
  )
}
