import { NextRequest, NextResponse } from 'next/server'
import { plaidClient } from '@/lib/plaid'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { uid } from '@/lib/utils'
import type { Transaction } from 'plaid'

// Refreshes balances and pulls transactions for every bank connection an
// artist has. Re-fetches full transaction history each call and upserts by
// plaid_transaction_id, so calling this repeatedly is always safe.
export async function POST(req: NextRequest) {
  const { clientId } = await req.json()
  if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data: client, error: clientErr } = await supabase
    .from('clients').select('id').eq('id', clientId).single()
  if (clientErr || !client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const admin = createAdminClient()
  const { data: connections, error: connErr } = await admin
    .from('bank_connections').select('id, access_token').eq('client_id', clientId)
  if (connErr) return NextResponse.json({ error: connErr.message }, { status: 500 })
  if (!connections?.length) return NextResponse.json({ ok: true, accountCount: 0, transactionCount: 0 })

  let accountCount = 0
  let transactionCount = 0

  for (const conn of connections) {
    const accountsResp = await plaidClient.accountsGet({ access_token: conn.access_token })
    for (const a of accountsResp.data.accounts) {
      await supabase.from('bank_accounts').update({
        current_balance: a.balances.current ?? null,
        available_balance: a.balances.available ?? null,
        updated_at: new Date().toISOString(),
      }).eq('plaid_account_id', a.account_id)
      accountCount++
    }

    // Map Plaid account_id -> our bank_accounts.id for the transaction rows below.
    const { data: localAccounts } = await supabase
      .from('bank_accounts').select('id, plaid_account_id').eq('connection_id', conn.id)
    const accountIdByPlaidId = new Map((localAccounts ?? []).map(a => [a.plaid_account_id, a.id]))

    let cursor: string | undefined
    let hasMore = true
    const allTx: Transaction[] = []
    while (hasMore) {
      const syncResp = await plaidClient.transactionsSync({ access_token: conn.access_token, cursor })
      allTx.push(...syncResp.data.added, ...syncResp.data.modified)
      hasMore = syncResp.data.has_more
      cursor = syncResp.data.next_cursor
    }

    const rows = allTx
      .filter(t => accountIdByPlaidId.has(t.account_id))
      .map(t => ({
        id: 'txn-' + uid(),
        account_id: accountIdByPlaidId.get(t.account_id)!,
        client_id: clientId,
        plaid_transaction_id: t.transaction_id,
        date: t.date,
        name: t.name,
        merchant_name: t.merchant_name ?? null,
        amount: t.amount,
        currency: t.iso_currency_code ?? 'USD',
        category: t.personal_finance_category?.primary ?? null,
        pending: t.pending,
      }))

    if (rows.length) {
      const { error: txErr } = await supabase
        .from('bank_transactions').upsert(rows, { onConflict: 'plaid_transaction_id' })
      if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 })
      transactionCount += rows.length
    }
  }

  return NextResponse.json({ ok: true, accountCount, transactionCount })
}
