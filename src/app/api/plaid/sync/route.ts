import { NextRequest, NextResponse } from 'next/server'
import { plaidClient } from '@/lib/plaid'
import { parseJson, requireClientAccess, serverError } from '@/lib/api-guard'
import { clientOnly } from '@/lib/api-schemas'
import { createAdminClient } from '@/lib/supabase/admin'
import { uid } from '@/lib/utils'
import type { Transaction } from 'plaid'

// Refreshes balances and pulls transactions for every bank connection an
// artist has. Re-fetches full transaction history each call and upserts by
// plaid_transaction_id, so calling this repeatedly is always safe.
export async function POST(req: NextRequest) {
  const body = await parseJson(req, clientOnly)
  if (body.error) return body.error
  const { clientId } = body.data

  // Syncing reads the stored bank key with the master client, so it needs the same access as linking the bank.
  const gate = await requireClientAccess(clientId, { section: 'finance', edit: true, managementSide: true, limit: 'bank' })
  if (gate.error) return gate.error
  const { supabase } = gate

  const admin = createAdminClient()
  const { data: connections, error: connErr } = await admin
    .from('bank_connections').select('id, access_token').eq('client_id', clientId)
  if (connErr) return serverError('Reading bank connections failed', connErr, "Couldn't reach the bank connection. Please try again.")
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
      if (txErr) return serverError('Saving bank transactions failed', txErr, "Couldn't save the transactions. Please try again.")
      transactionCount += rows.length
    }
  }

  return NextResponse.json({ ok: true, accountCount, transactionCount })
}
