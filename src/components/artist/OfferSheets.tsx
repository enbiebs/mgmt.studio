'use client'
// ──────────────────────────────────────────────────────────
//  OfferSheets — the artist's "Offers" card and the sheet they open from it.
//  The artist taps Approve or Pass (with a second tap to confirm). Nothing is
//  confirmed by that: it tells the manager, who still confirms the offer.
// ──────────────────────────────────────────────────────────

import { useState } from 'react'
import { useStore } from '@/lib/store'
import { Modal, inputClass } from '@/components/ui/Modal'
import { OfferSheetDocument } from '@/components/tour/OfferSheetDocument'
import { sheetsForArtist, longDate } from '@/lib/offer-sheet'
import type { OfferSheet } from '@/types'

type Tone = { label: string; cls: string }

function statusFor(sheet: OfferSheet, confirmed: boolean): Tone {
  if (confirmed) return { label: 'Confirmed', cls: 'bg-blue-50 text-blue-700' }
  if (sheet.status === 'approved') return { label: 'You approved', cls: 'bg-green-50 text-green-700' }
  if (sheet.status === 'passed') return { label: 'You passed', cls: 'bg-gray-100 text-gray-500' }
  return { label: 'Waiting for your reply', cls: 'bg-amber-50 text-amber-700' }
}

export function OfferSheetsCard() {
  const client = useStore(s => s.getClient())
  const [openId, setOpenId] = useState<string | null>(null)
  if (!client) return null

  const today = new Date().toISOString().slice(0, 10)
  const confirmedOfferIds = new Set(client.tour.shows.map(s => s.tourOfferId).filter(Boolean))
  const sheets = sheetsForArtist(client.tour.offerSheets).filter(s => s.snapshot.offer.date >= today)
  if (sheets.length === 0) return null
  const waiting = sheets.filter(s => s.status === 'sent' && !confirmedOfferIds.has(s.offerId)).length

  return (
    <>
      <div className="bg-canvas rounded-2xl border border-gray-100 p-5 lg:col-span-2">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Offers</div>
          {waiting > 0 && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700">{waiting} waiting for your reply</span>}
        </div>
        <div className="flex flex-col gap-3">
          {sheets.map(sheet => {
            const o = sheet.snapshot.offer
            const d = new Date(o.date + 'T12:00:00')
            const tone = statusFor(sheet, confirmedOfferIds.has(sheet.offerId))
            return (
              <button
                key={sheet.id} onClick={() => setOpenId(sheet.id)}
                className="flex items-center gap-4 text-left rounded-xl hover:bg-gray-50 transition-colors -mx-2 px-2 py-1"
              >
                <div className="w-10 text-center flex-shrink-0">
                  <div className="text-[9px] font-bold text-gray-400">{d.toLocaleString('en-US', { month: 'short' }).toUpperCase()}</div>
                  <div className="font-serif text-lg font-semibold leading-none">{d.getDate()}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{o.venue}</div>
                  <div className="text-xs text-gray-400">{o.city}{o.country ? `, ${o.country}` : ''} · V{sheet.version}</div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold flex-shrink-0 ${tone.cls}`}>{tone.label}</span>
              </button>
            )
          })}
        </div>
      </div>
      {openId && <ArtistOfferSheetModal sheetId={openId} onClose={() => setOpenId(null)} />}
    </>
  )
}

function ArtistOfferSheetModal({ sheetId, onClose }: { sheetId: string; onClose: () => void }) {
  const client = useStore(s => s.getClient())
  const answerOfferSheet = useStore(s => s.answerOfferSheet)
  const previewing = useStore(s => !!s.previewMemberId)
  const [choice, setChoice] = useState<'approved' | 'passed' | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sheet = client?.tour.offerSheets?.find(s => s.id === sheetId)
  if (!client || !sheet) return null
  const confirmed = client.tour.shows.some(s => s.tourOfferId === sheet.offerId)
  const waiting = sheet.status === 'sent' && !confirmed

  async function submit() {
    if (!choice) return
    setBusy(true)
    setError(null)
    const result = await answerOfferSheet(sheetId, choice, note)
    setBusy(false)
    if (result.ok) { setChoice(null); setNote('') }
    else setError(result.error)
  }

  return (
    <Modal title={`Offer · ${sheet.snapshot.offer.venue}`} onClose={onClose} wide footer={
      <>
        <a
          href={`/api/offer-sheets/${sheet.id}/pdf`} target="_blank" rel="noreferrer"
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 mr-auto"
        >Download PDF</a>
        <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Close</button>
      </>
    }>
      <OfferSheetDocument sheet={sheet} />

      {confirmed && (
        <div className="text-sm rounded-lg bg-blue-50 text-blue-800 px-3 py-2.5">This offer is confirmed - it&apos;s now on your shows list.</div>
      )}

      {!confirmed && sheet.status === 'approved' && (
        <div className="text-sm rounded-lg bg-green-50 text-green-800 px-3 py-2.5">
          You approved this{sheet.respondedAt ? ` on ${longDate(sheet.respondedAt.slice(0, 10))}` : ''}. Your manager will confirm it with the promoter.
          {sheet.responseNote && <div className="mt-1 text-xs">Your note: &ldquo;{sheet.responseNote}&rdquo;</div>}
        </div>
      )}
      {!confirmed && sheet.status === 'passed' && (
        <div className="text-sm rounded-lg bg-gray-100 text-gray-700 px-3 py-2.5">
          You passed on this{sheet.respondedAt ? ` on ${longDate(sheet.respondedAt.slice(0, 10))}` : ''}.
          {sheet.responseNote && <div className="mt-1 text-xs">Your note: &ldquo;{sheet.responseNote}&rdquo;</div>}
        </div>
      )}

      {waiting && !choice && (
        <div>
          <div className="text-xs font-semibold text-gray-500 mb-1.5">Your answer</div>
          <div className="flex gap-2">
            <button
              onClick={() => setChoice('approved')} disabled={previewing}
              className="flex-1 px-3 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >Approve</button>
            <button
              onClick={() => setChoice('passed')} disabled={previewing}
              className="flex-1 px-3 py-2 border border-gray-300 text-sm font-semibold rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >Pass</button>
          </div>
          {previewing && <div className="text-[11px] text-gray-400 mt-1.5">Preview only - answers are turned off while you&apos;re previewing as the artist.</div>}
        </div>
      )}

      {waiting && choice && (
        <div className="rounded-lg border border-gray-200 p-3 space-y-2.5">
          <div className="text-sm">
            {choice === 'approved'
              ? <>Tell your manager you&apos;re <b>in</b> for this one? They still confirm it with the promoter before it becomes a show.</>
              : <>Tell your manager you&apos;d like to <b>pass</b> on this one?</>}
          </div>
          <textarea
            className={`${inputClass} min-h-[56px]`} value={note} onChange={e => setNote(e.target.value)}
            placeholder="Add a note for your manager (optional)"
          />
          {error && <div className="text-sm text-red-600">{error}</div>}
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setChoice(null); setError(null) }} disabled={busy} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Back</button>
            <button
              onClick={submit} disabled={busy}
              className={`px-3 py-1.5 text-white text-sm font-semibold rounded-lg disabled:opacity-50 ${choice === 'approved' ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-700 hover:bg-gray-800'}`}
            >{busy ? 'Saving…' : choice === 'approved' ? 'Yes, approve' : 'Yes, pass'}</button>
          </div>
        </div>
      )}
    </Modal>
  )
}
