-- ─────────────────────────────────────────────────────────────
-- Studio · Link bank transactions to catalog works and invoices
--
-- Manual linking only (not automatic matching) — a bank transaction's
-- description/amount alone isn't reliable enough to safely auto-assign
-- to a specific song's income or a specific invoice, so a person picks
-- the match. Once linked, the catalog work and invoice can show real,
-- confirmed bank activity instead of guessed numbers.
-- ─────────────────────────────────────────────────────────────

alter table bank_transactions
  add column if not exists catalog_work_id text references catalog_works(id) on delete set null;

alter table bank_transactions
  add column if not exists invoice_id text references invoices(id) on delete set null;

create index if not exists idx_bank_transactions_catalog_work_id on bank_transactions(catalog_work_id);
create index if not exists idx_bank_transactions_invoice_id on bank_transactions(invoice_id);
