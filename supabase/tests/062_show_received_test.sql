-- Run in the Supabase SQL editor (or as a dry run before applying 062: wrap the migration and this in one do-block).
-- Ends with an intentional error, so nothing it makes is kept.
do $$
declare
  noted uuid := '873c4c0d-be6a-4ce3-9013-4755a5596299';
  owner uuid; u_team uuid := gen_random_uuid(); m_team uuid := gen_random_uuid();
  inst text := '00000000-0000-0000-0000-000000000000';
  cid text; sid text := 'zz-show-' || left(gen_random_uuid()::text, 6); n int;
begin
  select owner_user_id into owner from public.workspaces where id = noted;
  select id into cid from public.clients where workspace_id = noted and demo_owner is null order by created_at limit 1;
  insert into public.shows (id, client_id, date, city, venue, time, status) values (sid, cid, current_date + 10, 'Testville', 'Test Hall', '20:00', 'confirmed');

  -- the owner can record what has been received, and correct it
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.show_deals (show_id, client_id, guarantee, received) values (sid, cid, 10000, 2500.50);
  update public.show_deals set received = 4000 where show_id = sid;
  select count(*) into n from public.show_deals where show_id = sid and received = 4000;
  if n <> 1 then raise exception '1a: the received amount did not save'; end if;
  update public.show_deals set received = null where show_id = sid;
  select count(*) into n from public.show_deals where show_id = sid and received is null;
  if n <> 1 then raise exception '1b: clearing the received amount did not work'; end if;
  begin
    update public.show_deals set received = -1 where show_id = sid;
    raise exception '1c: a negative amount was accepted';
  exception when check_violation then null; end;
  update public.show_deals set received = 3000 where show_id = sid;
  reset role;

  -- someone on the team with the Tour page but not Deals & fees cannot read or change it
  insert into auth.users (id, email, instance_id, aud, role, last_sign_in_at)
    values (u_team, 'zz-team-' || left(u_team::text, 6) || '@example.invalid', inst::uuid, 'authenticated', 'authenticated', now());
  delete from public.workspace_members where user_id = u_team;
  insert into public.workspace_members (id, workspace_id, user_id, role, client_id) values (m_team, noted, u_team, 'team', null);
  insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values ('grant-zz-' || left(gen_random_uuid()::text, 6), m_team, 'tour', cid, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_team, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.show_deals where show_id = sid;
  if n <> 0 then raise exception '2a: a person without Deals & fees could read the received amount'; end if;
  update public.show_deals set received = 1 where show_id = sid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception '2b: a person without Deals & fees could change the received amount'; end if;
  reset role;
  select count(*) into n from public.show_deals where show_id = sid and received = 3000;
  if n <> 1 then raise exception '2c: the owner''s value changed'; end if;

  raise exception 'ALL 062 CHECKS PASSED (rolled back)';
end $$;
