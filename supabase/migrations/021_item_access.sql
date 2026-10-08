-- Per-item "who sees what": the manager can hide a single item from someone
-- who'd normally see it, or share a single item with someone who has no
-- access to that area. Managers always see everything.
--
-- Baseline stays exactly as before (section access via access_grants, the
-- artist login seeing its own client). item_access rows are EXCEPTIONS on top:
--   'hide'  -> the item disappears for that person, everywhere (incl. edit)
--   'share' -> the person can VIEW that one item (never edit it) even with
--              no access to the area
-- With no rows, behavior is identical to before this migration.
--
-- Details inside an item follow it in both directions (hide a show -> its
-- advance/guest list/travel go too; share an invoice -> its line items come
-- along). Child tables get that for free by checking "is my parent visible?"
-- through the parent's own policy.

-- ── Exceptions table (manager-only) ──────────────────────────
create table if not exists item_access (
  id         text primary key,
  client_id  text not null references clients(id) on delete cascade,
  item_type  text not null check (item_type in ('show','album','post','project','invoice','contract','expense')),
  item_id    text not null,
  member_id  uuid not null references workspace_members(id) on delete cascade,
  effect     text not null check (effect in ('hide','share')),
  created_at timestamptz not null default now(),
  unique (item_type, item_id, member_id)
);

create index if not exists idx_item_access_client on item_access(client_id);
create index if not exists idx_item_access_member on item_access(member_id);

alter table item_access enable row level security;

create policy "item_access select" on item_access for select
  using (exists (
    select 1 from workspace_members caller
    join clients c on c.workspace_id = caller.workspace_id
    where c.id = item_access.client_id and caller.user_id = auth.uid() and caller.role = 'manager'
  ));
create policy "item_access insert" on item_access for insert
  with check (
    exists (
      select 1 from workspace_members caller
      join clients c on c.workspace_id = caller.workspace_id
      where c.id = item_access.client_id and caller.user_id = auth.uid() and caller.role = 'manager'
    )
    -- the person must be a non-manager member of the same workspace
    and exists (
      select 1 from workspace_members target
      join clients c on c.workspace_id = target.workspace_id
      where target.id = item_access.member_id and c.id = item_access.client_id and target.role <> 'manager'
    )
  );
create policy "item_access update" on item_access for update
  using (exists (
    select 1 from workspace_members caller
    join clients c on c.workspace_id = caller.workspace_id
    where c.id = item_access.client_id and caller.user_id = auth.uid() and caller.role = 'manager'
  ))
  with check (exists (
    select 1 from workspace_members caller
    join clients c on c.workspace_id = caller.workspace_id
    where c.id = item_access.client_id and caller.user_id = auth.uid() and caller.role = 'manager'
  ));
create policy "item_access delete" on item_access for delete
  using (exists (
    select 1 from workspace_members caller
    join clients c on c.workspace_id = caller.workspace_id
    where c.id = item_access.client_id and caller.user_id = auth.uid() and caller.role = 'manager'
  ));

-- Exceptions never outlive their item.
create or replace function delete_item_access() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.item_access where item_type = tg_argv[0] and item_id = old.id;
  return old;
end;
$$;
revoke all on function delete_item_access() from public, anon, authenticated;

create trigger shows_item_access_cleanup     after delete on shows     for each row execute function delete_item_access('show');
create trigger albums_item_access_cleanup    after delete on albums    for each row execute function delete_item_access('album');
create trigger posts_item_access_cleanup     after delete on posts     for each row execute function delete_item_access('post');
create trigger projects_item_access_cleanup  after delete on projects  for each row execute function delete_item_access('project');
create trigger invoices_item_access_cleanup  after delete on invoices  for each row execute function delete_item_access('invoice');
create trigger contracts_item_access_cleanup after delete on contracts for each row execute function delete_item_access('contract');
create trigger expenses_item_access_cleanup  after delete on expenses  for each row execute function delete_item_access('expense');

-- ── The one check every item table's policy calls ────────────
create or replace function can_see_item(
  target_client_id text, target_section text, target_item_type text, target_item_id text,
  require_edit boolean default false
) returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  wm record;
  fx text;
begin
  select wm2.* into wm
  from public.workspace_members wm2
  join public.clients c on c.workspace_id = wm2.workspace_id
  where wm2.user_id = auth.uid() and c.id = target_client_id
  limit 1;

  if wm is null then return false; end if;
  if wm.role = 'manager' then return true; end if;

  select ia.effect into fx from public.item_access ia
  where ia.item_type = target_item_type and ia.item_id = target_item_id and ia.member_id = wm.id;

  if fx = 'hide' then return false; end if;
  -- A share is view-only: it never grants edit.
  if fx = 'share' and not require_edit then return true; end if;

  -- Baseline: the person's normal area access. Bills/expenses are
  -- management-side only, so the artist's login is shut out by default.
  if target_item_type = 'expense' and wm.client_id is not null then return false; end if;
  return public.has_section_access(target_client_id, target_section, require_edit);
end;
$$;

revoke all on function can_see_item(text, text, text, text, boolean) from public, anon;
grant execute on function can_see_item(text, text, text, text, boolean) to authenticated;

-- Travel is client-level but can be tied to any number of shows. It follows
-- its shows: visible if at least one of them is visible to the viewer; hidden
-- if it has shows and every one is hidden; and plain Tour access applies to
-- travel that isn't tied to a show.
create or replace function can_see_travel_item(target_travel_item_id text, require_edit boolean default false)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  cid text;
  n_links int;
  n_visible int;
begin
  select ti.client_id into cid from public.travel_items ti where ti.id = target_travel_item_id;
  if cid is null then return false; end if;

  select count(*), count(*) filter (where public.can_see_item(cid, 'tour', 'show', tis.show_id))
    into n_links, n_visible
  from public.travel_item_shows tis where tis.travel_item_id = target_travel_item_id;

  if n_links = 0 then return public.has_section_access(cid, 'tour', require_edit); end if;
  if n_visible = 0 then return false; end if;
  if not require_edit then return true; end if;
  return public.has_section_access(cid, 'tour', true);
end;
$$;

revoke all on function can_see_travel_item(text, boolean) from public, anon;
grant execute on function can_see_travel_item(text, boolean) to authenticated;

-- ── The seven item tables ────────────────────────────────────
-- (insert policies are unchanged: a new item has no exceptions yet)

drop policy if exists "shows select" on shows;
drop policy if exists "shows update" on shows;
drop policy if exists "shows delete" on shows;
create policy "shows select" on shows for select using (can_see_item(client_id, 'tour', 'show', id));
create policy "shows update" on shows for update using (can_see_item(client_id, 'tour', 'show', id, true)) with check (can_see_item(client_id, 'tour', 'show', id, true));
create policy "shows delete" on shows for delete using (can_see_item(client_id, 'tour', 'show', id, true));

drop policy if exists "albums select" on albums;
drop policy if exists "albums update" on albums;
drop policy if exists "albums delete" on albums;
create policy "albums select" on albums for select using (can_see_item(client_id, 'music', 'album', id));
create policy "albums update" on albums for update using (can_see_item(client_id, 'music', 'album', id, true)) with check (can_see_item(client_id, 'music', 'album', id, true));
create policy "albums delete" on albums for delete using (can_see_item(client_id, 'music', 'album', id, true));

drop policy if exists "posts select" on posts;
drop policy if exists "posts update" on posts;
drop policy if exists "posts delete" on posts;
create policy "posts select" on posts for select using (can_see_item(client_id, 'content', 'post', id));
create policy "posts update" on posts for update using (can_see_item(client_id, 'content', 'post', id, true)) with check (can_see_item(client_id, 'content', 'post', id, true));
create policy "posts delete" on posts for delete using (can_see_item(client_id, 'content', 'post', id, true));

drop policy if exists "projects select" on projects;
drop policy if exists "projects update" on projects;
drop policy if exists "projects delete" on projects;
create policy "projects select" on projects for select using (can_see_item(client_id, 'projects', 'project', id));
create policy "projects update" on projects for update using (can_see_item(client_id, 'projects', 'project', id, true)) with check (can_see_item(client_id, 'projects', 'project', id, true));
create policy "projects delete" on projects for delete using (can_see_item(client_id, 'projects', 'project', id, true));

drop policy if exists "invoices select" on invoices;
drop policy if exists "invoices update" on invoices;
drop policy if exists "invoices delete" on invoices;
create policy "invoices select" on invoices for select using (can_see_item(client_id, 'finance', 'invoice', id));
create policy "invoices update" on invoices for update using (can_see_item(client_id, 'finance', 'invoice', id, true)) with check (can_see_item(client_id, 'finance', 'invoice', id, true));
create policy "invoices delete" on invoices for delete using (can_see_item(client_id, 'finance', 'invoice', id, true));

drop policy if exists "contracts select" on contracts;
drop policy if exists "contracts update" on contracts;
drop policy if exists "contracts delete" on contracts;
create policy "contracts select" on contracts for select using (can_see_item(client_id, 'legal', 'contract', id));
create policy "contracts update" on contracts for update using (can_see_item(client_id, 'legal', 'contract', id, true)) with check (can_see_item(client_id, 'legal', 'contract', id, true));
create policy "contracts delete" on contracts for delete using (can_see_item(client_id, 'legal', 'contract', id, true));

drop policy if exists "expenses select" on expenses;
drop policy if exists "expenses update" on expenses;
drop policy if exists "expenses delete" on expenses;
create policy "expenses select" on expenses for select using (can_see_item(client_id, 'finance', 'expense', id));
create policy "expenses update" on expenses for update using (can_see_item(client_id, 'finance', 'expense', id, true)) with check (can_see_item(client_id, 'finance', 'expense', id, true));
create policy "expenses delete" on expenses for delete using (can_see_item(client_id, 'finance', 'expense', id, true));

-- ── Details follow their item (view side) ────────────────────
-- A child is visible exactly when its parent is, as seen through the
-- parent's own policy (which already includes hide/share). Write policies
-- on these tables are unchanged: they look up the parent's client through
-- the same filtered view, so a hidden parent is a NULL client -> no access,
-- and a view-only share can't edit.

drop policy if exists "tracks select" on tracks;
create policy "tracks select" on tracks for select
  using (exists (select 1 from albums a where a.id = tracks.album_id));

drop policy if exists "checklist_items select" on checklist_items;
create policy "checklist_items select" on checklist_items for select
  using (exists (select 1 from albums a where a.id = checklist_items.album_id));

drop policy if exists "release_stakeholders select" on release_stakeholders;
create policy "release_stakeholders select" on release_stakeholders for select
  using (exists (select 1 from albums a where a.id = release_stakeholders.album_id));

drop policy if exists "track_rounds select" on track_rounds;
create policy "track_rounds select" on track_rounds for select
  using (exists (select 1 from tracks t where t.id = track_rounds.track_id));

drop policy if exists "track_notes select" on track_notes;
create policy "track_notes select" on track_notes for select
  using (exists (select 1 from track_rounds r where r.id = track_notes.round_id));

drop policy if exists "track_note_replies select" on track_note_replies;
create policy "track_note_replies select" on track_note_replies for select
  using (exists (select 1 from track_notes n where n.id = track_note_replies.note_id));

drop policy if exists "track_credits select" on track_credits;
create policy "track_credits select" on track_credits for select
  using (exists (select 1 from tracks t where t.id = track_credits.track_id));

drop policy if exists "show_advances select" on show_advances;
create policy "show_advances select" on show_advances for select
  using (exists (select 1 from shows s where s.id = show_advances.show_id));

drop policy if exists "advance_contacts select" on advance_contacts;
create policy "advance_contacts select" on advance_contacts for select
  using (exists (select 1 from show_advances sa where sa.id = advance_contacts.advance_id));

drop policy if exists "guest_list_entries select" on guest_list_entries;
create policy "guest_list_entries select" on guest_list_entries for select
  using (exists (select 1 from shows s where s.id = guest_list_entries.show_id));

drop policy if exists "invoice_line_items select" on invoice_line_items;
create policy "invoice_line_items select" on invoice_line_items for select
  using (exists (select 1 from invoices i where i.id = invoice_line_items.invoice_id));

-- ── Travel (follows its shows) ───────────────────────────────
drop policy if exists "travel_items select" on travel_items;
drop policy if exists "travel_items update" on travel_items;
drop policy if exists "travel_items delete" on travel_items;
create policy "travel_items select" on travel_items for select using (can_see_travel_item(id));
create policy "travel_items update" on travel_items for update using (can_see_travel_item(id, true)) with check (has_section_access(client_id, 'tour', true));
create policy "travel_items delete" on travel_items for delete using (can_see_travel_item(id, true));

drop policy if exists "travel_item_shows select" on travel_item_shows;
create policy "travel_item_shows select" on travel_item_shows for select using (can_see_travel_item(travel_item_id));

-- flight_legs' old write policies joined through travel_items.show_id, which
-- is NULL for travel not tied to a show - so legs on such travel could never
-- be saved (the client resolved to NULL -> no access, even for managers).
-- Resolve the client from the travel item itself instead.
drop policy if exists "flight_legs select" on flight_legs;
drop policy if exists "flight_legs insert" on flight_legs;
drop policy if exists "flight_legs update" on flight_legs;
drop policy if exists "flight_legs delete" on flight_legs;
create policy "flight_legs select" on flight_legs for select using (can_see_travel_item(travel_item_id));
create policy "flight_legs insert" on flight_legs for insert
  with check (has_section_access((select t.client_id from travel_items t where t.id = flight_legs.travel_item_id), 'tour', true));
create policy "flight_legs update" on flight_legs for update
  using (has_section_access((select t.client_id from travel_items t where t.id = flight_legs.travel_item_id), 'tour', true))
  with check (has_section_access((select t.client_id from travel_items t where t.id = flight_legs.travel_item_id), 'tour', true));
create policy "flight_legs delete" on flight_legs for delete
  using (has_section_access((select t.client_id from travel_items t where t.id = flight_legs.travel_item_id), 'tour', true));
