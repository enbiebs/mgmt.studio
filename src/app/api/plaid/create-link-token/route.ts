import { NextRequest, NextResponse } from 'next/server'
import { CountryCode, Products } from 'plaid'
import { plaidClient } from '@/lib/plaid'
import { parseJson, requireClientAccess, serverError } from '@/lib/api-guard'
import { clientOnly } from '@/lib/api-schemas'
import { PRODUCT_NAME } from '@/lib/brand'

// Starts a bank connection for one artist. The browser calls this to get a
// short-lived link_token, then hands it to Plaid's own Link widget — the
// actual bank login happens on Plaid's screen, never in this app.
export async function POST(req: NextRequest) {
  const body = await parseJson(req, clientOnly)
  if (body.error) return body.error
  const { clientId } = body.data

  // Connecting a bank is a money action: Finance edit access to this artist, and never the artist's own login.
  const gate = await requireClientAccess(clientId, { section: 'finance', edit: true, managementSide: true, limit: 'bank' })
  if (gate.error) return gate.error

  try {
    const response = await plaidClient.linkTokenCreate({
      client_name: PRODUCT_NAME,
      language: 'en',
      country_codes: [CountryCode.Us],
      user: { client_user_id: `${gate.user.id}:${clientId}` },
      products: [Products.Transactions],
    })
    return NextResponse.json({ link_token: response.data.link_token })
  } catch (e) {
    return serverError('Plaid link token failed', e, "Couldn't start the bank connection. Please try again.")
  }
}
