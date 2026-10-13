import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rowToOfferSheet, sheetFileName, type OfferSheetRow } from '@/lib/offer-sheet'
import { renderOfferSheetPdf } from '@/lib/offer-sheet-pdf'

export const runtime = 'nodejs'

// Downloads a sent offer sheet as a PDF. Who may read a sheet is decided by the
// database (the artist's own login, or management with Tour + Finance access), so
// asking with the caller's own session means the PDF can never show more than they
// could already see on screen.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in' }, { status: 401 })

  const { data, error } = await supabase.from('offer_sheets').select('*').eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: 'Could not load the offer sheet' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Offer sheet not found' }, { status: 404 })

  const sheet = rowToOfferSheet(data as OfferSheetRow)
  const pdf = await renderOfferSheetPdf(sheet)
  const filename = sheetFileName(sheet)
  return new Response(pdf as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'private, no-store',
    },
  })
}
