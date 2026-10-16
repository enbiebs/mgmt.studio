// ──────────────────────────────────────────────────────────
//  Inbox (Finance Stage 5) — works out what needs the manager's attention, from the
//  data already in the app. Nothing here is stored: it is recomputed every time, so it
//  can never go stale. Pure logic (no store, no screen), so the daily email can use the
//  very same rules as the Inbox page.
//
//  Each item is "keyed" by rule + thing + how urgent it is. That key is what Done and
//  Snooze remember, so something marked done comes back if it gets worse.
// ──────────────────────────────────────────────────────────

import type { Client, Currency, Invoice, MainSection } from '@/types'
import { latestSheet } from '@/lib/offer-sheet'
import { paidSoFar } from '@/lib/settlement-math'
import { settlementForShow } from '@/lib/budget'
import { localDateOf } from '@/lib/utils'
import { buildForecast } from '@/lib/forecast'

export type InboxSeverity = 'urgent' | 'soon' | 'info'
export type InboxRule =
  | 'invoice' | 'bill' | 'balance' | 'no_settlement' | 'offer_reply' | 'offer_hold' | 'sheet'
  | 'no_budget' | 'deposits' | 'receivable' | 'empty'

export interface InboxItem {
  key: string
  clientId: string
  clientName: string
  rule: InboxRule
  severity: InboxSeverity
  title: string
  detail?: string
  amount?: number
  currency?: Currency
  date?: string                       // the date it is about, for ordering
  go: { section: MainSection; sub?: string }   // where "Open" takes you
}

// What this person may see for this client: money items need Finance, show items need Tour,
// offer items need Deals & fees. (The artist's own login never gets an inbox at all.)
export interface InboxAccess { finance: boolean; tour: boolean; deals: boolean }

const DAY = 86_400_000
const days = (a: string, b: string) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / DAY)
const invoiceTotal = (inv: Invoice) => inv.items.reduce((s, i) => s + i.quantity * i.rate, 0)
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const when = (n: number) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`)

const RANK: Record<InboxSeverity, number> = { urgent: 0, soon: 1, info: 2 }

export function buildInbox(client: Client, today: string, access: InboxAccess): InboxItem[] {
  // A demo artist's fake invoices and shows must never raise real alerts.
  if (client.isDemo) return []
  const items: InboxItem[] = []
  const add = (
    rule: InboxRule, entityId: string, severity: InboxSeverity,
    rest: Omit<InboxItem, 'key' | 'clientId' | 'clientName' | 'rule' | 'severity'>,
  ) => items.push({ key: `${rule}:${client.id}:${entityId}:${severity}`, clientId: client.id, clientName: client.name, rule, severity, ...rest })

  const settlements = client.finance.settlements ?? []
  const settledShowIds = new Set(settlements.flatMap(s => s.showIds))

  // ── Money ──────────────────────────────────────────────
  if (access.finance) {
    // Invoices you've sent that haven't been paid.
    for (const inv of client.finance.invoices) {
      if (inv.status !== 'sent' && inv.status !== 'overdue') continue
      const late = days(today, inv.dueDate)
      const total = invoiceTotal(inv)
      if (late > 0) {
        add('invoice', inv.id, 'urgent', { title: `Invoice ${inv.number} to ${inv.to} is ${plural(late, 'day')} overdue`, amount: total, currency: inv.currency, date: inv.dueDate, go: { section: 'finance', sub: 'invoices' } })
      } else if (late >= -7) {
        add('invoice', inv.id, 'soon', { title: `Invoice ${inv.number} to ${inv.to} is due ${when(-late)}`, amount: total, currency: inv.currency, date: inv.dueDate, go: { section: 'finance', sub: 'invoices' } })
      }
    }

    // Bills you owe.
    for (const e of client.finance.expenses) {
      if (e.paid || !e.dueDate) continue
      const late = days(today, e.dueDate)
      const label = e.billNumber ? `${e.vendor} (${e.billNumber})` : e.vendor
      if (late > 0) {
        add('bill', e.id, 'urgent', { title: `Bill from ${label} is ${plural(late, 'day')} overdue`, detail: e.description, amount: e.amount, currency: e.currency, date: e.dueDate, go: { section: 'finance', sub: 'payments' } })
      } else if (late >= -7) {
        add('bill', e.id, 'soon', { title: `Bill from ${label} is due ${when(-late)}`, detail: e.description, amount: e.amount, currency: e.currency, date: e.dueDate, go: { section: 'finance', sub: 'payments' } })
      }
    }

    // Settlements that came in but haven't been paid in full.
    for (const s of settlements) {
      const balance = s.balanceDue ?? s.totalDue - paidSoFar(s)
      if (balance <= 0.005) continue
      const since = s.preparedOn ?? localDateOf(s.confirmedAt)
      const age = days(today, since)
      const severity: InboxSeverity = age > 30 ? 'urgent' : age > 7 ? 'soon' : 'info'
      add('balance', s.id, severity, {
        title: `${s.promoter ?? 'The promoter'} still owes you on ${s.venue ?? s.eventName ?? 'a settlement'}`,
        detail: `Settlement ${age <= 0 ? 'received today' : `received ${plural(age, 'day')} ago`}`,
        amount: balance, currency: s.currency, date: since, go: { section: 'tour', sub: 'settlements' },
      })
    }

    // A scheduled payment (a deposit, a payment "30 days out") that was due and has not been recorded as received. Fees with
    // no schedule are not raised here: "No settlement yet" already covers a show that happened.
    for (const f of buildForecast(client, today).filter(i => i.kind === 'installment' && i.late)) {
      add('receivable', f.id, f.daysLate > 14 ? 'urgent' : 'soon', {
        title: `${f.title} was expected ${plural(f.daysLate, 'day')} ago`, detail: 'Record it as received, or chase it',
        amount: f.amount, currency: f.currency, date: f.date, go: { section: 'finance', sub: 'forecast' },
      })
    }

    // Money that is arriving but hasn't been split yet.
    const pendingDeposits = client.business.banking.deposits.filter(d => !d.done)
    if (pendingDeposits.length > 0) {
      add('deposits', 'all', 'info', { title: `${plural(pendingDeposits.length, 'deposit')} waiting to be split`, go: { section: 'finance', sub: 'banking' } })
    }
  }

  // ── Offers ────────────────────────────────────────────
  if (access.deals) {
    for (const o of client.agentData?.offers ?? []) {
      if (o.status !== 'inquiry' && o.status !== 'hold') continue

      // The buyer wants an answer by a date.
      const respondBy = o.terms?.respondBy
      if (respondBy) {
        const left = days(respondBy, today)
        if (left < 0) add('offer_reply', o.id, 'urgent', { title: `Your reply to ${o.venue} was due ${plural(-left, 'day')} ago`, detail: `${o.city} · ${o.promoter}`, date: respondBy, go: { section: 'tour', sub: 'offers' } })
        else if (left <= 3) add('offer_reply', o.id, 'urgent', { title: `${o.venue} needs your reply ${when(left)}`, detail: `${o.city} · ${o.promoter}`, date: respondBy, go: { section: 'tour', sub: 'offers' } })
        else if (left <= 7) add('offer_reply', o.id, 'soon', { title: `${o.venue} needs your reply ${when(left)}`, detail: `${o.city} · ${o.promoter}`, date: respondBy, go: { section: 'tour', sub: 'offers' } })
      }

      // A hold that's close and still not confirmed.
      const away = days(o.date, today)
      if (o.status === 'hold' && away >= 0 && away <= 14) {
        add('offer_hold', o.id, 'soon', { title: `The hold at ${o.venue} is still unconfirmed (the date is ${when(away)})`, detail: `${o.city} · ${o.promoter}`, date: o.date, go: { section: 'tour', sub: 'offers' } })
      }

      // The artist's answer to an offer sheet (sheets carry budget numbers: Deals & fees + Finance).
      if (access.finance) {
        const sheet = latestSheet(client.tour.offerSheets, o.id)
        if (sheet?.status === 'approved') {
          add('sheet', sheet.id, 'soon', { title: `${client.name} approved V${sheet.version} for ${o.venue}`, detail: 'Confirm it with the promoter when you are ready', date: sheet.respondedAt ? localDateOf(sheet.respondedAt) : undefined, go: { section: 'tour', sub: 'offers' } })
        } else if (sheet?.status === 'passed') {
          add('sheet', sheet.id, 'info', { title: `${client.name} passed on ${o.venue}`, detail: sheet.responseNote ? `"${sheet.responseNote}"` : 'You may want to close the offer', date: sheet.respondedAt ? localDateOf(sheet.respondedAt) : undefined, go: { section: 'tour', sub: 'offers' } })
        } else if (sheet?.status === 'sent') {
          const waiting = days(today, localDateOf(sheet.sentAt))
          if (waiting >= 3) add('sheet', sheet.id, 'soon', { title: `Waiting on ${client.name} to answer V${sheet.version} for ${o.venue}`, detail: `Sent ${plural(waiting, 'day')} ago`, date: localDateOf(sheet.sentAt), go: { section: 'tour', sub: 'offers' } })
        }
      }
    }
  }

  // ── Shows that need their money side finished ─────────
  if (access.tour && access.finance) {
    for (const show of client.tour.shows) {
      if (show.status !== 'confirmed' || show.historyOnly) continue
      const since = days(today, show.date)

      // The show happened but no settlement has been entered.
      if (since >= 3 && !settledShowIds.has(show.id) && !settlementForShow(client, show.id)) {
        const severity: InboxSeverity = since > 21 ? 'urgent' : since > 7 ? 'soon' : 'info'
        add('no_settlement', show.id, severity, { title: `No settlement yet for ${show.venue}`, detail: `${show.city} · the show was ${plural(since, 'day')} ago`, date: show.date, go: { section: 'tour', sub: 'settlements' } })
      }

      // A show coming up with no budget.
      const away = -since
      if (away >= 0 && away <= 30 && !(client.finance.budgets ?? []).some(b => b.showId === show.id)) {
        add('no_budget', show.id, 'info', { title: `No budget yet for ${show.venue}`, detail: `${show.city} · ${away === 0 ? 'today' : `in ${plural(away, 'day')}`}`, date: show.date, go: { section: 'tour', sub: 'budget' } })
      }
    }

    // Nothing at all entered: an empty inbox here would just mean "nothing recorded".
    const entered = (client.finance.budgets?.length ?? 0) + client.finance.expenses.length + client.finance.invoices.length + settlements.length
    if (entered === 0 && client.tour.shows.some(s => s.status === 'confirmed' && !s.historyOnly)) {
      add('empty', 'all', 'info', { title: `Nothing financial is recorded for ${client.name} yet`, detail: 'An empty inbox here means nothing has been entered, not that all is well', go: { section: 'finance', sub: 'payments' } })
    }
  }

  return items.sort((a, b) => RANK[a.severity] - RANK[b.severity] || (a.date ?? '').localeCompare(b.date ?? ''))
}

// ── Done / snoozed ───────────────────────────────────────────
export interface InboxChoice { state: 'done' | 'snoozed'; until?: string }

// Hidden if marked done, or snoozed to a date that hasn't arrived yet.
export function isHidden(choice: InboxChoice | undefined, today: string): boolean {
  if (!choice) return false
  if (choice.state === 'done') return true
  return !!choice.until && choice.until > today
}

export const SEVERITY_LABEL: Record<InboxSeverity, string> = { urgent: 'Needs you now', soon: 'Coming up', info: 'Heads-up' }
