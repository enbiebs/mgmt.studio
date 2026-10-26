'use client'
// The window for getting an invoice (or a reminder about one) to the person who owes it. Mgmt Path does not email for you: the invoice is
// made as a PDF, the email opens in the person's own mail program with the words already written, and they send it themselves, so it
// comes from their own address and replies come back to them. (Writing the words and the PDF are in lib/invoice-doc.ts.)

import { useEffect, useState } from 'react'
import { useStore } from '@/lib/store'
import { today as localToday } from '@/lib/utils'
import { buildInvoiceDoc, invoiceMailto, invoiceMessage } from '@/lib/invoice-doc'
import { downloadInvoicePdf } from '@/lib/invoice-download'
import { invoiceOutstanding } from '@/lib/money'
import { notify } from '@/lib/notify'
import { PRODUCT_NAME } from '@/lib/brand'
import type { Invoice } from '@/types'

export function InvoiceSendModal({ invoice, mode, onClose, onMarkSent }: { invoice: Invoice; mode: 'send' | 'reminder' | 'pdf'; onClose: () => void; onMarkSent?: () => void }) {
  const client = useStore(s => s.getClient())
  const company = useStore(s => s.companyName)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  if (!client) return null

  const deposits = client.business?.banking?.deposits ?? []
  const doc = buildInvoiceDoc(invoice, { company: company ?? '', artist: client.name, outstanding: invoiceOutstanding(invoice, deposits) })
  const mailto = mode === 'pdf' ? null : invoiceMailto(doc, mode, localToday())
  const message = mode === 'pdf' ? null : invoiceMessage(doc, mode, localToday())

  // For someone with no mail program set up: the same words, ready to paste into whatever they do use.
  function copyMessage() {
    if (!message) return
    navigator.clipboard.writeText(`To: ${message.to}\nSubject: ${message.subject}\n\n${message.body}`).then(() => notify('Copied. Paste it into your email.'), () => notify('Could not copy. Select the words and copy them yourself.'))
  }

  function makePdf() {
    if (busy) return
    setBusy(true)
    downloadInvoicePdf(doc)
      .catch(e => { console.error(e); notify('The PDF could not be made. Please try again.') })
      .finally(() => setBusy(false))
  }

  const reminder = mode === 'reminder'
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md space-y-4 rounded-2xl bg-canvas p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">{mode === 'pdf' ? `Invoice ${invoice.number}` : reminder ? `Remind ${invoice.to} about ${invoice.number}` : `Send invoice ${invoice.number}`}</h2>
          <button onClick={onClose} aria-label="Close" className="text-xl leading-none text-gray-400 hover:text-gray-600">×</button>
        </div>
        {mode === 'pdf' ? (
          <div className="flex gap-2">
            <button onClick={makePdf} disabled={busy} className="flex-1 rounded-xl border border-gray-200 py-2 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50">{busy ? 'Making the PDF…' : 'Download PDF'}</button>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500">{PRODUCT_NAME} doesn&apos;t email this for you. It goes out from your own email, so replies come back to you:</p>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-700">
              <li>Download the invoice as a PDF.</li>
              <li>Open the email and attach the PDF.</li>
              {reminder ? <li>Send it.</li> : <li>Come back and mark the invoice as sent, so the team knows.</li>}
            </ol>
            {invoice.toEmail
              ? <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm"><div className="font-medium text-gray-800">{invoice.to}</div><div className="text-xs text-gray-400">{invoice.toEmail}</div></div>
              : <div className="text-xs text-amber-600">This invoice has no email address for {invoice.to}, so the email can&apos;t be opened. You can still download the PDF.</div>}
            {invoice.toEmail && !mailto && <div className="text-xs text-amber-600">That email address doesn&apos;t look right, so the email can&apos;t be opened.</div>}
            {!invoice.notes && !reminder && <div className="text-[11px] text-gray-400">How to pay (bank details) isn&apos;t on the PDF unless it&apos;s in the invoice&apos;s notes.</div>}
            <div className="flex gap-2">
              <button onClick={makePdf} disabled={busy} className="flex-1 rounded-xl border border-gray-200 py-2 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50">{busy ? 'Making the PDF…' : 'Download PDF'}</button>
              {mailto
                ? <a href={mailto} className="flex-1 rounded-xl border border-gray-200 py-2 text-center text-sm font-semibold hover:bg-gray-50">Open the email</a>
                : <span className="flex-1 rounded-xl border border-gray-100 py-2 text-center text-sm font-semibold text-gray-300">Open the email</span>}
            </div>
            {message && <button onClick={copyMessage} className="text-xs text-gray-500 underline hover:text-gray-700">Copy the message instead</button>}
          </>
        )}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 rounded-xl border border-gray-200 py-2 text-sm font-medium hover:bg-gray-50">{reminder || mode === 'pdf' ? 'Close' : 'Cancel'}</button>
          {mode === 'send' && onMarkSent && (
            <button onClick={() => { onMarkSent(); onClose() }} className="flex-1 rounded-xl bg-gray-900 py-2 text-sm font-semibold text-canvas transition-colors hover:bg-gray-700">Mark as sent</button>
          )}
        </div>
      </div>
    </div>
  )
}
