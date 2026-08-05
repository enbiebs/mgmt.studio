import { NextRequest, NextResponse } from 'next/server'
import { plaidClient } from '@/lib/plaid'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { uid } from '@/lib/utils'

// Finishes a bank connection: swaps the temporary public_token Plaid Link
// handed the browser for a permanent access_token, stores that access_token
// server-side only (bank_connections has no RLS policy — the admin client is
// the only thing that can ever write or read it), then pulls the account
// list once so there's something to show immediately.
export async function POST(req: NextRequest) {
  const { clientId, publicToken, institutionName } = await req.json()
  if (!clientId || !publicToken) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data: client, error: clientErr } = await supabase
    .from('clients').select('id, workspace_id').eq('id', clientId).single()
  if (clientErr || !client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const exchange = await plaidClient.itemPublicTokenExchange({ public_token: publicToken })
  const accessToken = exchange.data.access_token
  const itemId = exchange.data.item_id

  const admin = createAdminClient()
  const connectionId = 'bank-' + uid()
  const { error: connErr } = await admin.from('bank_connections').insert({
    id: connectionId,
    client_id: clientId,
    workspace_id: client.workspace_id,
    plaid_item_id: itemId,
    access_token: accessToken,
    institution_name: institutionName ?? null,
  })
  if (connErr) return NextResponse.json({ error: connErr.message }, { status: 500 })

  const accountsResp = await plaidClient.accountsGet({ access_token: accessToken })
  const rows = accountsResp.data.accounts.map(a => ({
    id: 'acct-' + uid(),
    connection_id: connectionId,
    client_id: clientId,
    plaid_account_id: a.account_id,
    name: a.name,
    official_name: a.official_name ?? null,
    mask: a.mask ?? null,
    type: a.type,
    subtype: a.subtype ?? null,
    currency: a.balances.iso_currency_code ?? 'USD',
    current_balance: a.balances.current ?? null,
    available_balance: a.balances.available ?? null,
  }))

  const { error: acctErr } = await supabase.from('bank_accounts').insert(rows)
  if (acctErr) return NextResponse.json({ error: acctErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, accountCount: rows.length })
}
