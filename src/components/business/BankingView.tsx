'use client'
import { useEffect, useState } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import { useStore } from '@/lib/store'
import { fmt } from '@/lib/utils'

function ConnectBankButton({ clientId }: { clientId: string }) {
  const loadBankData = useStore(s => s.loadBankData)
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function startConnect() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/plaid/create-link-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not start bank connection')
      setLinkToken(json.link_token)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start bank connection')
      setBusy(false)
    }
  }

  const { open, ready } = usePlaidLink({
    token: linkToken ?? '',
    onSuccess: async (publicToken, metadata) => {
      try {
        const exchangeRes = await fetch('/api/plaid/exchange-public-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId, publicToken, institutionName: metadata.institution?.name }),
        })
        if (!exchangeRes.ok) throw new Error((await exchangeRes.json()).error ?? 'Could not finish connecting')
        await fetch('/api/plaid/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId }),
        })
        await loadBankData(clientId)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not finish connecting')
      } finally {
        setBusy(false)
        setLinkToken(null)
      }
    },
    onExit: () => { setBusy(false); setLinkToken(null) },
  })

  useEffect(() => {
    if (linkToken && ready) open()
  }, [linkToken, ready, open])

  return (
    <div>
      <button
        onClick={startConnect}
        disabled={busy}
        className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
      >
        {busy ? 'Connecting…' : '+ Connect a bank account'}
      </button>
      {error && <div className="text-xs text-red-500 mt-1.5">{error}</div>}
    </div>
  )
}

function RefreshButton({ clientId }: { clientId: string }) {
  const loadBankData = useStore(s => s.loadBankData)
  const [busy, setBusy] = useState(false)

  async function refresh() {
    setBusy(true)
    await fetch('/api/plaid/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId }),
    })
    await loadBankData(clientId)
    setBusy(false)
  }

  return (
    <button
      onClick={refresh}
      disabled={busy}
      className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
    >
      {busy ? 'Refreshing…' : 'Refresh'}
    </button>
  )
}

export function BankingView() {
  const client = useStore(s => s.getClient())
  const { markDepositDone, dismissDeposit, loadBankData } = useStore()

  useEffect(() => {
    if (client?.id) loadBankData(client.id)
  }, [client?.id, loadBankData])

  if (!client) return null

  const deposits = client.business.banking.deposits
  const pending  = deposits.filter(d => !d.done)
  const divided  = deposits.filter(d => d.done)
  const accounts = client.business.banking.accounts ?? []
  const transactions = (client.business.banking.transactions ?? []).slice(0, 15)

  return (
    <div className="flex-1 overflow-auto p-6 max-w-3xl">
      {/* ── Connected bank accounts (real, via Plaid) ── */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
            Connected bank accounts
          </div>
          <div className="flex items-center gap-2">
            {accounts.length > 0 && <RefreshButton clientId={client.id} />}
            <ConnectBankButton clientId={client.id} />
          </div>
        </div>

        {accounts.length === 0 ? (
          <div className="border-2 border-dashed border-gray-100 rounded-2xl p-6 text-center text-sm text-gray-300">
            No bank account connected for {client.name} yet
          </div>
        ) : (
          <div className="flex flex-col gap-2 mb-4">
            {accounts.map(a => (
              <div key={a.id} className="border border-gray-100 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-sm">{a.name}{a.mask && <span className="text-gray-400 font-normal"> ····{a.mask}</span>}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{a.subtype ?? a.type}</div>
                </div>
                <div className="text-right">
                  <div className="font-serif font-semibold text-lg">{fmt(a.currentBalance ?? 0, a.currency ?? 'USD')}</div>
                  {a.availableBalance != null && a.availableBalance !== a.currentBalance && (
                    <div className="text-xs text-gray-400">{fmt(a.availableBalance, a.currency ?? 'USD')} available</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {transactions.length > 0 && (
          <div className="border border-gray-100 rounded-2xl overflow-hidden">
            {transactions.map(t => (
              <div key={t.id} className="flex items-center justify-between px-4 py-2.5 border-b border-gray-50 last:border-0 text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">{t.merchantName ?? t.name}</div>
                  <div className="text-xs text-gray-400">{t.date}{t.category ? ` · ${t.category}` : ''}{t.pending ? ' · Pending' : ''}</div>
                </div>
                <div className={`font-medium flex-shrink-0 ${t.amount < 0 ? 'text-green-600' : 'text-gray-700'}`}>
                  {t.amount < 0 ? '+' : ''}{fmt(Math.abs(t.amount), t.currency ?? 'USD')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Royalty deposits (manual, splits) ── */}
      {pending.length > 0 && (
        <>
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
            Needs dividing up · {pending.length}
          </div>
          <div className="flex flex-col gap-3 mb-8">
            {pending.map(d => {
              const mgmt   = Math.round(d.amount * d.mgmt)
              const lawyer = Math.round(d.amount * d.lawyer)
              const taxes  = Math.round(d.amount * d.taxes)
              const stays  = d.amount - mgmt - lawyer - taxes
              return (
                <div key={d.id} className="border border-gray-100 rounded-2xl p-4">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="font-semibold text-sm">{d.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{d.date}</div>
                    </div>
                    <div className="font-serif font-semibold text-xl">{fmt(d.amount, d.currency)}</div>
                  </div>
                  <div className="border-t border-gray-100">
                    {[['Management', mgmt], ['Lawyer', lawyer], ['Taxes', taxes], ['Stays in Operating', stays]].map(([lbl, val]) => (
                      <div key={lbl} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0 text-sm">
                        <span className="flex-1 text-gray-500">{lbl}</span>
                        <span className="font-semibold">{fmt(val as number, d.currency)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button onClick={() => markDepositDone(d.id)} className="px-3 py-1.5 bg-blue-500 text-white text-xs font-medium rounded-lg hover:bg-blue-600 transition-colors">Mark all moved</button>
                    <button onClick={() => dismissDeposit(d.id)} className="px-3 py-1.5 border border-gray-200 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors">Dismiss</button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {divided.length > 0 && (
        <>
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
            Divided up · {divided.length}
          </div>
          <div className="flex flex-col gap-2 mb-4 opacity-60">
            {divided.map(d => (
              <div key={d.id} className="border border-gray-100 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-green-500">✓</span>
                    <span className="font-semibold text-sm">{d.name}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">{d.date}</div>
                </div>
                <div className="font-serif font-semibold text-lg">{fmt(d.amount, d.currency)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <button className="text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors">
        + Log a deposit
      </button>
    </div>
  )
}
