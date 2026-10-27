// Makes the PDF of a day sheet or advance and hands it to the browser as a download. Runs in the person's own browser (nothing is sent
// anywhere); the PDF library and the layout are only fetched at this moment.

import { daySheetFileName, type DaySheet } from '@/lib/day-sheet'

export async function downloadDaySheetPdf(sheet: DaySheet, isoDate: string): Promise<void> {
  const [{ pdf }, { daySheetDocument }] = await Promise.all([import('@react-pdf/renderer'), import('@/lib/day-sheet-pdf')])
  const blob = await pdf(daySheetDocument(sheet)).toBlob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = daySheetFileName(sheet, isoDate)
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
