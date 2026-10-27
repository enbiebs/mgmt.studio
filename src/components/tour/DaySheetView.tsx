'use client'
// ──────────────────────────────────────────────────────────
//  Day Sheet Generator
//  Auto-generated from the advance data for a selected show.
//  Professional format — same as what tour managers distribute
//  to crew every morning on tour.
// ──────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { useStore } from '@/lib/store'
import { fromDateStr, today } from '@/lib/utils'
import { defaultShow, orderShows } from '@/lib/date-state'
import { BackToList, detailPaneClass, listPaneClass, useMobilePane } from '@/components/ui/MobilePanes'
import type { ShowAdvance, Show } from '@/types'
import { buildDaySheet, type DaySheetKey } from '@/lib/day-sheet'
import { downloadDaySheetPdf } from '@/lib/day-sheet-download'
import { notify } from '@/lib/notify'
import { PRODUCT_NAME } from '@/lib/brand'

const ACCENT: Record<DaySheetKey, string> = {
  schedule: 'border-accent text-accent', hotel: 'border-purple-400 text-purple-500', venue: 'border-orange-400 text-orange-500',
  catering: 'border-green-400 text-green-600', travel: 'border-sky-400 text-sky-600', contacts: 'border-red-400 text-red-500', notes: 'border-gray-300 text-gray-400',
}

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div className="flex py-1.5 border-b border-gray-100 last:border-0">
      <span className="w-36 flex-shrink-0 text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</span>
      <span className="text-sm text-gray-800">{value}</span>
    </div>
  )
}

function Block({ title, children, accent }: { title: string; children: React.ReactNode; accent?: string }) {
  return (
    <div className="mb-5">
      <div className={`text-[10px] font-bold uppercase tracking-widest mb-2 pb-1 border-b-2 ${accent ?? 'border-gray-200 text-gray-400'}`}>
        {title}
      </div>
      <div>{children}</div>
    </div>
  )
}

/** `embedded`: shown inside a show's page, which already picked the show, so there is no show list of its own. */
export function DaySheetView({ embedded = false }: { embedded?: boolean } = {}) {
  const client = useStore(s => s.getClient())
  const { setTourSub } = useStore()
  const sharedSelectedShowId = useStore(s => s.selectedShowId)
  const [selectedShowId, setSelectedShowId] = useState<string | null>(() => useStore.getState().selectedShowId)
  const pane = useMobilePane()
  const [pdfBusy, setPdfBusy] = useState(false)

  // Jumping here from elsewhere (e.g. Tour's "Day Sheet" quick link) sets the
  // shared selectedShowId — adopt it once, without disturbing this view's own
  // "most in-progress advance" fallback when arriving directly.
  useEffect(() => {
    if (sharedSelectedShowId && sharedSelectedShowId !== selectedShowId) {
      selectShow(sharedSelectedShowId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedSelectedShowId])

  function selectShow(id: string) {
    pane.openDetail()
    useStore.getState().setSelectedShow(id)
    setSelectedShowId(id)
  }

  if (!client) return null

  const shows = orderShows(client.tour.shows.filter(s => !s.historyOnly), today())
  const advances = client.tour.advances ?? []

  // Opens on the next show that is going to happen, not on whichever one happens to be first in the list.
  const show: Show | undefined = selectedShowId
    ? shows.find(s => s.id === selectedShowId)
    : defaultShow(shows, today())

  const advance: ShowAdvance | undefined = show
    ? advances.find(a => a.showId === show.id)
    : undefined

  const sheet = show ? buildDaySheet(client.name, show, advance) : null

  function makePdf() {
    if (!sheet || !show || pdfBusy) return
    setPdfBusy(true)
    downloadDaySheetPdf(sheet, show.date)
      .catch(e => { console.error(e); notify('The PDF could not be made. Please try again.') })
      .finally(() => setPdfBusy(false))
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {!embedded && (<>
      {/* Show selector sidebar */}
      <div className={`${listPaneClass(pane.detail)} w-full md:w-[200px] flex-shrink-0 border-r border-gray-100 flex-col`}>
        <div className="px-4 py-3 border-b border-gray-100">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Select Show</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {shows.map(s => {
            const adv = advances.find(a => a.showId === s.id)
            const d = fromDateStr(s.date)
            return (
              <button
                key={s.id}
                onClick={() => selectShow(s.id)}
                className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                  show?.id === s.id ? 'bg-accent-soft' : s.date < today() ? 'opacity-60' : ''
                }`}
              >
                <div className="text-xs font-semibold text-gray-800 truncate">{s.venue}</div>
                <div className="text-[11px] text-gray-400">{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                {!adv || adv.status === 'draft' ? (
                  <span className="text-[10px] text-gray-300">No advance yet</span>
                ) : (
                  <span className={`text-[10px] font-medium ${adv.status === 'complete' ? 'text-green-600' : 'text-amber-600'}`}>
                    {adv.status === 'complete' ? 'Complete' : 'In Progress'}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <div className="p-3 border-t border-gray-100">
          <button
            onClick={() => setTourSub('advance')}
            className="w-full text-xs font-medium text-gray-500 hover:text-gray-800 text-center py-1"
          >
            ← Edit Advance
          </button>
        </div>
      </div>
      </>)}

      {/* Day sheet */}
      <div className={`${detailPaneClass(embedded || pane.detail)} flex-1 overflow-y-auto bg-gray-50`}>
        {!embedded && <BackToList onClick={pane.closeDetail} label="All shows" />}
        {!show ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">No shows available</div>
        ) : (
          <div className="max-w-2xl mx-auto py-4 md:py-8 px-3 md:px-6">
            {/* Header */}
            <div className="bg-gray-900 text-canvas rounded-2xl px-5 md:px-8 py-5 md:py-6 mb-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Day Sheet</div>
                  <div className="text-2xl font-bold">{client.name}</div>
                  <div className="text-lg text-gray-300 mt-1">{show.venue}</div>
                  <div className="text-sm text-gray-400">{show.city}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-gray-300">{sheet?.dateLine}</div>
                  {sheet?.weather && (
                    <div className="text-xs text-gray-400 mt-1">{sheet.weather}</div>
                  )}
                  <button onClick={makePdf} disabled={pdfBusy} className="mt-3 rounded-lg border border-gray-700 px-3 py-1 text-xs font-semibold text-gray-200 hover:bg-gray-800 disabled:opacity-50">
                    {pdfBusy ? 'Making the PDF…' : 'Download PDF'}
                  </button>
                  <div className="mt-1 text-[10px] text-gray-500">Shows no fees or payments.</div>
                </div>
              </div>
            </div>

            {/* The sections: only what is known for this show (the same sheet the PDF is made from) */}
            {sheet?.sections.map(sec => (
              <div key={sec.key} className="bg-canvas rounded-2xl px-6 py-5 mb-4 shadow-sm">
                <Block title={sec.title} accent={ACCENT[sec.key]}>
                  {sec.rows.map((r, i) => <Row key={i} label={r.label} value={r.value} />)}
                  {sec.note && <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500 whitespace-pre-line">{sec.note}</div>}
                </Block>
              </div>
            ))}

            {/* Nothing to show yet */}
            {sheet && !sheet.hasAdvance && (
              <div className="bg-canvas rounded-2xl px-6 py-10 text-center text-gray-400 shadow-sm">
                <div className="text-sm mb-2">{advance ? 'Nothing is filled in on the advance yet.' : 'No advance data for this show yet.'}</div>
                <button onClick={() => setTourSub('advance')} className="text-sm text-accent hover:underline">
                  {advance ? 'Fill in the advance →' : 'Create advance →'}
                </button>
              </div>
            )}

            {/* Footer */}
            <div className="text-center text-[10px] uppercase tracking-widest text-gray-300 mt-6">
              Generated by {PRODUCT_NAME} · {new Date().toLocaleDateString()}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
