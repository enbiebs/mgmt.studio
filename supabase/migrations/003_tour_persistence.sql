-- ─────────────────────────────────────────────────────────────
-- Studio · Tour Persistence
--
-- Backs the four Tour areas that were localStorage-only:
--   Advance (ShowAdvance + AdvanceContact), Crew, Guest List, Travel.
--
-- Mirrors src/types/index.ts:
--   ShowAdvance     → show_advances (+ advance_contacts)
--   CrewMember      → crew_members
--   GuestListEntry  → guest_list_entries
--   TravelItem      → travel_items (single table, `kind` discriminator)
-- ─────────────────────────────────────────────────────────────

-- ── Crew ──────────────────────────────────────────────────────
-- Crew is roster-level, not per-show: CrewMember has no showId.
create table if not exists crew_members (
  id               text primary key,
  client_id        text not null references clients(id) on delete cascade,
  name             text not null,
  role             text not null default 'other'
                     check (role in ('tour-manager','production-manager','foh','monitors',
                                     'lighting','video','backline','merch','security',
                                     'driver','artist','other')),
  phone            text,
  email            text,
  passport         text,   -- expiry only; never store a full passport number
  emergency_name   text,
  emergency_phone  text,
  notes            text
);

create index if not exists crew_members_client_idx on crew_members (client_id);

-- ── Show Advances ─────────────────────────────────────────────
-- The four advance sections are flat bags of optional strings, so they
-- are stored as jsonb — same approach 001 takes for clients.analytics /
-- clients.fandom. Contacts are a keyed array, so they get their own table.
-- unique(show_id) matches AdvanceView.tsx, which resolves an advance with
-- advances.find(a => a.showId === showId) — one advance per show.
create table if not exists show_advances (
  id                text primary key,
  show_id           text not null unique references shows(id) on delete cascade,
  status            text not null default 'draft'
                      check (status in ('draft','sent','in-progress','complete')),
  sent_at           date,
  completed_at      date,
  schedule          jsonb not null default '{}',
  production        jsonb not null default '{}',
  hospitality       jsonb not null default '{}',
  logistics         jsonb not null default '{}',
  wifi              text,
  wifi_password     text,
  weather_notes     text,
  guest_list_cap    text,
  guest_list_notes  text,
  general_notes     text
);

create table if not exists advance_contacts (
  id          text primary key,
  advance_id  text not null references show_advances(id) on delete cascade,
  role        text not null,
  name        text not null,
  phone       text,
  email       text,
  notes       text
);

create index if not exists advance_contacts_advance_idx on advance_contacts (advance_id);

-- ── Guest List ────────────────────────────────────────────────
create table if not exists guest_list_entries (
  id          text primary key,
  show_id     text not null references shows(id) on delete cascade,
  name        text not null,
  qty         integer not null default 1 check (qty >= 0),
  category    text not null default 'artist'
                check (category in ('artist','vip','label','management',
                                    'media','family','promo','sponsor')),
  checked_in  boolean not null default false,
  credential  text,
  notes       text
);

create index if not exists guest_list_entries_show_idx on guest_list_entries (show_id);

-- ── Travel ────────────────────────────────────────────────────
-- TravelItem is a discriminated union on `kind`; one table with nullable
-- per-kind columns keeps it a single ordered list, which is how the app
-- reads it. Datetime fields stay `text`: the app stores local venue times
-- as "2026-08-22T07:30" with no offset, and timestamptz would shift them.
create table if not exists travel_items (
  id                 text primary key,
  show_id            text not null references shows(id) on delete cascade,
  kind               text not null check (kind in ('flight','hotel','ground')),
  status             text not null default 'needed'
                       check (status in ('needed','pending','booked','cancelled')),
  -- shared
  confirmation_code  text,
  cost               numeric,
  currency           text default 'USD',
  notes              text,
  -- flight
  traveler           text,
  airline            text,
  flight_number      text,
  from_loc           text,   -- "JFK" (flight) or pickup location (ground)
  from_city          text,
  to_loc             text,   -- "LHR" (flight) or dropoff location (ground)
  to_city            text,
  departure          text,
  arrival            text,
  duration           text,
  cabin              text,
  seats              text,
  -- hotel
  hotel_name         text,
  address            text,
  phone              text,
  check_in           date,
  check_out          date,
  room_count         integer,
  room_type          text,
  -- ground
  ground_type        text check (ground_type in ('rental-car','transfer','train','bus')),
  provider           text,
  pickup_time        text,
  vehicle_type       text,
  -- TravelGround.type and TravelFlight.traveler are required by their variants
  constraint travel_items_ground_type_required
    check (kind <> 'ground' or ground_type is not null),
  constraint travel_items_flight_traveler_required
    check (kind <> 'flight' or traveler is not null)
);

create index if not exists travel_items_show_idx on travel_items (show_id);

-- ── RLS ────────────────────────────────────────────────────────
alter table crew_members        enable row level security;
alter table show_advances       enable row level security;
alter table advance_contacts    enable row level security;
alter table guest_list_entries  enable row level security;
alter table travel_items        enable row level security;

create policy "crew_members scoped to workspace" on crew_members for all
  using (client_id in (select client_ids_for_user()))
  with check (client_id in (select client_ids_for_user()));

create policy "show_advances scoped to workspace" on show_advances for all
  using (show_id in (select id from shows where client_id in (select client_ids_for_user())))
  with check (show_id in (select id from shows where client_id in (select client_ids_for_user())));

create policy "advance_contacts scoped to workspace" on advance_contacts for all
  using (advance_id in (select id from show_advances
                        where show_id in (select id from shows
                                          where client_id in (select client_ids_for_user()))))
  with check (advance_id in (select id from show_advances
                             where show_id in (select id from shows
                                               where client_id in (select client_ids_for_user()))));

create policy "guest_list_entries scoped to workspace" on guest_list_entries for all
  using (show_id in (select id from shows where client_id in (select client_ids_for_user())))
  with check (show_id in (select id from shows where client_id in (select client_ids_for_user())));

create policy "travel_items scoped to workspace" on travel_items for all
  using (show_id in (select id from shows where client_id in (select client_ids_for_user())))
  with check (show_id in (select id from shows where client_id in (select client_ids_for_user())));
