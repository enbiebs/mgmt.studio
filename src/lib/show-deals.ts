// ──────────────────────────────────────────────────────────
//  A show's money (guarantee, deposit, currency, agency and management commissions, the invoice made for it) lives in its
//  own table, show_deals, that only people with the Deals & fees page can read (migration 055). The Show a screen holds
//  still carries these fields, filled in from that table when the person is allowed to see them. These helpers move the
//  fields between the two so no screen has to know. Pure logic (no screen, no database), so it can be tested.
// ──────────────────────────────────────────────────────────
import type { Show } from '@/types'

export const DEAL_KEYS = ['guarantee', 'deposit', 'received', 'currency', 'viaAgency', 'agencyName', 'agencyCommissionPct', 'managementCommissionPct', 'invoiceId'] as const
export type DealKey = (typeof DEAL_KEYS)[number]
export type ShowDealFields = Pick<Show, DealKey>

/** One row of show_deals, as the database returns it and takes it. */
export interface ShowDealRow {
  show_id: string
  client_id: string
  guarantee: number | null
  deposit: number | null
  received: number | null
  currency: string | null
  via_agency: boolean | null
  agency_name: string | null
  agency_commission_pct: number | null
  management_commission_pct: number | null
  invoice_id: string | null
}

/** The row to save for this show's money. */
export function showDealRow(show: Pick<Show, 'id' | DealKey>, clientId: string): ShowDealRow {
  return {
    show_id: show.id, client_id: clientId,
    guarantee: show.guarantee ?? null, deposit: show.deposit ?? null, received: show.received ?? null, currency: show.currency ?? null,
    via_agency: show.viaAgency ?? null, agency_name: show.agencyName ?? null,
    agency_commission_pct: show.agencyCommissionPct ?? null, management_commission_pct: show.managementCommissionPct ?? null,
    invoice_id: show.invoiceId ?? null,
  }
}

/** The money fields to put on a Show from its show_deals row (nothing for a null column). */
export function dealFromRow(row: Partial<ShowDealRow> | undefined): ShowDealFields {
  if (!row) return {}
  return {
    guarantee: row.guarantee ?? undefined, deposit: row.deposit ?? undefined, received: row.received ?? undefined, currency: (row.currency ?? undefined) as Show['currency'],
    viaAgency: row.via_agency ?? undefined, agencyName: row.agency_name ?? undefined,
    agencyCommissionPct: row.agency_commission_pct ?? undefined, managementCommissionPct: row.management_commission_pct ?? undefined,
    invoiceId: row.invoice_id ?? undefined,
  }
}

/** True when the show carries any money at all (so there is something worth a show_deals row). */
export function hasDealData(show: Partial<Pick<Show, DealKey>>): boolean {
  return DEAL_KEYS.some(k => show[k] !== undefined && show[k] !== null)
}

/** The same show with its money taken off: what a person without Deals & fees access is given. */
export function withoutDeal<T extends Partial<Pick<Show, DealKey>>>(show: T): T {
  const out = { ...show }
  for (const k of DEAL_KEYS) delete out[k]
  return out
}

/** A change to a show split into the part that is money (saved to show_deals) and the rest (saved to the show itself). */
export function splitDealPatch<P extends object>(patch: P): { deal: Partial<ShowDealFields>; rest: Omit<P, DealKey>; touchesDeal: boolean } {
  const deal: Record<string, unknown> = {}
  const rest: Record<string, unknown> = { ...(patch as Record<string, unknown>) }
  let touchesDeal = false
  for (const k of DEAL_KEYS) {
    if (k in patch) { deal[k] = (patch as Record<string, unknown>)[k]; touchesDeal = true }
    delete rest[k]
  }
  return { deal: deal as Partial<ShowDealFields>, rest: rest as Omit<P, DealKey>, touchesDeal }
}
