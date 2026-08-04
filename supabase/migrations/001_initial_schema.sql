-- ─────────────────────────────────────────────────────────────
-- Studio · Initial Schema
--
-- Run this in your Supabase project:
--   Dashboard → SQL Editor → New Query → paste & run
--
-- Tables created:
--   workspaces, workspace_members
--   clients, albums, tracks
--   shows, posts
--   royalty_streams, deposits, catalog_works
--   projects, artist_todos
--   tour_offers, contracts
--   invoices, invoice_line_items, expenses, pl_months
-- ─────────────────────────────────────────────────────────────

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ── Workspaces ────────────────────────────────────────────────
-- Each workspace = one management company
create table if not exists workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- ── Workspace Members ─────────────────────────────────────────
-- Users can belong to a workspace with a specific role
create table if not exists workspace_members (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          text not null default 'manager'
                  check (role in ('manager', 'artist', 'agent', 'lawyer')),
  created_at    timestamptz not null default now(),
  unique (workspace_id, user_id)
);

-- ── Clients (Artists on roster) ───────────────────────────────
create table if not exists clients (
  id            text primary key,
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  name          text not null,
  genre         text not null default '',
  color         text not null default '#4c8df6',
  -- Analytics and fandom stored as JSONB (will come from external APIs later)
  analytics     jsonb not null default '{}',
  fandom        jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

-- ── Albums & Tracks ───────────────────────────────────────────
create table if not exists albums (
  id            text primary key,
  client_id     text not null references clients(id) on delete cascade,
  title         text not null,
  release_date  date
);

create table if not exists tracks (
  id        text primary key,
  album_id  text not null references albums(id) on delete cascade,
  num       integer not null,
  title     text not null,
  stage     text not null default 'track'
              check (stage in ('track', 'mix', 'master', 'done')),
  version   integer not null default 1,
  touched   text not null default 'now',
  notes     text
);

-- ── Tour & Shows ──────────────────────────────────────────────
create table if not exists shows (
  id         text primary key,
  client_id  text not null references clients(id) on delete cascade,
  date       date not null,
  city       text not null,
  venue      text not null,
  time       text not null,
  status     text not null default 'hold'
               check (status in ('confirmed', 'hold', 'cancelled')),
  notes      text
);

-- ── Content / Posts ───────────────────────────────────────────
create table if not exists posts (
  id         text primary key,
  client_id  text not null references clients(id) on delete cascade,
  date       date not null,
  title      text not null,
  time       text not null,
  type       text not null check (type in ('reel', 'story', 'post', 'video'))
);

-- ── Business: Royalties ───────────────────────────────────────
create table if not exists royalty_streams (
  id         text primary key,
  client_id  text not null references clients(id) on delete cascade,
  name       text not null,
  type       text not null,
  amount     numeric not null default 0,
  currency   text not null default 'USD',
  period     text not null
);

-- ── Business: Banking / Deposits ─────────────────────────────
create table if not exists deposits (
  id         text primary key,
  client_id  text not null references clients(id) on delete cascade,
  name       text not null,
  date       date not null,
  amount     numeric not null,
  currency   text not null default 'USD',
  mgmt       numeric not null default 0,
  lawyer     numeric not null default 0,
  taxes      numeric not null default 0,
  done       boolean not null default false
);

-- ── Business: Catalog / Works ─────────────────────────────────
create table if not exists catalog_works (
  id         text primary key,
  client_id  text not null references clients(id) on delete cascade,
  title      text not null,
  ipi        text,
  writers    text not null,
  amount     numeric not null default 0,
  currency   text not null default 'USD',
  bmi        text not null default 'q',
  mlc        text not null default 'q',
  sx         text not null default 'q',
  ppl        text not null default 'q'
);

-- ── Projects ──────────────────────────────────────────────────
create table if not exists projects (
  id           text primary key,
  client_id    text not null references clients(id) on delete cascade,
  title        text not null,
  type         text not null,
  status       text not null default 'submitted'
                 check (status in ('submitted', 'in-progress', 'review', 'done')),
  assignee     text,
  due_date     date,
  notes        text,
  created_at   date not null,
  from_artist  boolean not null default false
);

-- ── Artist Todos ──────────────────────────────────────────────
create table if not exists artist_todos (
  id          text primary key,
  client_id   text not null references clients(id) on delete cascade,
  title       text not null,
  done        boolean not null default false,
  due_date    date,
  created_at  date not null
);

-- ── Agent: Tour Offers ────────────────────────────────────────
create table if not exists tour_offers (
  id          text primary key,
  client_id   text not null references clients(id) on delete cascade,
  venue       text not null,
  city        text not null,
  country     text not null,
  date        date not null,
  promoter    text not null,
  guarantee   numeric not null default 0,
  door        numeric,
  buyout      numeric,
  status      text not null default 'inquiry'
                check (status in ('inquiry', 'hold', 'confirmed', 'cancelled', 'settled')),
  notes       text,
  settled_at  date,
  net_payout  numeric
);

-- ── Legal: Contracts ──────────────────────────────────────────
create table if not exists contracts (
  id            text primary key,
  client_id     text not null references clients(id) on delete cascade,
  title         text not null,
  type          text not null,
  status        text not null default 'draft'
                  check (status in ('draft', 'review', 'negotiation', 'signed', 'expired', 'terminated')),
  counterparty  text not null,
  value         numeric,
  currency      text default 'USD',
  signed_date   date,
  expiry_date   date,
  notes         text,
  created_at    date not null,
  flagged       boolean not null default false
);

-- ── Finance: Invoices ─────────────────────────────────────────
create table if not exists invoices (
  id           text primary key,
  client_id    text not null references clients(id) on delete cascade,
  number       text not null,
  to_name      text not null,  -- "to" is a reserved word in SQL
  to_email     text,
  category     text not null,
  status       text not null default 'draft'
                 check (status in ('draft', 'sent', 'paid', 'overdue', 'void')),
  issued_date  date not null,
  due_date     date not null,
  paid_date    date,
  currency     text not null default 'USD',
  notes        text
);

create table if not exists invoice_line_items (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   text not null references invoices(id) on delete cascade,
  description  text not null,
  quantity     numeric not null default 1,
  rate         numeric not null default 0,
  sort_order   integer not null default 0
);

-- ── Finance: Expenses ─────────────────────────────────────────
create table if not exists expenses (
  id           text primary key,
  client_id    text not null references clients(id) on delete cascade,
  description  text not null,
  vendor       text not null,
  amount       numeric not null,
  currency     text not null default 'USD',
  category     text not null,
  date         date not null,
  paid         boolean not null default false
);

-- ── Finance: P&L Months ───────────────────────────────────────
create table if not exists pl_months (
  id              uuid primary key default gen_random_uuid(),
  client_id       text not null references clients(id) on delete cascade,
  month           text not null,  -- "2026-01"
  -- Revenue
  rev_touring     numeric not null default 0,
  rev_streaming   numeric not null default 0,
  rev_sync        numeric not null default 0,
  rev_brand       numeric not null default 0,
  rev_merch       numeric not null default 0,
  rev_other       numeric not null default 0,
  -- Expenses
  exp_travel      numeric not null default 0,
  exp_recording   numeric not null default 0,
  exp_marketing   numeric not null default 0,
  exp_legal       numeric not null default 0,
  exp_management  numeric not null default 0,
  exp_equipment   numeric not null default 0,
  exp_meals       numeric not null default 0,
  exp_other       numeric not null default 0,
  unique (client_id, month)
);

-- ─────────────────────────────────────────────────────────────
-- Row Level Security (RLS)
-- Users can only see/edit data in their own workspace
-- ─────────────────────────────────────────────────────────────

alter table workspaces       enable row level security;
alter table workspace_members enable row level security;
alter table clients          enable row level security;
alter table albums           enable row level security;
alter table tracks           enable row level security;
alter table shows            enable row level security;
alter table posts            enable row level security;
alter table royalty_streams  enable row level security;
alter table deposits         enable row level security;
alter table catalog_works    enable row level security;
alter table projects         enable row level security;
alter table artist_todos     enable row level security;
alter table tour_offers      enable row level security;
alter table contracts        enable row level security;
alter table invoices         enable row level security;
alter table invoice_line_items enable row level security;
alter table expenses         enable row level security;
alter table pl_months        enable row level security;

-- Helper function: get workspace IDs for the current user
create or replace function my_workspace_ids()
returns setof uuid language sql security definer stable as $$
  select workspace_id from workspace_members where user_id = auth.uid()
$$;

-- Workspaces: members can see their own
create policy "workspace members can view"
  on workspaces for select
  using (id in (select my_workspace_ids()));

-- Workspace members: can view members of their workspace
create policy "members can view workspace members"
  on workspace_members for select
  using (workspace_id in (select my_workspace_ids()));

-- Clients: scoped to workspace
create policy "clients: workspace members can select"
  on clients for select
  using (workspace_id in (select my_workspace_ids()));

create policy "clients: workspace members can insert"
  on clients for insert
  with check (workspace_id in (select my_workspace_ids()));

create policy "clients: workspace members can update"
  on clients for update
  using (workspace_id in (select my_workspace_ids()));

create policy "clients: workspace members can delete"
  on clients for delete
  using (workspace_id in (select my_workspace_ids()));

-- Macro to generate policies for all client-scoped tables
-- (tables that have a client_id foreign key)
create or replace function client_ids_for_user()
returns setof text language sql security definer stable as $$
  select id from clients where workspace_id in (select my_workspace_ids())
$$;

-- Albums
create policy "albums scoped to workspace" on albums for all
  using (client_id in (select client_ids_for_user()))
  with check (client_id in (select client_ids_for_user()));

-- Tracks
create policy "tracks scoped to workspace" on tracks for all
  using (album_id in (select id from albums where client_id in (select client_ids_for_user())))
  with check (album_id in (select id from albums where client_id in (select client_ids_for_user())));

-- Shows
create policy "shows scoped to workspace" on shows for all
  using (client_id in (select client_ids_for_user()))
  with check (client_id in (select client_ids_for_user()));

-- Posts
create policy "posts scoped to workspace" on posts for all
  using (client_id in (select client_ids_for_user()))
  with check (client_id in (select client_ids_for_user()));

-- Royalty Streams
create policy "royalty_streams scoped to workspace" on royalty_streams for all
  using (client_id in (select client_ids_for_user()))
  with check (client_id in (select client_ids_for_user()));

-- Deposits
create policy "deposits scoped to workspace" on deposits for all
  using (client_id in (select client_ids_for_user()))
  with check (client_id in (select client_ids_for_user()));

-- Catalog Works
create policy "catalog_works scoped to workspace" on catalog_works for all
  using (client_id in (select client_ids_for_user()))
  with check (client_id in (select client_ids_for_user()));

-- Projects
create policy "projects scoped to workspace" on projects for all
  using (client_id in (select client_ids_for_user()))
  with check (client_id in (select client_ids_for_user()));

-- Artist Todos
create policy "artist_todos scoped to workspace" on artist_todos for all
  using (client_id in (select client_ids_for_user()))
  with check (client_id in (select client_ids_for_user()));

-- Tour Offers
create policy "tour_offers scoped to workspace" on tour_offers for all
  using (client_id in (select client_ids_for_user()))
  with check (client_id in (select client_ids_for_user()));

-- Contracts
create policy "contracts scoped to workspace" on contracts for all
  using (client_id in (select client_ids_for_user()))
  with check (client_id in (select client_ids_for_user()));

-- Invoices
create policy "invoices scoped to workspace" on invoices for all
  using (client_id in (select client_ids_for_user()))
  with check (client_id in (select client_ids_for_user()));

-- Invoice Line Items
create policy "invoice_line_items scoped to workspace" on invoice_line_items for all
  using (invoice_id in (select id from invoices where client_id in (select client_ids_for_user())))
  with check (invoice_id in (select id from invoices where client_id in (select client_ids_for_user())));

-- Expenses
create policy "expenses scoped to workspace" on expenses for all
  using (client_id in (select client_ids_for_user()))
  with check (client_id in (select client_ids_for_user()));

-- PL Months
create policy "pl_months scoped to workspace" on pl_months for all
  using (client_id in (select client_ids_for_user()))
  with check (client_id in (select client_ids_for_user()));

-- ─────────────────────────────────────────────────────────────
-- Auto-create workspace on first signup
-- ─────────────────────────────────────────────────────────────
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  new_workspace_id uuid;
begin
  -- Create a workspace named after the user's email
  insert into workspaces (name)
  values (coalesce(new.raw_user_meta_data->>'workspace_name', split_part(new.email, '@', 1)))
  returning id into new_workspace_id;

  -- Add the user as manager of that workspace
  insert into workspace_members (workspace_id, user_id, role)
  values (new_workspace_id, new.id, 'manager');

  return new;
end;
$$;

-- Trigger fires after each new user signup
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
