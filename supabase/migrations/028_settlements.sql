-- Settlements (Finance Stage 4, Part 3).
--
-- After a show the promoter sends a settlement: tickets sold, the promoter's own
-- costs, the deal math, and what is due to the artist. The manager uploads it, the app
-- reads it, the manager confirms what it found, and it is saved here. It then
-- replaces the budget's income placeholder with the real number (the settled P&L).
--
-- Management side only (Finance access, never the artist's login) - the same rule as
-- budgets. One settlement can cover several shows (a two-night run on one statement);
-- settlement_shows links them. The exchange rates in effect when it was confirmed are
-- frozen into `fx`, so settled figures never drift afterwards.
--
-- The promoter's own cost lines are kept as read (jsonb): they are the promoter's costs,
-- not the artist's, and exist so the statement can be opened up and checked.

create table if not exists settlements (
  id            text primary key,
  client_id     text not null references clients(id) on delete cascade,
  file_path     text,                       -- the uploaded statement, in the private 'settlements' bucket
  file_name     text,
  event_name    text,
  venue         text,
  promoter      text,
  prepared_on   date,
  prepared_by   text,
  currency      text not null default 'USD' check (currency in ('USD', 'GBP', 'EUR')),
  fx            jsonb not null,             -- { USD: 1, EUR: n, GBP: n, at: iso } as of confirmation
  attendance    jsonb,
  summary       jsonb,                      -- gross, net gross, total expenses, net show receipts ...
  deal          jsonb,                      -- guarantee vs percentage
  box_office    jsonb,                      -- ticket tiers
  expenses      jsonb,                      -- the promoter's cost lines (budget vs actual)
  payout        jsonb not null,             -- the artist's money lines
  total_due     numeric not null,
  payments      jsonb,
  balance_due   numeric,
  notes         text,
  confirmed_at  timestamptz not null default now()
);
create index if not exists settlements_client_idx on settlements(client_id);

create table if not exists settlement_shows (
  settlement_id text not null references settlements(id) on delete cascade,
  show_id       text not null references shows(id) on delete cascade,
  primary key (settlement_id, show_id)
);
create index if not exists settlement_shows_show_idx on settlement_shows(show_id);

alter table settlements enable row level security;
alter table settlement_shows enable row level security;

create policy "settlements select" on settlements for select
  using (has_section_access(client_id, 'finance') and is_management_side(client_id));
create policy "settlements insert" on settlements for insert
  with check (has_section_access(client_id, 'finance', true) and is_management_side(client_id));
create policy "settlements update" on settlements for update
  using (has_section_access(client_id, 'finance', true) and is_management_side(client_id))
  with check (has_section_access(client_id, 'finance', true) and is_management_side(client_id));
create policy "settlements delete" on settlements for delete
  using (has_section_access(client_id, 'finance', true) and is_management_side(client_id));

-- The links follow their settlement: if you can see / edit it, you can see / edit its links.
create policy "settlement_shows select" on settlement_shows for select
  using (exists (select 1 from settlements s where s.id = settlement_id));
create policy "settlement_shows insert" on settlement_shows for insert
  with check (exists (select 1 from settlements s where s.id = settlement_id
    and has_section_access(s.client_id, 'finance', true) and is_management_side(s.client_id)));
create policy "settlement_shows delete" on settlement_shows for delete
  using (exists (select 1 from settlements s where s.id = settlement_id
    and has_section_access(s.client_id, 'finance', true) and is_management_side(s.client_id)));

-- Private bucket for the statements (PDF or a photo/scan). No storage policies on
-- purpose: default-deny for anon/authenticated, so files are reachable only through
-- our server routes, which check access first - same posture as the bills bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('settlements', 'settlements', false, 20971520, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
