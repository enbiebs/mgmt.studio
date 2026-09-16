-- Finance Foundation (Stage 1 of the Finance/business-management layer).
-- Renames the "business" access-grant section to "finance" (same tables,
-- same content — the nav section is being relabeled, not replaced), and
-- gives shows/tour_offers the money fields + link needed for confirming
-- an offer to create its Show.

-- ── Rename access grant section: business → finance ────────────────────
alter table access_grants drop constraint if exists access_grants_section_check;
alter table access_grants add constraint access_grants_section_check
  check (section in ('music','tour','content','finance','team','projects','analytics','fandom','legal'));

update access_grants set section = 'finance' where section = 'business';

-- ── RLS: swap 'business' for 'finance' on every finance-adjacent table ──
drop policy if exists "royalty_streams select" on royalty_streams;
drop policy if exists "royalty_streams insert" on royalty_streams;
drop policy if exists "royalty_streams update" on royalty_streams;
drop policy if exists "royalty_streams delete" on royalty_streams;
create policy "royalty_streams select" on royalty_streams for select using (has_section_access(client_id, 'finance'));
create policy "royalty_streams insert" on royalty_streams for insert with check (has_section_access(client_id, 'finance', true));
create policy "royalty_streams update" on royalty_streams for update using (has_section_access(client_id, 'finance', true)) with check (has_section_access(client_id, 'finance', true));
create policy "royalty_streams delete" on royalty_streams for delete using (has_section_access(client_id, 'finance', true));

drop policy if exists "deposits select" on deposits;
drop policy if exists "deposits insert" on deposits;
drop policy if exists "deposits update" on deposits;
drop policy if exists "deposits delete" on deposits;
create policy "deposits select" on deposits for select using (has_section_access(client_id, 'finance'));
create policy "deposits insert" on deposits for insert with check (has_section_access(client_id, 'finance', true));
create policy "deposits update" on deposits for update using (has_section_access(client_id, 'finance', true)) with check (has_section_access(client_id, 'finance', true));
create policy "deposits delete" on deposits for delete using (has_section_access(client_id, 'finance', true));

drop policy if exists "catalog_works select" on catalog_works;
drop policy if exists "catalog_works insert" on catalog_works;
drop policy if exists "catalog_works update" on catalog_works;
drop policy if exists "catalog_works delete" on catalog_works;
create policy "catalog_works select" on catalog_works for select using (has_section_access(client_id, 'finance'));
create policy "catalog_works insert" on catalog_works for insert with check (has_section_access(client_id, 'finance', true));
create policy "catalog_works update" on catalog_works for update using (has_section_access(client_id, 'finance', true)) with check (has_section_access(client_id, 'finance', true));
create policy "catalog_works delete" on catalog_works for delete using (has_section_access(client_id, 'finance', true));

drop policy if exists "invoices select" on invoices;
drop policy if exists "invoices insert" on invoices;
drop policy if exists "invoices update" on invoices;
drop policy if exists "invoices delete" on invoices;
create policy "invoices select" on invoices for select using (has_section_access(client_id, 'finance'));
create policy "invoices insert" on invoices for insert with check (has_section_access(client_id, 'finance', true));
create policy "invoices update" on invoices for update using (has_section_access(client_id, 'finance', true)) with check (has_section_access(client_id, 'finance', true));
create policy "invoices delete" on invoices for delete using (has_section_access(client_id, 'finance', true));

drop policy if exists "invoice_line_items select" on invoice_line_items;
drop policy if exists "invoice_line_items insert" on invoice_line_items;
drop policy if exists "invoice_line_items update" on invoice_line_items;
drop policy if exists "invoice_line_items delete" on invoice_line_items;
create policy "invoice_line_items select" on invoice_line_items for select using (has_section_access((select client_id from invoices where id = invoice_line_items.invoice_id), 'finance'));
create policy "invoice_line_items insert" on invoice_line_items for insert with check (has_section_access((select client_id from invoices where id = invoice_line_items.invoice_id), 'finance', true));
create policy "invoice_line_items update" on invoice_line_items for update using (has_section_access((select client_id from invoices where id = invoice_line_items.invoice_id), 'finance', true)) with check (has_section_access((select client_id from invoices where id = invoice_line_items.invoice_id), 'finance', true));
create policy "invoice_line_items delete" on invoice_line_items for delete using (has_section_access((select client_id from invoices where id = invoice_line_items.invoice_id), 'finance', true));

drop policy if exists "expenses select" on expenses;
drop policy if exists "expenses insert" on expenses;
drop policy if exists "expenses update" on expenses;
drop policy if exists "expenses delete" on expenses;
create policy "expenses select" on expenses for select using (has_section_access(client_id, 'finance'));
create policy "expenses insert" on expenses for insert with check (has_section_access(client_id, 'finance', true));
create policy "expenses update" on expenses for update using (has_section_access(client_id, 'finance', true)) with check (has_section_access(client_id, 'finance', true));
create policy "expenses delete" on expenses for delete using (has_section_access(client_id, 'finance', true));

drop policy if exists "pl_months select" on pl_months;
drop policy if exists "pl_months insert" on pl_months;
drop policy if exists "pl_months update" on pl_months;
drop policy if exists "pl_months delete" on pl_months;
create policy "pl_months select" on pl_months for select using (has_section_access(client_id, 'finance'));
create policy "pl_months insert" on pl_months for insert with check (has_section_access(client_id, 'finance', true));
create policy "pl_months update" on pl_months for update using (has_section_access(client_id, 'finance', true)) with check (has_section_access(client_id, 'finance', true));
create policy "pl_months delete" on pl_months for delete using (has_section_access(client_id, 'finance', true));

drop policy if exists "bank_accounts select" on bank_accounts;
drop policy if exists "bank_accounts insert" on bank_accounts;
drop policy if exists "bank_accounts update" on bank_accounts;
drop policy if exists "bank_accounts delete" on bank_accounts;
create policy "bank_accounts select" on bank_accounts for select using (has_section_access(client_id, 'finance'));
create policy "bank_accounts insert" on bank_accounts for insert with check (has_section_access(client_id, 'finance', true));
create policy "bank_accounts update" on bank_accounts for update using (has_section_access(client_id, 'finance', true)) with check (has_section_access(client_id, 'finance', true));
create policy "bank_accounts delete" on bank_accounts for delete using (has_section_access(client_id, 'finance', true));

drop policy if exists "bank_transactions select" on bank_transactions;
drop policy if exists "bank_transactions insert" on bank_transactions;
drop policy if exists "bank_transactions update" on bank_transactions;
drop policy if exists "bank_transactions delete" on bank_transactions;
create policy "bank_transactions select" on bank_transactions for select using (has_section_access(client_id, 'finance'));
create policy "bank_transactions insert" on bank_transactions for insert with check (has_section_access(client_id, 'finance', true));
create policy "bank_transactions update" on bank_transactions for update using (has_section_access(client_id, 'finance', true)) with check (has_section_access(client_id, 'finance', true));
create policy "bank_transactions delete" on bank_transactions for delete using (has_section_access(client_id, 'finance', true));

-- ── Show money fields + Offer↔Show link ─────────────────────────────────
alter table shows
  add column guarantee numeric,
  add column deposit numeric,
  add column currency text,
  add column tour_offer_id text references tour_offers(id) on delete set null;

alter table tour_offers
  add column show_id text references shows(id) on delete set null;

create index if not exists shows_tour_offer_id_idx on shows(tour_offer_id);
create index if not exists tour_offers_show_id_idx on tour_offers(show_id);
