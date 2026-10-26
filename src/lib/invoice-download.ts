// Makes the PDF of an invoice and hands it to the browser as a download. Runs in the person's own browser (nothing is sent anywhere);
// the PDF library and the layout are only fetched at this moment.
import { invoiceFileName, type InvoiceDoc } from '@/lib/invoice-doc'

export async function downloadInvoicePdf(doc: InvoiceDoc): Promise<void> {
  const [{ pdf }, { invoiceDocument }] = await Promise.all([import('@react-pdf/renderer'), import('@/lib/invoice-pdf')])
  const blob = await pdf(invoiceDocument(doc)).toBlob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = invoiceFileName(doc)
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
