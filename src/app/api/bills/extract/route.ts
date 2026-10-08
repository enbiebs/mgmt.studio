import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  BILLS_BUCKET, MAX_BILL_BYTES, requireBillAccess, isBillPathFor, billReadingConfigured,
  extractBill, bankDetails,
} from '@/lib/bills'

// Reading a bill can take a while on a multi-page PDF.
export const maxDuration = 60

// Step 2 of adding a bill: the PDF is already in storage (see upload-url);
// read it and send back the details. Nothing is saved to the database here -
// the browser shows a confirmation screen first (and matches the vendor
// against the saved list there). If the bill can't be read the response has
// `extracted: null` so the form falls back to manual entry with the PDF
// still attached.
export async function POST(req: NextRequest) {
  const { clientId, path } = await req.json()
  const gate = await requireBillAccess(clientId, true)
  if (gate.error) return gate.error
  if (!isBillPathFor(clientId, path)) return NextResponse.json({ error: 'Bad file path' }, { status: 400 })

  const admin = createAdminClient()
  const { data: file, error: downloadErr } = await admin.storage.from(BILLS_BUCKET).download(path)
  if (downloadErr || !file) return NextResponse.json({ error: 'Could not find the uploaded file' }, { status: 404 })
  if (file.size > MAX_BILL_BYTES) return NextResponse.json({ error: 'That PDF is too large (20MB max)' }, { status: 413 })

  const unreadable = (reason: string) => NextResponse.json({ filePath: path, extracted: null, readError: reason })

  if (!billReadingConfigured()) {
    return unreadable("Automatic bill reading isn't switched on yet - fill in the details by hand. The PDF is still attached.")
  }

  let bill
  try {
    bill = await extractBill(Buffer.from(await file.arrayBuffer()).toString('base64'))
  } catch (e) {
    console.error('Bill extraction failed', e)
    const reason = e instanceof Anthropic.AuthenticationError
      ? 'The bill-reading key was rejected - check it in your settings. Fill in the details by hand for now.'
      : "Couldn't read this bill automatically - fill in the details by hand. The PDF is still attached."
    return unreadable(reason)
  }

  // Full bank numbers stop here - only the last 4 and the fingerprint go back.
  const { bankLast4, bankFingerprint } = bankDetails(bill.bankRoutingNumber, bill.bankAccountNumber)
  return NextResponse.json({
    filePath: path,
    extracted: {
      vendorName: bill.vendorName,
      address: bill.vendorAddress,
      email: bill.vendorEmail,
      phone: bill.vendorPhone,
      taxId: bill.vendorTaxId,
      bankLast4: bankLast4 ?? null,
      bankFingerprint: bankFingerprint ?? null,
      billNumber: bill.billNumber,
      description: bill.description,
      amount: bill.amountDue,
      currency: bill.currency,
      billDate: bill.billDate,
      dueDate: bill.dueDate,
      category: bill.category,
    },
  })
}
