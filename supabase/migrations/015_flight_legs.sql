-- ─────────────────────────────────────────────────────────────
-- Studio · Multi-leg flights
--
-- travel_items stored exactly one from/to/departure/arrival/airline per
-- flight booking — no way to represent a connection. This adds a child
-- table (one row per leg, ordered by leg_order) and backfills one leg
-- per existing flight from the old flat columns, so nothing already
-- saved is lost. Those flat flight columns on travel_items are left in
-- place (unused going forward, not dropped) as cheap rollback insurance.
-- ─────────────────────────────────────────────────────────────

create table if not exists flight_legs (
  id             text primary key,
  travel_item_id text not null references travel_items(id) on delete cascade,
  leg_order      integer not null default 0,
  airline        text,
  flight_number  text,
  from_loc       text,
  from_city      text,
  to_loc         text,
  to_city        text,
  departure      text,
  arrival        text,
  duration       text,
  cabin          text
);

create index if not exists idx_flight_legs_travel_item_id on flight_legs(travel_item_id);

-- Backfill: one leg per existing flight row, built from its own flat
-- columns. Uses the travel_items row's own id suffixed with "-leg1" so
-- this is safe to re-run (ON CONFLICT DO NOTHING) rather than assuming
-- it has never run.
insert into flight_legs (id, travel_item_id, leg_order, airline, flight_number, from_loc, from_city, to_loc, to_city, departure, arrival, duration, cabin)
select id || '-leg1', id, 0, airline, flight_number, from_loc, from_city, to_loc, to_city, departure, arrival, duration, cabin
from travel_items
where kind = 'flight'
on conflict (id) do nothing;

alter table flight_legs enable row level security;

create policy "flight_legs select" on flight_legs for select using (
  has_section_access((select s.client_id from shows s join travel_items t on t.show_id = s.id where t.id = flight_legs.travel_item_id), 'tour')
);
create policy "flight_legs insert" on flight_legs for insert with check (
  has_section_access((select s.client_id from shows s join travel_items t on t.show_id = s.id where t.id = flight_legs.travel_item_id), 'tour', true)
);
create policy "flight_legs update" on flight_legs for update using (
  has_section_access((select s.client_id from shows s join travel_items t on t.show_id = s.id where t.id = flight_legs.travel_item_id), 'tour', true)
) with check (
  has_section_access((select s.client_id from shows s join travel_items t on t.show_id = s.id where t.id = flight_legs.travel_item_id), 'tour', true)
);
create policy "flight_legs delete" on flight_legs for delete using (
  has_section_access((select s.client_id from shows s join travel_items t on t.show_id = s.id where t.id = flight_legs.travel_item_id), 'tour', true)
);
