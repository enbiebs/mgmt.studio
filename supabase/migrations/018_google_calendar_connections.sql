-- Real two-way Google Calendar sync, Stage 1 (connect/disconnect + push).
-- Mirrors the bank_connections precedent: the credential-holding table
-- gets RLS enabled with zero policies, so only server-side code using
-- the service-role client can ever read or write it.

create table if not exists google_calendar_connections (
  id                text primary key,
  client_id         text not null references clients(id) on delete cascade,
  workspace_id      uuid not null references workspaces(id) on delete cascade,
  google_calendar_id text not null,
  access_token      text not null,
  refresh_token     text not null,
  token_expiry      timestamptz,
  time_zone         text not null default 'UTC',
  sync_token        text,
  last_synced_at    timestamptz,
  created_at        timestamptz not null default now()
);

alter table google_calendar_connections enable row level security;
-- Deliberately no policies: default-deny for anon/authenticated, same
-- posture as bank_connections. Only the service role can touch this.

-- Maps a Mgmt Studio record to the Google Calendar event it was pushed
-- to (or, in a later stage, that it was pulled in from), so future
-- writes update the existing event instead of creating duplicates.
create table if not exists google_calendar_event_links (
  id              text primary key,
  connection_id   text not null references google_calendar_connections(id) on delete cascade,
  client_id       text not null references clients(id) on delete cascade,
  google_event_id text not null,
  record_type     text not null check (record_type in ('show', 'post', 'project')),
  record_id       text not null,
  updated_at      timestamptz not null default now(),
  unique (connection_id, google_event_id),
  unique (record_type, record_id)
);

alter table google_calendar_event_links enable row level security;
-- Same posture: no client-facing policies. Nothing in the UI reads this
-- table yet — it's internal bookkeeping for the sync engine.

create index if not exists google_calendar_connections_client_id_idx on google_calendar_connections(client_id);
create index if not exists google_calendar_event_links_connection_id_idx on google_calendar_event_links(connection_id);
create index if not exists google_calendar_event_links_client_id_idx on google_calendar_event_links(client_id);

-- shows/posts/projects have no updated_at today — needed so a later
-- sync stage can tell which side (Mgmt Studio vs. Google) changed more
-- recently when the same record was edited on both.
alter table shows add column if not exists updated_at timestamptz not null default now();
alter table posts add column if not exists updated_at timestamptz not null default now();
alter table projects add column if not exists updated_at timestamptz not null default now();
