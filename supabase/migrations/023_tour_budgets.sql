-- Finance Stage 4, Part 1: runs, crew rates, tour budgets, cost linking, FX.
--
-- Everything money-related here is management-side only (Finance access, never
-- the artist's own login) via is_management_side(); runs are just labels on
-- shows, so they follow plain Tour access.
--
-- A budget is stored as ONE row with its lines/commissions as JSON - it is
-- edited as a whole document (the shape mirrors Eli's example budget PDF) and
-- never queried line by line.

-- ── Runs: named groups of shows ("Europe Fall 2026") ─────────
create table if not exists runs (
  id         text primary key,
  client_id  text not null references clients(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_runs_client_id on runs(client_id);
alter table runs enable row level security;
create policy "runs select" on runs for select using (has_section_access(client_id, 'tour'));
create policy "runs insert" on runs for insert with check (has_section_access(client_id, 'tour', true));
create policy "runs update" on runs for update using (has_section_access(client_id, 'tour', true)) with check (has_section_access(client_id, 'tour', true));
create policy "runs delete" on runs for delete using (has_section_access(client_id, 'tour', true));

-- One run per show; deleting a run just un-groups its shows.
alter table shows add column if not exists run_id text references runs(id) on delete set null;
create index if not exists idx_shows_run_id on shows(run_id);

-- ── Cost linking ─────────────────────────────────────────────
-- A cost can apply to specific show(s) (split evenly), to a whole run (shared
-- evenly across its shows), or to nothing. Travel already links to shows via
-- travel_item_shows; expenses get the same join table plus a budget bucket.
alter table travel_items add column if not exists run_id text references runs(id) on delete set null;
alter table expenses add column if not exists run_id text references runs(id) on delete set null;
alter table expenses add column if not exists bucket text;
create index if not exists idx_travel_items_run_id on travel_items(run_id);
create index if not exists idx_expenses_run_id on expenses(run_id);

create table if not exists expense_shows (
  id         text primary key,
  expense_id text not null references expenses(id) on delete cascade,
  show_id    text not null references shows(id) on delete cascade,
  unique (expense_id, show_id)
);
create index if not exists idx_expense_shows_show_id on expense_shows(show_id);
alter table expense_shows enable row level security;

-- Visible exactly when its expense is (through the expense's own policy);
-- writes need Finance edit access on the expense's client.
create policy "expense_shows select" on expense_shows for select
  using (exists (select 1 from expenses e where e.id = expense_shows.expense_id));
create policy "expense_shows insert" on expense_shows for insert
  with check (has_section_access((select e.client_id from expenses e where e.id = expense_shows.expense_id), 'finance', true)
          and is_management_side((select e.client_id from expenses e where e.id = expense_shows.expense_id)));
create policy "expense_shows update" on expense_shows for update
  using (has_section_access((select e.client_id from expenses e where e.id = expense_shows.expense_id), 'finance', true)
     and is_management_side((select e.client_id from expenses e where e.id = expense_shows.expense_id)))
  with check (has_section_access((select e.client_id from expenses e where e.id = expense_shows.expense_id), 'finance', true)
          and is_management_side((select e.client_id from expenses e where e.id = expense_shows.expense_id)));
create policy "expense_shows delete" on expense_shows for delete
  using (has_section_access((select e.client_id from expenses e where e.id = expense_shows.expense_id), 'finance', true)
     and is_management_side((select e.client_id from expenses e where e.id = expense_shows.expense_id)));

-- ── Crew pay (kept out of crew_members, which every Tour viewer can read) ──
create table if not exists crew_rates (
  crew_member_id    text primary key references crew_members(id) on delete cascade,
  client_id         text not null references clients(id) on delete cascade,
  tours_with_artist boolean not null default false,        -- auto-added to every new budget
  rate_unit         text not null default 'day' check (rate_unit in ('day', 'show')),
  rate_show         numeric not null default 0,            -- per show day (or per show)
  rate_travel       numeric,                               -- per advance/travel day; null = same as show
  per_diem          numeric not null default 0,
  currency          text not null default 'USD'
);
create index if not exists idx_crew_rates_client_id on crew_rates(client_id);
alter table crew_rates enable row level security;
create policy "crew_rates select" on crew_rates for select using (has_section_access(client_id, 'finance') and is_management_side(client_id));
create policy "crew_rates insert" on crew_rates for insert with check (has_section_access(client_id, 'finance', true) and is_management_side(client_id));
create policy "crew_rates update" on crew_rates for update using (has_section_access(client_id, 'finance', true) and is_management_side(client_id)) with check (has_section_access(client_id, 'finance', true) and is_management_side(client_id));
create policy "crew_rates delete" on crew_rates for delete using (has_section_access(client_id, 'finance', true) and is_management_side(client_id));

-- ── Per-artist money settings: home currency + default commissions ──
-- Separate from clients so commission percentages aren't readable by every
-- workspace member (the roster row is). A missing row means the defaults below.
create table if not exists client_finance_settings (
  client_id           text primary key references clients(id) on delete cascade,
  home_currency       text not null default 'USD',
  default_commissions jsonb not null default '[{"label":"Agent","pct":10,"base":"gross"},{"label":"Management","pct":15,"base":"after_production"},{"label":"Biz mgmt","pct":4,"base":"after_sound_lights"}]'::jsonb
);
alter table client_finance_settings enable row level security;
create policy "client_finance_settings select" on client_finance_settings for select using (has_section_access(client_id, 'finance') and is_management_side(client_id));
create policy "client_finance_settings insert" on client_finance_settings for insert with check (has_section_access(client_id, 'finance', true) and is_management_side(client_id));
create policy "client_finance_settings update" on client_finance_settings for update using (has_section_access(client_id, 'finance', true) and is_management_side(client_id)) with check (has_section_access(client_id, 'finance', true) and is_management_side(client_id));
create policy "client_finance_settings delete" on client_finance_settings for delete using (has_section_access(client_id, 'finance', true) and is_management_side(client_id));

-- ── Budgets ──────────────────────────────────────────────────
create table if not exists budgets (
  id          text primary key,
  client_id   text not null references clients(id) on delete cascade,
  offer_id    text references tour_offers(id) on delete cascade,   -- created when the offer comes in
  show_id     text references shows(id) on delete set null,        -- set when the offer is confirmed
  run_id      text references runs(id) on delete set null,         -- a run-level budget (shared costs)
  name        text not null,
  currency    text not null default 'USD',
  status      text not null default 'draft' check (status in ('draft', 'locked')),
  version     integer not null default 1,
  lines       jsonb not null default '[]'::jsonb,
  commissions jsonb not null default '[]'::jsonb,
  notes       text,
  original    jsonb,                                               -- snapshot taken when the offer is confirmed
  locked_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_budgets_client_id on budgets(client_id);
create index if not exists idx_budgets_offer_id on budgets(offer_id);
create index if not exists idx_budgets_show_id on budgets(show_id);
create index if not exists idx_budgets_run_id on budgets(run_id);
alter table budgets enable row level security;
create policy "budgets select" on budgets for select using (has_section_access(client_id, 'finance') and is_management_side(client_id));
create policy "budgets insert" on budgets for insert with check (has_section_access(client_id, 'finance', true) and is_management_side(client_id));
create policy "budgets update" on budgets for update using (has_section_access(client_id, 'finance', true) and is_management_side(client_id)) with check (has_section_access(client_id, 'finance', true) and is_management_side(client_id));
create policy "budgets delete" on budgets for delete using (has_section_access(client_id, 'finance', true) and is_management_side(client_id));

-- ── Exchange rates (written only by our server, via the service role) ──
-- rate_to_usd = how many USD one unit of the currency is worth.
create table if not exists fx_rates (
  currency    text primary key,
  rate_to_usd numeric not null,
  source      text not null,
  fetched_at  timestamptz not null default now()
);
alter table fx_rates enable row level security;
create policy "fx_rates select" on fx_rates for select to authenticated using (true);
