'use client'
// ──────────────────────────────────────────────────────────
//  SendOfferSheetModal — freeze an offer + its budget into a numbered sheet for the
//  artist. Shows a live preview of exactly what they will get; nothing leaves until
//  "Send" is pressed and the sheet is really saved.
// ──────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { Modal, FormField, inputClass } from '@/components/ui/Modal'
import { OfferSheetDocument } from '@/components/tour/OfferSheetDocument'
import { buildOfferSheetSnapshot, latestSheet, longDate, SHEET_STATUS_LABEL } from '@/lib/offer-sheet'
import type { OfferSheetDetail } from '@/types'
import { localDateOf } from '@/lib/utils'

const DETAIL_OPTIONS: { value: OfferSheetDetail; label: string; hint: string }[] = [
  { value: 'full', label: 'Full breakdown', hint: 'Every line of the budget, each commission, and the notes.' },
  { value: 'summary', label: 'Summary only', hint: 'Deal terms plus five totals - no line items.' },
]

export function SendOfferSheetModal({ offerId, onClose }: { offerId: string; onClose: () => void }) {
  const client = useStore(s => s.getClient())
  const sendOfferSheet = useStore(s => s.sendOfferSheet)
  const addBudget = useStore(s => s.addBudget)
  const [detail, setDetail] = useState<OfferSheetDetail>('full')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Remembered at send time: once saved, "the next version" moves on to the one after it.
  const [sent, setSent] = useState<{ sheetId: string; version: number } | null>(null)

  const offer = client?.agentData?.offers.find(o => o.id === offerId)
  const budget = client?.finance.budgets?.find(b => b.offerId === offerId)
  const previous = latestSheet(client?.tour.offerSheets, offerId)
  const version = (previous?.version ?? 0) + 1
  const snapshot = useMemo(
    () => (client && offer && budget ? buildOfferSheetSnapshot({ client, offer, budget, detail }) : null),
    [client, offer, budget, detail],
  )

  if (!client || !offer) return null

  async function handleSend() {
    setBusy(true)
    setError(null)
    const sendingVersion = version
    const result = await sendOfferSheet(offerId, { detail, message })
    setBusy(false)
    if (result.ok) setSent({ sheetId: result.sheetId, version: sendingVersion })
    else setError(result.error)
  }

  // ── After sending ──
  if (sent) {
    return (
      <Modal title={`Offer sheet V${sent.version} sent`} onClose={onClose} footer={
        <>
          <a
            href={`/api/offer-sheets/${sent.sheetId}/pdf`} target="_blank" rel="noreferrer"
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 mr-auto"
          >Download PDF</a>
          <button onClick={onClose} className="px-3 py-1.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover">Done</button>
        </>
      }>
        <p className="text-sm">
          {client.name} can now see this offer in their portal and tap <b>Approve</b> or <b>Pass</b>.
          Nothing is confirmed until you confirm the offer yourself.
        </p>
        <p className="text-xs text-gray-400">You&apos;ll see their answer on this offer&apos;s card.</p>
      </Modal>
    )
  }

  // ── No budget to send yet ──
  if (!budget) {
    return (
      <Modal title="Send offer sheet" onClose={onClose} footer={
        <>
          <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button onClick={() => addBudget({ offerId })} className="px-3 py-1.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover">Create the budget</button>
        </>
      }>
        <p className="text-sm">An offer sheet includes the budget, and this offer doesn&apos;t have one yet. Create it first, then you can send the sheet.</p>
      </Modal>
    )
  }

  return (
    <Modal title={`Send offer sheet V${version} to ${client.name}`} onClose={onClose} wide footer={
      <>
        <button onClick={onClose} disabled={busy} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
        <button
          onClick={handleSend} disabled={busy || !snapshot}
          className="px-3 py-1.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover disabled:opacity-50"
        >{busy ? 'Sending…' : `Send V${version} to ${client.name}`}</button>
      </>
    }>
      {previous && (previous.status === 'sent' || previous.status === 'approved' || previous.status === 'passed') && (
        <div className="text-xs rounded-lg bg-amber-50 text-amber-800 px-3 py-2">
          V{previous.version} was sent {longDate(localDateOf(previous.sentAt))} and is currently <b>{SHEET_STATUS_LABEL[previous.status].toLowerCase()}</b>.
          Sending V{version} replaces it, and {client.name} will need to answer again.
        </div>
      )}

      <FormField label="How much should they see?">
        <div className="grid grid-cols-2 gap-2">
          {DETAIL_OPTIONS.map(o => (
            <button
              key={o.value} type="button" onClick={() => setDetail(o.value)}
              className={`text-left rounded-lg border px-3 py-2 transition-colors ${detail === o.value ? 'border-accent bg-accent-soft' : 'border-gray-200 hover:bg-gray-50'}`}
            >
              <div className={`text-sm font-semibold ${detail === o.value ? 'text-gray-900' : ''}`}>{o.label}</div>
              <div className={`text-[11px] ${detail === o.value ? 'text-gray-700' : 'text-gray-500'}`}>{o.hint}</div>
            </button>
          ))}
        </div>
      </FormField>

      <FormField label="Message to the artist (optional)">
        <textarea
          className={`${inputClass} min-h-[64px]`} value={message} onChange={e => setMessage(e.target.value)}
          placeholder="e.g. Great fit for the fall run - let me know by Friday."
        />
      </FormField>

      <div>
        <div className="text-xs font-semibold text-gray-500 mb-1.5">This is exactly what they will see</div>
        {snapshot && <OfferSheetDocument sheet={{ version, snapshot, message: message.trim() || undefined }} />}
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
    </Modal>
  )
}
