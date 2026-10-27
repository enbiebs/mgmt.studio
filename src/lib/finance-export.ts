// ──────────────────────────────────────────────────────────
//  The money, as spreadsheets for an accountant: invoices, bills, show fees and commissions, the monthly profit & loss, settlements.
//  Pure logic (no store, no screen), covered by scripts/check-finance-export.ts.
//
//  It writes down what the person can already see: the data handed in is the data the app loaded for them, so someone without access to
//  show fees (Deals & fees) simply gets no fee rows, and a hidden invoice is not in the file. Every row carries its own currency; amounts
//  of different currencies are never added together, and there are no totals row to get wrong: the accountant sums what they need.
// ──────────────────────────────────────────────────────────

import type { Client, PLMonth } from '@/types'
import { invoiceOutstanding, invoiceStateWithDeposits, invoiceTotal, r2, showCommissions } from '@/lib/money'
import { buildPL, netIncome, totalExpenses, totalRevenue, SOURCE_LABEL } from '@/lib/ledger'
import { balanceOf, paidSoFar } from '@/lib/settlement-math'
import { toCsv, type Cell } from '@/lib/csv'

export type ExportKind = 'invoices' | 'bills' | 'commissions' | 'pl' | 'settlements'

export const EXPORTS: { key: ExportKind; label: string; hint: string }[] = [
  { key: 'invoices', label: 'Invoices', hint: 'every invoice, what it is for, and what is still owed' },
  { key: 'bills', label: 'Bills', hint: 'every bill and expense, paid or not' },
  { key: 'commissions', label: 'Show fees and commissions', hint: 'what each show pays and who takes what' },
  { key: 'pl', label: 'Profit and loss, by month', hint: 'money in and money out for each month' },
  { key: 'settlements', label: 'Settlements', hint: 'what each promoter owes after the show, and what has been paid' },
]

type Row = Record<string, Cell>
export interface CsvFile { columns: string[]; rows: Row[]; csv: string }

const make = (columns: string[], rows: Row[]): CsvFile => ({ columns, rows, csv: toCsv(columns, rows) })
const dateOf = (iso?: string) => (iso ? iso.slice(0, 10) : '')
const STATUS_WORD: Record<string, string> = { draft: 'Draft', sent: 'Sent', paid: 'Paid', overdue: 'Overdue', void: 'Void' }

function invoices(clients: Client[], today: string): CsvFile {
  const columns = ['Artist', 'Invoice', 'Billed to', 'Email', 'Category', 'Status', 'Issued', 'Due', 'Paid on', 'Currency', 'Total', 'Received', 'Outstanding']
  const rows: Row[] = []
  for (const c of clients) {
    const deposits = c.business?.banking?.deposits ?? []
    for (const inv of c.finance?.invoices ?? []) {
      const state = invoiceStateWithDeposits(inv, today, deposits)
      const total = invoiceTotal(inv)
      const open = state === 'sent' || state === 'overdue'
      const outstanding = open ? invoiceOutstanding(inv, deposits) : 0
      const received = state === 'paid' ? total : open ? r2(total - outstanding) : 0
      rows.push({ Artist: c.name, Invoice: inv.number, 'Billed to': inv.to, Email: inv.toEmail, Category: inv.category, Status: STATUS_WORD[state] ?? state, Issued: dateOf(inv.issuedDate), Due: dateOf(inv.dueDate), 'Paid on': dateOf(inv.paidDate), Currency: inv.currency, Total: total, Received: received, Outstanding: outstanding })
    }
  }
  return make(columns, rows)
}

function bills(clients: Client[]): CsvFile {
  const columns = ['Artist', 'Vendor', 'Bill number', 'Description', 'Category', 'Currency', 'Amount', 'Bill date', 'Due date', 'Paid']
  const rows: Row[] = []
  for (const c of clients) {
    for (const e of c.finance?.expenses ?? []) {
      rows.push({ Artist: c.name, Vendor: e.vendor, 'Bill number': e.billNumber, Description: e.description, Category: e.category, Currency: e.currency, Amount: r2(e.amount), 'Bill date': dateOf(e.date), 'Due date': dateOf(e.dueDate), Paid: e.paid })
    }
  }
  return make(columns, rows)
}

function commissions(clients: Client[]): CsvFile {
  const columns = ['Artist', 'Date', 'Venue', 'City', 'Status', 'History only', 'Currency', 'Fee', 'Deposit', 'Received so far', 'Booked through an agency', 'Agency', 'Agency %', 'Management %', 'Agency commission', 'Management commission', 'Net to artist']
  const rows: Row[] = []
  for (const c of clients) {
    for (const s of c.tour?.shows ?? []) {
      if (!s.guarantee || s.status === 'cancelled') continue       // no fee entered (or not allowed to see it), or the show did not happen: nothing to divide
      const k = showCommissions(s)
      rows.push({
        Artist: c.name, Date: dateOf(s.date), Venue: s.venue, City: s.city, Status: s.status, 'History only': !!s.historyOnly, Currency: s.currency ?? 'USD',
        Fee: k.fee, Deposit: s.deposit, 'Received so far': s.received, 'Booked through an agency': !!s.viaAgency, Agency: s.viaAgency ? s.agencyName : '',
        'Agency %': s.viaAgency ? s.agencyCommissionPct : undefined, 'Management %': s.viaAgency ? s.managementCommissionPct : undefined,
        'Agency commission': k.agency, 'Management commission': k.management, 'Net to artist': k.net,
      })
    }
  }
  return make(columns, rows.sort((a, b) => String(a.Date).localeCompare(String(b.Date)) || String(a.Artist).localeCompare(String(b.Artist))))
}

const REVENUE: [string, keyof PLMonth['revenue']][] = [['Touring', 'touring'], ['Streaming', 'streaming'], ['Sync', 'sync'], ['Brand', 'brand'], ['Merch', 'merch'], ['Other income', 'other']]
const EXPENSE: [string, keyof PLMonth['expenses']][] = [['Travel', 'travel'], ['Recording', 'recording'], ['Marketing', 'marketing'], ['Legal', 'legal'], ['Management fees', 'management'], ['Equipment', 'equipment'], ['Meals', 'meals'], ['Other costs', 'other']]

function pl(clients: Client[], today: string): CsvFile {
  const columns = ['Artist', 'Month', 'Currency', 'Where the figures come from', ...REVENUE.map(r => r[0]), 'Total in', ...EXPENSE.map(e => e[0]), 'Total out', 'Net']
  const rows: Row[] = []
  for (const c of clients) {
    const ledger = buildPL(c, today)
    for (const cur of ledger.currencies) {
      for (const m of ledger.months[cur] ?? []) {
        if (m.source === 'none') continue
        const row: Row = { Artist: c.name, Month: m.month, Currency: cur, 'Where the figures come from': SOURCE_LABEL[m.source], 'Total in': totalRevenue(m), 'Total out': totalExpenses(m), Net: netIncome(m) }
        for (const [label, key] of REVENUE) row[label] = m.revenue[key]
        for (const [label, key] of EXPENSE) row[label] = m.expenses[key]
        rows.push(row)
      }
    }
  }
  return make(columns, rows.sort((a, b) => String(a.Month).localeCompare(String(b.Month)) || String(a.Artist).localeCompare(String(b.Artist)) || String(a.Currency).localeCompare(String(b.Currency))))
}

function settlements(clients: Client[]): CsvFile {
  const columns = ['Artist', 'Show date', 'Event', 'Venue', 'Promoter', 'Prepared on', 'Currency', 'Total due', 'Paid so far', 'Balance']
  const rows: Row[] = []
  for (const c of clients) {
    const dates = new Map((c.tour?.shows ?? []).map(s => [s.id, dateOf(s.date)]))
    for (const s of c.finance?.settlements ?? []) {
      rows.push({
        Artist: c.name, 'Show date': s.showIds.map(id => dates.get(id)).filter(Boolean).join('; '), Event: s.eventName, Venue: s.venue, Promoter: s.promoter,
        'Prepared on': dateOf(s.preparedOn), Currency: s.currency, 'Total due': r2(s.totalDue), 'Paid so far': paidSoFar(s), Balance: balanceOf(s),
      })
    }
  }
  return make(columns, rows)
}

/** The spreadsheet for one kind of export across these artists. */
export function buildExport(kind: ExportKind, clients: Client[], today: string): CsvFile {
  switch (kind) {
    case 'invoices': return invoices(clients, today)
    case 'bills': return bills(clients)
    case 'commissions': return commissions(clients)
    case 'pl': return pl(clients, today)
    case 'settlements': return settlements(clients)
  }
}
