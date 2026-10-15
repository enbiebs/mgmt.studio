-- Run in the Supabase SQL editor. It uses made-up logins and ends with an intentional error
-- ("ALL PROFILE ACCESS CHECKS PASSED (rolled back)"), so nothing it makes is kept.
do $$
declare
  mgr uuid := 'f7303cf1-f728-46a2-a861-dc7787c00d9c';   -- a real manager in the workspace below
  cid text := 'nimino-7tohmry';
  ws uuid := '873c4c0d-be6a-4ce3-9013-4755a5596299';
  u_team uuid := gen_random_uuid();
  u_artist uuid := gen_random_uuid();
  m_team uuid; n int;
begin
  insert into auth.users (id, email, instance_id, aud, role) values
    (u_team, 'test-team@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_artist, 'test-artist@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  delete from public.workspace_members where user_id in (u_team, u_artist);
  insert into public.workspace_members (id, workspace_id, user_id, role, client_id) values
    (gen_random_uuid(), ws, u_team, 'team', null),
    (gen_random_uuid(), ws, u_artist, 'artist', cid);
  select id into m_team from public.workspace_members where user_id = u_team;

  -- 1. the manager can write and read the profile
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.artist_profiles (client_id, data) values (cid, '{"phone":"555"}');
  select count(*) into n from public.artist_profiles where client_id = cid;
  if n <> 1 then raise exception '1: manager should see the profile'; end if;
  update public.artist_profiles set data = '{"phone":"556"}' where client_id = cid;
  get diagnostics n = row_count; if n <> 1 then raise exception '1b: manager should be able to update'; end if;
  reset role;
  insert into public.profile_access_log (user_id, user_label, client_id, subject, tier, action) values (mgr, 'x', cid, 'artist', 'private', 'reveal');

  -- 2. a team login with NO profile grant sees nothing and cannot write
  perform set_config('request.jwt.claims', json_build_object('sub', u_team, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.artist_profiles where client_id = cid;
  if n <> 0 then raise exception '2: team without a grant must see nothing'; end if;
  begin insert into public.artist_profiles (client_id, data) values (cid, '{}'); raise exception '2b: should have been refused';
  exception when insufficient_privilege then null; end;
  reset role;

  -- 3. view grant: can read, cannot change
  insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values ('t-grant-1', m_team, 'profile', cid, false);
  set local role authenticated;
  select count(*) into n from public.artist_profiles where client_id = cid;
  if n <> 1 then raise exception '3: view grant should read'; end if;
  update public.artist_profiles set data = '{"phone":"hacked"}' where client_id = cid;
  get diagnostics n = row_count; if n <> 0 then raise exception '3b: view grant must not update'; end if;
  select count(*) into n from public.profile_access_log where client_id = cid and tier = 'private';
  if n <> 1 then raise exception '3c: view grant should see private-tier log rows'; end if;
  reset role;

  -- 4. edit grant: can change
  update public.access_grants set can_edit = true where id = 't-grant-1';
  set local role authenticated;
  update public.artist_profiles set data = '{"phone":"557"}' where client_id = cid;
  get diagnostics n = row_count; if n <> 1 then raise exception '4: edit grant should update'; end if;
  reset role;

  -- 5. the artist's own login sees nothing
  perform set_config('request.jwt.claims', json_build_object('sub', u_artist, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.artist_profiles where client_id = cid;
  if n <> 0 then raise exception '5: the artist login must not see the profile'; end if;
  begin insert into public.artist_profiles (client_id, data) values (cid, '{}'); raise exception '5b: should have been refused';
  exception when insufficient_privilege then null; end;
  reset role;

  -- 6. the locked table is out of reach for every browser role, even the manager; the browser cannot write the log
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform 1 from public.profile_secure limit 1; raise exception '6: manager session must not read profile_secure';
  exception when insufficient_privilege then null; end;
  begin insert into public.profile_access_log (user_id, user_label, client_id, subject, tier, action) values (mgr, 'x', cid, 'artist', 'private', 'save'); raise exception '6b: browser must not write the log';
  exception when insufficient_privilege then null; end;
  reset role;
  set local role anon;
  begin perform 1 from public.artist_profiles limit 1; raise exception '6c: anon must not read the profile';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.profile_secure limit 1; raise exception '6d: anon must not read profile_secure';
  exception when insufficient_privilege then null; end;
  reset role;

  -- 7. vault-tier log rows need the vault grant
  insert into public.profile_access_log (user_id, user_label, client_id, subject, tier, action) values (mgr, 'x', cid, 'artist', 'vault', 'reveal');
  perform set_config('request.jwt.claims', json_build_object('sub', u_team, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.profile_access_log where client_id = cid and tier = 'vault';
  if n <> 0 then raise exception '7: no vault grant must not see vault log rows'; end if;
  reset role;
  insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values ('t-grant-2', m_team, 'vault', cid, false);
  set local role authenticated;
  select count(*) into n from public.profile_access_log where client_id = cid and tier = 'vault';
  if n <> 1 then raise exception '7b: vault grant should see vault log rows'; end if;
  reset role;

  raise exception 'ALL PROFILE ACCESS CHECKS PASSED (rolled back)';
end $$;
