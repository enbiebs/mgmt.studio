-- Run in the Supabase SQL editor (after migration 055). Ends with an intentional error
-- ("ALL DEALS AND FEES CHECKS PASSED (rolled back)"), so nothing it makes is kept.
do $$
declare
  mgr uuid := 'f7303cf1-f728-46a2-a861-dc7787c00d9c';
  ws uuid := '873c4c0d-be6a-4ce3-9013-4755a5596299';
  x text := 'nimino-7tohmry';
  y text := 'wes-mills-f0kz7ze';
  u_crew uuid := gen_random_uuid();     -- Touring Crew: Tour view only
  u_bm uuid := gen_random_uuid();       -- Business Manager: Finance + Deals & fees, NO Tour
  u_view uuid := gen_random_uuid();     -- Deals & fees view only
  u_tm uuid := gen_random_uuid();       -- Tour manager: Tour edit + Finance edit + Deals view
  u_pp uuid := gen_random_uuid();       -- Point Person
  u_art uuid := gen_random_uuid();      -- the artist's own login
  m_crew uuid; m_bm uuid; m_view uuid; m_tm uuid; m_pp uuid; m_art uuid;
  n int; r record;
begin
  insert into auth.users (id, email, instance_id, aud, role)
    select u, 'zz-' || left(u::text, 8) || '@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
    from unnest(array[u_crew, u_bm, u_view, u_tm, u_pp, u_art]) u;
  delete from public.workspace_members where user_id in (u_crew, u_bm, u_view, u_tm, u_pp, u_art);
  insert into public.workspace_members (id, workspace_id, user_id, role, client_id) values
    (gen_random_uuid(), ws, u_crew, 'team', null), (gen_random_uuid(), ws, u_bm, 'team', null), (gen_random_uuid(), ws, u_view, 'team', null),
    (gen_random_uuid(), ws, u_tm, 'team', null), (gen_random_uuid(), ws, u_pp, 'team', null), (gen_random_uuid(), ws, u_art, 'artist', x);
  select id into m_crew from public.workspace_members where user_id = u_crew;
  select id into m_bm   from public.workspace_members where user_id = u_bm;
  select id into m_view from public.workspace_members where user_id = u_view;
  select id into m_tm   from public.workspace_members where user_id = u_tm;
  select id into m_pp   from public.workspace_members where user_id = u_pp;
  select id into m_art  from public.workspace_members where user_id = u_art;
  insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values
    ('zz-g1', m_crew, 'tour', x, false),
    ('zz-g2', m_bm, 'finance', x, true), ('zz-g3', m_bm, 'deals', x, true),
    ('zz-g4', m_view, 'deals', x, false),
    ('zz-g5', m_tm, 'tour', x, true), ('zz-g6', m_tm, 'finance', x, true), ('zz-g7', m_tm, 'deals', x, false),
    ('zz-g8', m_pp, 'admin', x, true);

  -- the manager sets up two shows with fees, an offer, an offer sheet and a to-do about the offer
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.shows (id, client_id, date, city, venue, time) values ('zz-show-1', x, '2026-12-01', 'Berlin', 'Tresor', '20:00'), ('zz-show-2', y, '2026-12-02', 'Paris', 'Rex', '20:00');
  insert into public.show_deals (show_id, client_id, guarantee, currency) values ('zz-show-1', x, 5000, 'USD'), ('zz-show-2', y, 7000, 'USD');
  insert into public.tour_offers (id, client_id, venue, city, country, date, promoter, guarantee) values ('zz-off-1', x, 'Fabric', 'London', 'UK', '2026-12-10', 'Promo Ltd', 9000);
  insert into public.tasks (id, client_id, title, link_type, link_id) values ('zz-task-1', x, 'Reply to Fabric', 'offer', 'zz-off-1'), ('zz-task-2', x, 'Check the show', 'show', 'zz-show-1');
  select section into r from public.tasks where id = 'zz-task-1';
  if r.section is distinct from 'deals' then raise exception '0a: a to-do about an offer should be saved under deals (%)', r.section; end if;
  select section into r from public.tasks where id = 'zz-task-2';
  if r.section is distinct from 'tour' then raise exception '0b: a to-do about a show stays under tour (%)', r.section; end if;
  reset role;

  -- 1. Touring Crew (Tour view only): sees the show, never its fees, never an offer, never the activity about them
  perform set_config('request.jwt.claims', json_build_object('sub', u_crew, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.shows where id = 'zz-show-1';
  if n <> 1 then raise exception '1a: crew should still see the show'; end if;
  select count(*) into n from public.show_deals;
  if n <> 0 then raise exception '1b: crew can read show fees (%)', n; end if;
  select count(*) into n from public.tour_offers;
  if n <> 0 then raise exception '1c: crew can read booking offers (%)', n; end if;
  select count(*) into n from public.activity_log where section = 'deals';
  if n <> 0 then raise exception '1d: crew can read the fee and offer activity (%)', n; end if;
  select count(*) into n from public.tasks where id = 'zz-task-1';
  if n <> 0 then raise exception '1e: crew can see a to-do about an offer'; end if;
  begin insert into public.show_deals (show_id, client_id, guarantee) values ('zz-show-1', x, 1) on conflict (show_id) do update set guarantee = 1;
    raise exception '1f: crew wrote show fees';
  exception when insufficient_privilege then null; end;
  begin insert into public.tour_offers (id, client_id, venue, city, country, date, promoter) values ('zz-off-x', x, 'V', 'C', 'K', '2026-12-11', 'P');
    raise exception '1g: crew created an offer';
  exception when insufficient_privilege then null; end;
  reset role;

  -- 2. Business Manager (Finance + Deals & fees, NO Tour): reads and changes the money, but not the schedule
  perform set_config('request.jwt.claims', json_build_object('sub', u_bm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.show_deals where show_id = 'zz-show-1';
  if n <> 1 then raise exception '2a: the business manager cannot read show fees'; end if;
  select count(*) into n from public.tour_offers where id = 'zz-off-1';
  if n <> 1 then raise exception '2b: the business manager cannot read offers'; end if;
  select count(*) into n from public.shows;
  if n <> 0 then raise exception '2c: the business manager can read the show schedule (%)', n; end if;
  update public.show_deals set guarantee = 6000 where show_id = 'zz-show-1';
  get diagnostics n = row_count; if n <> 1 then raise exception '2d: the business manager cannot change a fee'; end if;
  select count(*) into n from public.show_deals where show_id = 'zz-show-2';
  if n <> 0 then raise exception '2e: reached another artist''s fees'; end if;
  select count(*) into n from public.activity_log where section = 'deals' and client_id = x and entity_type = 'show_deal';
  if n < 1 then raise exception '2f: the fee change did not reach the activity log (or the business manager cannot read it)'; end if;
  select count(*) into n from public.tasks where id = 'zz-task-1';
  if n <> 1 then raise exception '2g: the business manager cannot see a to-do about an offer'; end if;
  reset role;

  -- 3. Deals & fees view only: reads, cannot write
  perform set_config('request.jwt.claims', json_build_object('sub', u_view, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.show_deals where show_id = 'zz-show-1';
  if n <> 1 then raise exception '3a: a viewer cannot read fees'; end if;
  update public.show_deals set guarantee = 1 where show_id = 'zz-show-1';
  get diagnostics n = row_count; if n <> 0 then raise exception '3b: a viewer changed a fee'; end if;
  update public.tour_offers set promoter = 'X' where id = 'zz-off-1';
  get diagnostics n = row_count; if n <> 0 then raise exception '3c: a viewer changed an offer'; end if;
  reset role;

  -- 4. Tour manager (Tour edit + Finance edit + Deals view): runs the schedule, sees the fees, cannot change them
  perform set_config('request.jwt.claims', json_build_object('sub', u_tm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.shows where id = 'zz-show-1';
  if n <> 1 then raise exception '4a: the tour manager cannot see the show'; end if;
  select count(*) into n from public.show_deals where show_id = 'zz-show-1';
  if n <> 1 then raise exception '4b: the tour manager cannot see the fees'; end if;
  update public.show_deals set guarantee = 2 where show_id = 'zz-show-1';
  get diagnostics n = row_count; if n <> 0 then raise exception '4c: the tour manager changed a fee with view-only access'; end if;
  update public.shows set time = '21:00' where id = 'zz-show-1';
  get diagnostics n = row_count; if n <> 1 then raise exception '4d: the tour manager cannot edit the schedule'; end if;
  reset role;

  -- 5. a per-item "hide" on the show hides its fees from someone who can see fees
  insert into public.item_access (id, client_id, item_type, item_id, member_id, effect) values ('zz-ia-1', x, 'show', 'zz-show-1', m_bm, 'hide');
  perform set_config('request.jwt.claims', json_build_object('sub', u_bm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.show_deals where show_id = 'zz-show-1';
  if n <> 0 then raise exception '5a: a hidden show still shows its fees'; end if;
  reset role;
  delete from public.item_access where id = 'zz-ia-1';

  -- 6. Point Person (everything for the artist except the vault) reaches fees and offers; the artist's own login reaches neither
  perform set_config('request.jwt.claims', json_build_object('sub', u_pp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.show_deals where show_id = 'zz-show-1';
  if n <> 1 then raise exception '6a: a Point Person cannot read fees'; end if;
  select count(*) into n from public.tour_offers where id = 'zz-off-1';
  if n <> 1 then raise exception '6b: a Point Person cannot read offers'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_art, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.show_deals;
  if n <> 0 then raise exception '6c: the artist''s own login can read show fees (%)', n; end if;
  select count(*) into n from public.tour_offers;
  if n <> 0 then raise exception '6d: the artist''s own login can read offers (%)', n; end if;
  reset role;

  -- 7. the guard: fees stay with their show's artist and cannot move to another show
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin insert into public.show_deals (show_id, client_id, guarantee) values ('zz-show-2', x, 1) on conflict (show_id) do update set client_id = excluded.client_id;
    raise exception '7a: fees were attached to another artist''s show';
  exception when raise_exception then if sqlerrm not like 'That show is not part of this artist%' then raise; end if; end;
  begin update public.show_deals set show_id = 'zz-show-2' where show_id = 'zz-show-1';
    raise exception '7b: fees were moved to another show';
  exception when raise_exception then if sqlerrm not like 'Fees cannot move to another show%' and sqlerrm not like 'That show is not part of this artist%' then raise; end if; end;
  reset role;

  -- 8. the activity log files fee changes, offers and offer sheets under Deals & fees, with the show's name as the title
  select entity_type, section, title into r from public.activity_log where client_id = x and entity_type = 'show_deal' order by created_at desc limit 1;
  if r.entity_type is null then raise exception '8a: no fee entry in the activity log'; end if;
  if r.section <> 'deals' then raise exception '8b: fee entry filed under % not deals', r.section; end if;
  if r.title is distinct from 'Tresor · Berlin' then raise exception '8c: fee entry title is "%"', r.title; end if;
  select count(*) into n from public.activity_log where client_id = x and entity_type = 'offer' and section = 'deals';
  if n < 1 then raise exception '8d: the offer entry is not under deals'; end if;
  select count(*) into n from public.activity_log where client_id = x and entity_type = 'offer' and section = 'tour';
  if n <> 0 then raise exception '8e: an offer entry is still under tour'; end if;

  -- 9. a fresh invite can carry the Deals & fees page
  insert into public.pending_invites (email, workspace_id, role, access) values ('zz-deals-inv@example.invalid', ws, 'team',
    jsonb_build_array(jsonb_build_object('section', 'deals', 'client_id', x, 'can_edit', false), jsonb_build_object('section', 'tour', 'client_id', x, 'can_edit', false)));
  insert into auth.users (id, email, instance_id, aud, role) values (gen_random_uuid(), 'zz-deals-inv@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  select count(*) into n from public.access_grants g join public.workspace_members wm on wm.id = g.workspace_member_id
    join auth.users u on u.id = wm.user_id where u.email = 'zz-deals-inv@example.invalid' and g.section = 'deals' and g.client_id = x;
  if n <> 1 then raise exception '9: an invite could not carry Deals & fees (%)', n; end if;

  -- 10. the show_deals table is closed to signed-out callers
  set local role anon;
  begin perform count(*) from public.show_deals; raise exception '10: signed-out callers can touch show_deals';
  exception when insufficient_privilege then null; end;
  reset role;

  raise exception 'ALL DEALS AND FEES CHECKS PASSED (rolled back)';
end $$;
