-- Migration 021 made travel_items' SELECT rule call can_see_travel_item(id), which
-- looks the item up in the table. The app saves travel with an upsert, and Postgres
-- also checks the read rule against the row being inserted - which isn't in the table
-- yet, so the lookup finds nothing and every NEW flight/hotel/ground transfer was
-- refused (the app showed it as saved anyway). Editing existing items kept working.
--
-- Fix: for the read rule only, use the existing logic when the item exists, and fall
-- back to "can edit this artist's tour" when it's a brand-new row. Who can see an
-- EXISTING item is unchanged.
create or replace function public.can_see_travel_item_row(target_travel_item_id text, target_client_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.travel_items ti where ti.id = target_travel_item_id)
      then public.can_see_travel_item(target_travel_item_id)
    else public.has_section_access(target_client_id, 'tour', true)
  end
$$;

alter policy "travel_items select" on public.travel_items
  using (public.can_see_travel_item_row(id, client_id));
