-- Finance Stage 2: agency-flow receivables + generate-invoice.
-- Most shows get paid through a booking agency (which nets out its own
-- commission, and sometimes management's, before remitting) rather than
-- being invoiced directly — these columns capture that on both the Offer
-- (where it's negotiated) and the Show it confirms into, mirroring how
-- guarantee/currency already flow from Offer to Show.

alter table tour_offers
  add column via_agency boolean,
  add column agency_name text,
  add column agency_commission_pct numeric,
  add column management_commission_pct numeric;

alter table shows
  add column via_agency boolean,
  add column agency_name text,
  add column agency_commission_pct numeric,
  add column management_commission_pct numeric,
  add column invoice_id text references invoices(id) on delete set null;

create index if not exists shows_invoice_id_idx on shows(invoice_id);
