import { NextRequest, NextResponse } from 'next/server'
import { CountryCode, Products } from 'plaid'
import { plaidClient } from '@/lib/plaid'
import { createClient } from '@/lib/supabase/server'

// Starts a bank connection for one artist. The browser calls this to get a
// short-lived link_token, then hands it to Plaid's own Link widget — the
// actual bank login happens on Plaid's screen, never in this app.
export async function POST(req: NextRequest) {
  const { clientId } = await req.json()
  if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  // RLS on `clients` rejects this if the artist isn't in the user's workspace.
  const { data: client, error } = await supabase.from('clients').select('id, name').eq('id', clientId).single()
  if (error || !client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const response = await plaidClient.linkTokenCreate({
    client_name: 'Mgmt Studio',
    language: 'en',
    country_codes: [CountryCode.Us],
    user: { client_user_id: `${user.id}:${clientId}` },
    products: [Products.Transactions],
  })

  return NextResponse.json({ link_token: response.data.link_token })
}
