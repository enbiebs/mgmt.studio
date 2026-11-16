-- Tests supabase/migrations/073_item_owners.sql against the live database. It APPLIES the migration inside the test (and applies it a
-- second time, to prove it can be re-run), then ends with an intentional error, so NOTHING is kept. Generated from the migration file. Success:
--   ERROR: ALL 073 CHECKS PASSED (rolled back)
do $test$
declare
  noted uuid := '873c4c0d-be6a-4ce3-9013-4755a5596299';
  tag text := left(gen_random_uuid()::text, 6);
  cid text := 'zz-client-' || tag;  cid2 text := 'zz-client2-' || tag;
  ws2 uuid := gen_random_uuid();
  mgr_u uuid := gen_random_uuid(); all_u uuid := gen_random_uuid(); one_u uuid := gen_random_uuid();
  other_u uuid := gen_random_uuid(); none_u uuid := gen_random_uuid(); art_u uuid := gen_random_uuid(); out_u uuid := gen_random_uuid();
  m_all uuid; m_one uuid; m_other uuid;
  s1 text := 'zz-show1-' || tag; s2 text := 'zz-show2-' || tag; s3 text := 'zz-show3-' || tag; s4 text := 'zz-show4-' || tag;
  o1 text := 'zz-offer1-' || tag; o2 text := 'zz-offer2-' || tag; o3 text := 'zz-offer3-' || tag;
  ok boolean; got uuid; n int; owner uuid; tid text; res jsonb; bad uuid;
begin
  execute $apply$
-- Owners on offers and shows: one named teammate who is handling it.
--
-- Purely additive: two new, empty, optional columns. Nothing existing changes, and every existing offer and show starts with no owner.
-- The owner is a teammate's LOGIN (the same people a to-do can be given to). Like a to-do, the database only lets an item be given to someone
-- who can actually open that artist (a manager, or someone granted access to all artists or to this one), never to an artist login or an
-- outsider. The check only runs when the owner is being set to someone NEW, so an old owner whose access was later removed never blocks
-- an unrelated save. The app treats such an owner as "no owner" on screen.
-- Changing an existing item's owner to someone who cannot open the artist is refused with a plain message (the app writes the owner on its
-- own, as a one-column update, only when the owner is changed). A row being CREATED with such an owner (for example a deleted show coming
-- back from the trash after its owner lost access) is created with no owner instead, so a restore never fails over it.
-- If the person's login is deleted, the item simply has no owner again (on delete set null).
--
-- Who may read or change the column is the same as for the rest of the row: it follows the table's existing rules.
-- The Activity log already records every changed column on these tables; the app words an owner change without showing the login id.

alter table public.shows        add column if not exists owner_user uuid references auth.users(id) on delete set null;
alter table public.tour_offers  add column if not exists owner_user uuid references auth.users(id) on delete set null;

create or replace function public.item_owner_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws uuid;
begin
  if new.owner_user is not null and (TG_OP = 'INSERT' or new.owner_user is distinct from old.owner_user) then
    select c.workspace_id into ws from public.clients c where c.id = new.client_id;
    if not exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = ws and wm.user_id = new.owner_user and wm.client_id is null
        and (wm.role = 'manager' or exists (
          select 1 from public.access_grants g
          where g.workspace_member_id = wm.id and (g.client_id is null or g.client_id = new.client_id)))
    ) then
      if TG_OP = 'INSERT' then
        new.owner_user := null;
      else
        raise exception 'That person cannot open this artist, so they cannot be the owner';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- Only the triggers below run it; nobody signed in may call it by hand (same lock-down as the other trigger functions).
revoke execute on function public.item_owner_guard() from public, anon, authenticated;

drop trigger if exists shows_owner_guard on public.shows;
create trigger shows_owner_guard before insert or update on public.shows
  for each row execute function public.item_owner_guard();

drop trigger if exists tour_offers_owner_guard on public.tour_offers;
create trigger tour_offers_owner_guard before insert or update on public.tour_offers
  for each row execute function public.item_owner_guard();
  $apply$;

  -- ── people: a manager, someone with every artist, someone with only this artist, someone with only another artist, someone with nothing,
  --    this artist's own login, and a member of a different company ──
  insert into public.clients (id, workspace_id, name) values (cid, noted, 'ZZ Artist'), (cid2, noted, 'ZZ Other Artist');
  insert into public.workspaces (id, name) values (ws2, 'ZZ Other Company');
  insert into auth.users (id, email) values
    (mgr_u, 'zz-m-' || tag || '@example.com'), (all_u, 'zz-a-' || tag || '@example.com'), (one_u, 'zz-1-' || tag || '@example.com'),
    (other_u, 'zz-o-' || tag || '@example.com'), (none_u, 'zz-n-' || tag || '@example.com'), (art_u, 'zz-r-' || tag || '@example.com'),
    (out_u, 'zz-x-' || tag || '@example.com');
  insert into public.workspace_members (workspace_id, user_id, role) values (noted, mgr_u, 'manager'), (noted, all_u, 'team'), (noted, one_u, 'team'), (noted, other_u, 'team'), (noted, none_u, 'team');
  insert into public.workspace_members (workspace_id, user_id, role, client_id) values (noted, art_u, 'artist', cid);
  insert into public.workspace_members (workspace_id, user_id, role) values (ws2, out_u, 'manager');
  select id into m_all   from public.workspace_members where user_id = all_u   and workspace_id = noted;
  select id into m_one   from public.workspace_members where user_id = one_u   and workspace_id = noted;
  select id into m_other from public.workspace_members where user_id = other_u and workspace_id = noted;
  insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values
    ('zz-g1-' || tag, m_all,   'tour', null, true),     -- every artist
    ('zz-g2-' || tag, m_one,   'tour', cid,  false),    -- this artist only (view is enough to be an owner)
    ('zz-g3-' || tag, m_other, 'tour', cid2, true);     -- another artist only

  -- ═══ 1. the columns exist and start empty ═══
  select count(*) into n from information_schema.columns where table_schema = 'public' and column_name = 'owner_user' and table_name in ('shows', 'tour_offers');
  assert n = 2, '1a: both tables have the column';
  insert into public.shows (id, client_id, date, city, venue, time, status) values (s1, cid, '2027-01-01', 'City', 'Venue', '20:00', 'hold');
  assert (select owner_user from public.shows where id = s1) is null, '1b: an existing or new row with no owner has none';

  -- ═══ 2. creating a row with an owner: the people who can open the artist keep it, nobody else does ═══
  insert into public.shows (id, client_id, date, city, venue, time, status, owner_user) values (s2, cid, '2027-01-02', 'City', 'V2', '20:00', 'hold', mgr_u);
  assert (select owner_user from public.shows where id = s2) = mgr_u, '2a: a manager can own';
  update public.shows set owner_user = null where id = s2;
  foreach bad in array array[none_u, other_u, art_u, out_u] loop
    delete from public.shows where id = s3;
    insert into public.shows (id, client_id, date, city, venue, time, status, owner_user) values (s3, cid, '2027-01-03', 'City', 'V3', '20:00', 'hold', bad);
    assert (select owner_user from public.shows where id = s3) is null, '2b: a row created with someone who cannot open the artist has no owner (' || bad || ')';
  end loop;
  delete from public.shows where id = s3;

  -- ═══ 3. changing an existing row's owner ═══
  update public.shows set owner_user = all_u where id = s1;
  assert (select owner_user from public.shows where id = s1) = all_u, '3a: someone with every artist can own';
  update public.shows set owner_user = one_u where id = s1;
  assert (select owner_user from public.shows where id = s1) = one_u, '3b: someone with this artist can own';
  update public.shows set owner_user = null where id = s1;
  assert (select owner_user from public.shows where id = s1) is null, '3c: an owner can be taken off';
  foreach bad in array array[none_u, other_u, art_u, out_u] loop
    ok := false;
    begin update public.shows set owner_user = bad where id = s1; exception when others then ok := true; end;
    assert ok, '3d: changing the owner to someone who cannot open the artist is refused (' || bad || ')';
  end loop;
  assert (select owner_user from public.shows where id = s1) is null, '3e: a refused change leaves the owner as it was';

  -- ═══ 4. an owner who lost access never blocks a save of anything else, and is not erased by it ═══
  update public.shows set owner_user = one_u where id = s1;
  delete from public.access_grants where id = 'zz-g2-' || tag;                       -- one_u can no longer open the artist
  update public.shows set venue = 'Renamed' where id = s1;
  assert (select venue from public.shows where id = s1) = 'Renamed' and (select owner_user from public.shows where id = s1) = one_u, '4a: an unrelated change goes through and keeps the old owner';
  -- an upsert that does not mention the owner (what the app sends) leaves it alone
  insert into public.shows (id, client_id, date, city, venue, time, status) values (s1, cid, '2027-01-01', 'City', 'Upserted', '20:00', 'hold')
    on conflict (id) do update set venue = excluded.venue, status = excluded.status;
  assert (select venue from public.shows where id = s1) = 'Upserted' and (select owner_user from public.shows where id = s1) = one_u, '4b: an upsert without the owner keeps whatever owner was there';
  -- but naming the old owner again is a change to "someone new" only on insert; an upsert that DOES name someone who cannot open the artist ends with no owner
  insert into public.shows (id, client_id, date, city, venue, time, status, owner_user) values (s1, cid, '2027-01-01', 'City', 'Upserted', '20:00', 'hold', none_u)
    on conflict (id) do update set owner_user = excluded.owner_user;
  assert (select owner_user from public.shows where id = s1) is null, '4c: an upsert naming someone who cannot open the artist ends with no owner';

  -- ═══ 5. offers follow the same rules ═══
  insert into public.tour_offers (id, client_id, venue, city, country, date, promoter, guarantee, status, owner_user) values (o1, cid, 'V', 'C', 'X', '2027-02-01', 'P', 1000, 'hold', all_u);
  assert (select owner_user from public.tour_offers where id = o1) = all_u, '5a: an offer can start with an owner';
  insert into public.tour_offers (id, client_id, venue, city, country, date, promoter, guarantee, status, owner_user) values (o2, cid, 'V', 'C', 'X', '2027-02-02', 'P', 1000, 'hold', other_u);
  assert (select owner_user from public.tour_offers where id = o2) is null, '5b: an offer created with someone who cannot open the artist has no owner';
  ok := false;
  begin update public.tour_offers set owner_user = art_u where id = o1; exception when others then ok := true; end;
  assert ok, '5c: an artist login cannot be given an offer';
  update public.tour_offers set owner_user = mgr_u where id = o1;
  assert (select owner_user from public.tour_offers where id = o1) = mgr_u, '5d: the owner of an offer can be changed';

  -- ═══ 6. the guard cannot be called by hand ═══
  ok := false;
  set local role authenticated;
  begin perform public.item_owner_guard(); exception when others then ok := true; end;
  reset role;
  assert ok, '6a: a signed-in person cannot call the guard function directly';

  -- ═══ 7. a show put back from the trash after its owner lost access comes back with no owner (and is not lost) ═══
  select owner_user_id into owner from public.workspaces where id = noted;
  update public.shows set owner_user = all_u where id = s2;
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  tid := public.trash_delete('show', s2, 'ZZ show', 'x');
  reset role;
  assert tid is not null, '7a: the show was kept in the trash';
  delete from public.access_grants where id = 'zz-g1-' || tag;                       -- all_u can no longer open the artist
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  res := public.trash_restore(tid);
  reset role;
  assert res ->> 'status' = 'restored', '7b: it was put back: ' || res::text;
  assert exists (select 1 from public.shows where id = s2), '7c: the show is back';
  assert (select owner_user from public.shows where id = s2) is null, '7d: it is back with no owner, because its owner can no longer open the artist';

  -- ═══ 8. removing a person's login takes them off what they owned, and does not break anything ═══
  update public.shows set owner_user = mgr_u where id = s2;
  delete from auth.users where id = mgr_u;
  assert (select owner_user from public.shows where id = s2) is null, '8a: the show simply has no owner again';
  update public.tour_offers set owner_user = null where id = o1;

  -- ═══ 9. applying the migration a second time changes nothing ═══
  execute $again$
-- Owners on offers and shows: one named teammate who is handling it.
--
-- Purely additive: two new, empty, optional columns. Nothing existing changes, and every existing offer and show starts with no owner.
-- The owner is a teammate's LOGIN (the same people a to-do can be given to). Like a to-do, the database only lets an item be given to someone
-- who can actually open that artist (a manager, or someone granted access to all artists or to this one), never to an artist login or an
-- outsider. The check only runs when the owner is being set to someone NEW, so an old owner whose access was later removed never blocks
-- an unrelated save. The app treats such an owner as "no owner" on screen.
-- Changing an existing item's owner to someone who cannot open the artist is refused with a plain message (the app writes the owner on its
-- own, as a one-column update, only when the owner is changed). A row being CREATED with such an owner (for example a deleted show coming
-- back from the trash after its owner lost access) is created with no owner instead, so a restore never fails over it.
-- If the person's login is deleted, the item simply has no owner again (on delete set null).
--
-- Who may read or change the column is the same as for the rest of the row: it follows the table's existing rules.
-- The Activity log already records every changed column on these tables; the app words an owner change without showing the login id.

alter table public.shows        add column if not exists owner_user uuid references auth.users(id) on delete set null;
alter table public.tour_offers  add column if not exists owner_user uuid references auth.users(id) on delete set null;

create or replace function public.item_owner_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws uuid;
begin
  if new.owner_user is not null and (TG_OP = 'INSERT' or new.owner_user is distinct from old.owner_user) then
    select c.workspace_id into ws from public.clients c where c.id = new.client_id;
    if not exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = ws and wm.user_id = new.owner_user and wm.client_id is null
        and (wm.role = 'manager' or exists (
          select 1 from public.access_grants g
          where g.workspace_member_id = wm.id and (g.client_id is null or g.client_id = new.client_id)))
    ) then
      if TG_OP = 'INSERT' then
        new.owner_user := null;
      else
        raise exception 'That person cannot open this artist, so they cannot be the owner';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- Only the triggers below run it; nobody signed in may call it by hand (same lock-down as the other trigger functions).
revoke execute on function public.item_owner_guard() from public, anon, authenticated;

drop trigger if exists shows_owner_guard on public.shows;
create trigger shows_owner_guard before insert or update on public.shows
  for each row execute function public.item_owner_guard();

drop trigger if exists tour_offers_owner_guard on public.tour_offers;
create trigger tour_offers_owner_guard before insert or update on public.tour_offers
  for each row execute function public.item_owner_guard();
  $again$;
  assert exists (select 1 from public.shows where id = s1), '9a: re-applying keeps the data';

  raise exception 'ALL 073 CHECKS PASSED (rolled back)';
end
$test$;
