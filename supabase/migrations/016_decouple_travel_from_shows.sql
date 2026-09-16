-- ─────────────────────────────────────────────────────────────
-- Studio · Decouple Travel from requiring a Show
--
-- travel_items required a single show_id — no flight/hotel/ground
-- transport could exist without one, so a promo trip or a day off had
-- nowhere to go. This gives travel_items its own client_id (mirroring
-- crew_members, which already works this way) and moves the show
-- relationship into a real many-to-many join table, since one booking
-- can legitimately cover several shows (e.g. one flight for a festival
-- weekend). The old show_id column is kept, nullable and unused going
-- forward, as rollback insurance — same precedent as migration 015.
-- ─────────────────────────────────────────────────────────────

alter table travel_items add column if not exists client_id text references clients(id);

update travel_items
set client_id = (select client_id from shows where id = travel_items.show_id)
where show_id is not null and client_id is null;

alter table travel_items alter column client_id set not null;
alter table travel_items alter column show_id drop not null;

create table if not exists travel_item_shows (
  id             text primary key,
  travel_item_id text not null references travel_items(id) on delete cascade,
  show_id        text not null references shows(id) on delete cascade,
  unique (travel_item_id, show_id)
);

create index if not exists idx_travel_item_shows_travel_item_id on travel_item_shows(travel_item_id);
create index if not exists idx_travel_item_shows_show_id on travel_item_shows(show_id);

insert into travel_item_shows (id, travel_item_id, show_id)
select id || '-show1', id, show_id
from travel_items
where show_id is not null
on conflict (id) do nothing;

drop policy if exists "travel_items select" on travel_items;
drop policy if exists "travel_items insert" on travel_items;
drop policy if exists "travel_items update" on travel_items;
drop policy if exists "travel_items delete" on travel_items;

create policy "travel_items select" on travel_items for select using (has_section_access(client_id, 'tour'));
create policy "travel_items insert" on travel_items for insert with check (has_section_access(client_id, 'tour', true));
create policy "travel_items update" on travel_items for update using (has_section_access(client_id, 'tour', true)) with check (has_section_access(client_id, 'tour', true));
create policy "travel_items delete" on travel_items for delete using (has_section_access(client_id, 'tour', true));

alter table travel_item_shows enable row level security;

create policy "travel_item_shows select" on travel_item_shows for select using (
  has_section_access((select client_id from travel_items where id = travel_item_shows.travel_item_id), 'tour')
);
create policy "travel_item_shows insert" on travel_item_shows for insert with check (
  has_section_access((select client_id from travel_items where id = travel_item_shows.travel_item_id), 'tour', true)
);
create policy "travel_item_shows update" on travel_item_shows for update using (
  has_section_access((select client_id from travel_items where id = travel_item_shows.travel_item_id), 'tour', true)
) with check (
  has_section_access((select client_id from travel_items where id = travel_item_shows.travel_item_id), 'tour', true)
);
create policy "travel_item_shows delete" on travel_item_shows for delete using (
  has_section_access((select client_id from travel_items where id = travel_item_shows.travel_item_id), 'tour', true)
);
