-- Run in the Supabase SQL editor. Uses made-up logins and ends with an intentional error
-- ("ALL ACCOUNTS CHECKS PASSED (rolled back)"), so nothing it makes is kept.
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

  -- 1. the manager can add, read, change and remove
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.artist_accounts (id, client_id, platform, username) values ('t-acc-1', cid, 'Spotify for Artists', 'a@example.invalid');
  select count(*) into n from public.artist_accounts where client_id = cid;
  if n <> 1 then raise exception '1: manager should see it'; end if;
  update public.artist_accounts set access = 'platform' where id = 't-acc-1';
  get diagnostics n = row_count; if n <> 1 then raise exception '1b: manager should update'; end if;

  -- 2. a link that is not http(s) is refused (it could otherwise run code when clicked), and so are bad choices
  begin insert into public.artist_accounts (id, client_id, platform, login_url) values ('t-acc-2', cid, 'X', 'javascript:alert(1)'); raise exception '2: javascript link accepted';
  exception when check_violation then null; end;
  begin insert into public.artist_accounts (id, client_id, platform, vault_url) values ('t-acc-3', cid, 'X', 'ftp://x'); raise exception '2b: ftp link accepted';
  exception when check_violation then null; end;
  begin insert into public.artist_accounts (id, client_id, platform, access) values ('t-acc-4', cid, 'X', 'everyone'); raise exception '2c: unknown access accepted';
  exception when check_violation then null; end;
  begin insert into public.artist_accounts (id, client_id, platform) values ('t-acc-5', cid, ''); raise exception '2d: empty platform accepted';
  exception when check_violation then null; end;
  insert into public.artist_accounts (id, client_id, platform, login_url, vault_url) values ('t-acc-6', cid, 'OK', 'https://artists.spotify.com', 'https://vault.example.invalid/item/1');
  reset role;

  -- 3. a team login with no profile grant sees nothing and cannot add
  perform set_config('request.jwt.claims', json_build_object('sub', u_team, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.artist_accounts where client_id = cid;
  if n <> 0 then raise exception '3: no grant must see nothing'; end if;
  begin insert into public.artist_accounts (id, client_id, platform) values ('t-acc-7', cid, 'X'); raise exception '3b: should be refused';
  exception when insufficient_privilege then null; end;
  reset role;

  -- 4. view grant reads but cannot change or remove; edit grant can
  insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values ('t-grant-acc', m_team, 'profile', cid, false);
  set local role authenticated;
  select count(*) into n from public.artist_accounts where client_id = cid;
  if n <> 2 then raise exception '4: view grant should read both rows, saw %', n; end if;
  update public.artist_accounts set platform = 'hacked' where id = 't-acc-1';
  get diagnostics n = row_count; if n <> 0 then raise exception '4b: view grant must not update'; end if;
  delete from public.artist_accounts where id = 't-acc-1';
  get diagnostics n = row_count; if n <> 0 then raise exception '4c: view grant must not delete'; end if;
  reset role;
  update public.access_grants set can_edit = true where id = 't-grant-acc';
  set local role authenticated;
  update public.artist_accounts set notes = 'edited' where id = 't-acc-1';
  get diagnostics n = row_count; if n <> 1 then raise exception '4d: edit grant should update'; end if;
  delete from public.artist_accounts where id = 't-acc-6';
  get diagnostics n = row_count; if n <> 1 then raise exception '4e: edit grant should delete'; end if;
  reset role;

  -- 5. the artist's own login sees nothing
  perform set_config('request.jwt.claims', json_build_object('sub', u_artist, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.artist_accounts where client_id = cid;
  if n <> 0 then raise exception '5: the artist login must not see the accounts'; end if;
  reset role;

  -- 6. the public (not signed in) sees nothing at all
  set local role anon;
  begin perform 1 from public.artist_accounts limit 1; raise exception '6: anon must not read';
  exception when insufficient_privilege then null; end;
  reset role;

  raise exception 'ALL ACCOUNTS CHECKS PASSED (rolled back)';
end $$;
