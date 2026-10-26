'use client'
// ──────────────────────────────────────────────────────────
//  NewGigModal — the one way to add a gig. A gig is an offer while it is being talked about and a show once it is booked, so the
//  first question is where it is at; the old separate "+ Show", "+ Add offer" and "Paste an offer" buttons all lead from here.
//  Booked opens the add-a-show form; still talking opens the offer form (or the paste box) on the Offers tab.
// ──────────────────────────────────────────────────────────

import { useState } from 'react'
import { useStore } from '@/lib/store'
import { Modal } from '@/components/ui/Modal'
import { gigChoices } from '@/lib/tour-tabs'
import { AddShowModal } from '@/components/tour/TourView'
import { CalendarImportModal } from '@/components/tour/CalendarImportModal'

const CHOICE = 'w-full text-left px-4 py-3 border border-gray-200 rounded-xl hover:border-accent hover:bg-accent-soft transition-colors'

export function NewGigModal({ onClose }: { onClose: () => void }) {
  // A booked show is Tour; an offer is Deals & fees: each choice shows only to someone who may add that.
  const canAddShow = useStore(s => s.canEdit('tour'))
  const canAddOffer = useStore(s => s.canEdit('deals'))
  const choices = gigChoices({ show: canAddShow, offer: canAddOffer })
  const { setTourSub, setSelectedShow, requestOfferAdd, requestOfferPaste } = useStore()
  const [stage, setStage] = useState<'choose' | 'show' | 'import'>('choose')

  if (stage === 'show') {
    return <AddShowModal defaultStatus="confirmed" onClose={onClose} onAdded={id => { setTourSub('tour'); setSelectedShow(id) }} />
  }
  if (stage === 'import') return <CalendarImportModal onClose={onClose} />

  const talking = (request: () => void) => () => { onClose(); setTourSub('offers'); request() }

  return (
    <Modal title="New gig" onClose={onClose} footer={
      <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
    }>
      <div className="text-xs font-semibold text-gray-500">Where is it at?</div>
      {choices.booked && (
        <button onClick={() => setStage('show')} className={CHOICE}>
          <span className="block text-sm font-medium">It&apos;s booked</span>
          <span className="block text-xs text-gray-500">Add it as a show</span>
        </button>
      )}
      {choices.talking && (
        <button onClick={talking(requestOfferAdd)} className={CHOICE}>
          <span className="block text-sm font-medium">Still talking</span>
          <span className="block text-xs text-gray-500">Add it as an offer. Confirming the offer later makes the show.</span>
        </button>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs">
        {choices.paste && <button onClick={talking(requestOfferPaste)} className="text-accent hover:underline">Paste an offer from an email</button>}
        {choices.spreadsheet && <button onClick={() => setStage('import')} className="text-accent hover:underline">Add many shows from a spreadsheet</button>}
      </div>
    </Modal>
  )
}
