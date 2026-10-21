'use client'
import { useEffect, useState } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import { useStore } from '@/lib/store'
import { fmt, today as localToday } from '@/lib/utils'
import { invoiceOutstanding, invoiceTotal, splitDeposit } from '@/lib/money'
import { Modal, FormField, inputClass, selectClass } from '@/components/ui/Modal'
import type { Currency, Invoice } from '@/types'

function ConnectBankButton({ clientId }: { clientId: string }) {
  const editable = useStore(s => s.canEdit('finance'))
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

  if (!editable) return null

  return (
    <div>
      <button
        onClick={startConnect}
        disabled={busy}
        className="px-3 py-1.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
      >
        {busy ? 'Connecting…' : '+ Connect a bank account'}
      </button>
      {error && <div className="text-xs text-red-500 mt-1.5">{error}</div>}
    </div>
  )
}

function RefreshButton({ clientId }: { clientId: string }) {
  const editable = useStore(s => s.canEdit('finance'))
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

  if (!editable) return null

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
  const editable = useStore(s => s.canEdit('finance'))
  const { markDepositDone, dismissDeposit, loadBankData } = useStore()
  const [addOpen, setAddOpen] = useState(false)
  // The ⌘K bar's "Log a deposit" opens the form here.
  const depositRequested = useStore(s => s.depositAddRequest)
  const clearDepositRequest = useStore(s => s.clearDepositAddRequest)
  const depositInvoiceId = useStore(s => s.depositAddInvoiceId)

  useEffect(() => {
    if (client?.id) loadBankData(client.id)
  }, [client?.id, loadBankData])

  // A request for an invoice that is not this artist's (the artist was switched since) is dropped, not left to pop up later.
  const hasRequestedInvoice = !depositInvoiceId || !!client?.finance?.invoices.some(i => i.id === depositInvoiceId)
  useEffect(() => { if (client && !hasRequestedInvoice) clearDepositRequest() }, [client, hasRequestedInvoice, clearDepositRequest])

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
              const { mgmt, lawyer, taxes, stays } = splitDeposit(d.amount, d)
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
                  {editable && (
                    <div className="flex gap-2 mt-4">
                      <button onClick={() => markDepositDone(d.id)} className="px-3 py-1.5 bg-accent text-white text-xs font-medium rounded-lg hover:bg-accent-hover transition-colors">Mark all moved</button>
                      <button onClick={() => dismissDeposit(d.id)} className="px-3 py-1.5 border border-gray-200 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors">Dismiss</button>
                    </div>
                  )}
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

      {editable && (
        <button
          onClick={() => setAddOpen(true)}
          className="text-sm font-medium text-gray-400 hover:text-gray-600 transition-colors"
        >
          + Log a deposit
        </button>
      )}

      {(addOpen || depositRequested) && <AddDepositModal initialInvoiceId={depositInvoiceId ?? undefined} onClose={() => { setAddOpen(false); clearDepositRequest() }} />}
    </div>
  )
}

function AddDepositModal({ onClose, initialInvoiceId }: { onClose: () => void; initialInvoiceId?: string }) {
  const { addDeposit } = useStore()
  const client = useStore(s => s.getClient())
  // Invoices this money could be paying: sent or paid ones that still have something left to collect (a part-paid invoice takes another deposit).
  const logged = client?.business.banking.deposits ?? []
  const stillDue = (i: Invoice) => invoiceOutstanding(i, logged)
  const payable: Invoice[] = (client?.finance?.invoices ?? []).filter(i => (i.status === 'sent' || i.status === 'overdue' || i.status === 'paid') && stillDue(i) > 0.005)
  // Opened from "X of it is not logged as a deposit yet": the invoice, the amount still to log and its currency start out filled in.
  const first = payable.find(i => i.id === initialInvoiceId)
  const [invoiceId, setInvoiceId] = useState(first?.id ?? '')
  const [name, setName] = useState(first ? `Invoice ${first.number} · ${first.to}` : '')
  const [date, setDate] = useState(localToday())
  const [amount, setAmount] = useState(first ? String(stillDue(first)) : '')
  const [currency, setCurrency] = useState<Currency>(first?.currency ?? 'USD')
  const [mgmtPct, setMgmtPct] = useState('')
  const [lawyerPct, setLawyerPct] = useState('')
  const [taxesPct, setTaxesPct] = useState('')

  function handleAdd() {
    const n = Number(amount)
    if (!name.trim() || !date || !n) return
    addDeposit(
      name.trim(), date, n, currency,
      (Number(mgmtPct) || 0) / 100,
      (Number(lawyerPct) || 0) / 100,
      (Number(taxesPct) || 0) / 100,
      invoiceId || undefined,
    )
    onClose()
  }

  // Picking the invoice fills in what it already says, without overwriting anything typed.
  const labelFor = (i: Invoice) => `Invoice ${i.number} · ${i.to}`
  function pickInvoice(id: string) {
    const previous = payable.find(i => i.id === invoiceId)
    setInvoiceId(id)
    const inv = payable.find(i => i.id === id)
    if (!inv) return
    // what was filled in for the invoice picked before is replaced; what the person typed is kept
    if (!amount || (previous && amount === String(stillDue(previous)))) setAmount(String(stillDue(inv)))
    setCurrency(inv.currency)
    if (!name.trim() || (previous && name === labelFor(previous))) setName(labelFor(inv))
  }
  const picked = payable.find(i => i.id === invoiceId)
  const overpays = !!picked && Number(amount) > stillDue(picked) + 0.005

  return (
    <Modal title="Log a deposit" onClose={onClose} footer={
      <>
        <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
        <button onClick={handleAdd} className="px-3 py-1.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover">Log deposit</button>
      </>
    }>
      {payable.length > 0 && (
        <FormField label="Which invoice does this pay? (optional)">
          <select className={selectClass} value={invoiceId} onChange={e => pickInvoice(e.target.value)}>
            <option value="">Not an invoice payment</option>
            {payable.map(i => <option key={i.id} value={i.id}>{i.number} · {i.to} · {fmt(stillDue(i), i.currency)}{stillDue(i) < invoiceTotal(i) - 0.005 ? ' still due' : ''}{i.status === 'paid' ? ' · marked paid' : ''}</option>)}
          </select>
          <span className="mt-1 block text-[11px] text-gray-400">Pick one if this money is the payment for an invoice, so the profit &amp; loss counts it once, not twice.</span>
        </FormField>
      )}
      <FormField label="Source">
        <input className={inputClass} placeholder="e.g. Sync Licensing Co." value={name} onChange={e => setName(e.target.value)} autoFocus />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Date">
          <input type="date" className={inputClass} value={date} onChange={e => setDate(e.target.value)} />
        </FormField>
        <FormField label="Amount">
          <input type="number" min="0" className={inputClass} value={amount} onChange={e => setAmount(e.target.value)} />
          {overpays && picked && <span className="mt-1 block text-[11px] text-amber-600">That is more than the {fmt(stillDue(picked), picked.currency)} still due on this invoice. If it also pays another one, log it as two deposits.</span>}
        </FormField>
      </div>
      <FormField label="Currency">
        {/* A payment for an invoice is in that invoice's currency; otherwise it could not be taken off what is owed. */}
        <select className={selectClass} value={currency} disabled={!!invoiceId} title={invoiceId ? 'This is the invoice\'s currency' : undefined} onChange={e => setCurrency(e.target.value as Currency)}>
          <option value="USD">USD</option>
          <option value="GBP">GBP</option>
          <option value="EUR">EUR</option>
        </select>
      </FormField>
      <div className="grid grid-cols-3 gap-3">
        <FormField label="Management %">
          <input type="number" min="0" max="100" className={inputClass} placeholder="0" value={mgmtPct} onChange={e => setMgmtPct(e.target.value)} />
        </FormField>
        <FormField label="Lawyer %">
          <input type="number" min="0" max="100" className={inputClass} placeholder="0" value={lawyerPct} onChange={e => setLawyerPct(e.target.value)} />
        </FormField>
        <FormField label="Taxes %">
          <input type="number" min="0" max="100" className={inputClass} placeholder="0" value={taxesPct} onChange={e => setTaxesPct(e.target.value)} />
        </FormField>
      </div>
    </Modal>
  )
}
