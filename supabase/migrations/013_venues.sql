-- ─────────────────────────────────────────────────────────────
-- Studio · Reusable venue database
--
-- Advancing a show today means retyping stage/power/loading-dock/
-- wifi/contacts from scratch even for a venue played dozens of times
-- before. This adds a `venues` table (one per client, matching the
-- existing `people` per-client directory pattern) that the Advance
-- page can save to and load from by venue name.
--
-- Contacts are stored as jsonb here (small, always read/written as a
-- whole array together) rather than a child table like advance_contacts —
-- there's no need to query into them individually.
-- ─────────────────────────────────────────────────────────────

create table if not exists venues (
  id                     text primary key,
  client_id              text not null references clients(id) on delete cascade,
  name                   text not null,
  city                   text not null,
  address                text,
  wifi                   text,
  wifi_password          text,
  stage_width            text,
  stage_depth            text,
  roof_height            text,
  foh_position           text,
  mon_position           text,
  power_supply           text,
  riser_count            text,
  merchandise_location   text,
  dressing_rooms         text,
  dressing_room_notes    text,
  catering_company       text,
  parking_instructions   text,
  bus_parking            text,
  loading_dock_address   text,
  loading_dock_notes     text,
  nearest_airport        text,
  distance_to_airport    text,
  notes                  text,
  contacts               jsonb not null default '[]'::jsonb,
  created_at             timestamptz not null default now()
);

create index if not exists idx_venues_client_id on venues(client_id);

alter table venues enable row level security;

-- Matches the current (post-011_access_grants) pattern for shows/people:
-- select needs read access to 'tour', writes need edit access.
create policy "venues select" on venues for select using (has_section_access(client_id, 'tour'));
create policy "venues insert" on venues for insert with check (has_section_access(client_id, 'tour', true));
create policy "venues update" on venues for update using (has_section_access(client_id, 'tour', true)) with check (has_section_access(client_id, 'tour', true));
create policy "venues delete" on venues for delete using (has_section_access(client_id, 'tour', true));
