-- ─────────────────────────────────────────────────────────────
-- Studio · Release Details
--
-- Adds the columns/tables needed by the Music hub's Label Copy,
-- Checklist, Status/Stakeholders, and auto-generated content
-- calendar features. Previously these only persisted to
-- localStorage — this migration is what makes them durable.
--
-- Run this in your Supabase project after 001_initial_schema.sql:
--   Dashboard → SQL Editor → New Query → paste & run
-- ─────────────────────────────────────────────────────────────

-- ── Tracks: label copy + planning fields ────────────────────
alter table tracks
  add column if not exists isrc       text,
  add column if not exists writers    text,
  add column if not exists producers  text,
  add column if not exists publisher  text,
  add column if not exists pro        text,
  add column if not exists explicit   boolean not null default false,
  add column if not exists duration   text,
  add column if not exists language   text,
  add column if not exists priority   text
                             check (priority in ('lead-single', 'single', 'album-cut')),
  add column if not exists owner      text,
  add column if not exists due_date   date;

-- ── Albums: release-level label copy ─────────────────────────
alter table albums
  add column if not exists upc            text,
  add column if not exists label          text,
  add column if not exists primary_artist text,
  add column if not exists genre          text,
  add column if not exists copyright_p    text,
  add column if not exists copyright_c    text;

-- ── Checklist items (one row per phase item, per album) ──────
create table if not exists checklist_items (
  id        uuid primary key default gen_random_uuid(),
  album_id  text not null references albums(id) on delete cascade,
  key       text not null,
  label     text not null,
  phase     text not null,
  done      boolean not null default false,
  note      text,
  unique (album_id, key)
);

-- ── Release stakeholders ──────────────────────────────────────
create table if not exists release_stakeholders (
  id        text primary key,
  album_id  text not null references albums(id) on delete cascade,
  name      text not null,
  role      text not null,
  org       text,
  email     text,
  phone     text,
  notes     text
);

-- ── Posts: link to the release that generated them ────────────
alter table posts
  add column if not exists release_id text references albums(id) on delete set null,
  add column if not exists auto       boolean not null default false;

-- Widen the post-type check to cover the rollout template's platforms
alter table posts drop constraint if exists posts_type_check;
alter table posts add constraint posts_type_check
  check (type in ('reel', 'story', 'post', 'video', 'tiktok', 'shorts', 'spotify-clip', 'tweet', 'laylo'));

-- ── RLS ────────────────────────────────────────────────────────
alter table checklist_items      enable row level security;
alter table release_stakeholders enable row level security;

create policy "checklist_items scoped to workspace" on checklist_items for all
  using (album_id in (select id from albums where client_id in (select client_ids_for_user())))
  with check (album_id in (select id from albums where client_id in (select client_ids_for_user())));

create policy "release_stakeholders scoped to workspace" on release_stakeholders for all
  using (album_id in (select id from albums where client_id in (select client_ids_for_user())))
  with check (album_id in (select id from albums where client_id in (select client_ids_for_user())));
