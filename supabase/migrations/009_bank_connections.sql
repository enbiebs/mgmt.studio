-- ─────────────────────────────────────────────────────────────
-- Studio · Bank connections (Plaid)
--
-- bank_connections holds the Plaid access_token — the one credential
-- that can pull real transaction/balance data for a linked bank. It
-- gets RLS enabled but is given NO policies, so it is unreachable by
-- the browser (anon/authenticated) no matter what — only server-side
-- code using the service role key (Next.js route handlers) can read
-- or write it. This is intentional: nothing about how a bank was
-- connected should ever be fetchable from client-side code.
--
-- bank_accounts and bank_transactions hold the data actually shown in
-- the UI (balances, transaction lists) and are scoped to the signed-in
-- user's own clients the same way every other table in this app is,
-- via client_ids_for_user().
-- ─────────────────────────────────────────────────────────────

create table if not exists bank_connections (
  id              text primary key,
  client_id       text not null references clients(id) on delete cascade,
  workspace_id    uuid not null references workspaces(id) on delete cascade,
  plaid_item_id   text not null unique,
  access_token    text not null,
  institution_name text,
  created_at      timestamptz not null default now()
);

alter table bank_connections enable row level security;
-- Deliberately no policies: default-deny for anon/authenticated.
-- Only the service role (server-side only) can read/write this table.

create table if not exists bank_accounts (
  id                text primary key,
  connection_id     text not null references bank_connections(id) on delete cascade,
  client_id         text not null references clients(id) on delete cascade,
  plaid_account_id  text not null unique,
  name              text not null,
  official_name     text,
  mask              text,
  type              text,
  subtype           text,
  currency          text default 'USD',
  current_balance   numeric,
  available_balance numeric,
  updated_at        timestamptz not null default now()
);

create index if not exists idx_bank_accounts_client_id on bank_accounts(client_id);
create index if not exists idx_bank_accounts_connection_id on bank_accounts(connection_id);

alter table bank_accounts enable row level security;
create policy "bank_accounts scoped to workspace" on bank_accounts for all
  using (client_id in (select client_ids_for_user()))
  with check (client_id in (select client_ids_for_user()));

create table if not exists bank_transactions (
  id                    text primary key,
  account_id            text not null references bank_accounts(id) on delete cascade,
  client_id             text not null references clients(id) on delete cascade,
  plaid_transaction_id  text not null unique,
  date                  date not null,
  name                  text not null,
  merchant_name         text,
  amount                numeric not null,
  currency              text default 'USD',
  category              text,
  pending               boolean not null default false,
  created_at            timestamptz not null default now()
);

create index if not exists idx_bank_transactions_client_id on bank_transactions(client_id);
create index if not exists idx_bank_transactions_account_id on bank_transactions(account_id);
create index if not exists idx_bank_transactions_date on bank_transactions(date);

alter table bank_transactions enable row level security;
create policy "bank_transactions scoped to workspace" on bank_transactions for all
  using (client_id in (select client_ids_for_user()))
  with check (client_id in (select client_ids_for_user()));
