// Makes the PDF of a statement and hands it to the browser as a download. Runs in the person's own browser; nothing is sent anywhere.
import { statementFileName, type Statement } from '@/lib/statement'

export async function downloadStatementPdf(s: Statement): Promise<void> {
  const [{ pdf }, { statementDocument }] = await Promise.all([import('@react-pdf/renderer'), import('@/lib/statement-pdf')])
  const blob = await pdf(statementDocument(s)).toBlob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = statementFileName(s)
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
