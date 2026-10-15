-- Run in the Supabase SQL editor. Ends with an intentional error ("ALL CLIENT VISIBILITY CHECKS PASSED (rolled back)").
do $$
declare
  mgr uuid := 'f7303cf1-f728-46a2-a861-dc7787c00d9c';   -- a real manager
  cid text := 'nimino-7tohmry';
  other text := 'wes-mills-f0kz7ze';
  ws uuid := '873c4c0d-be6a-4ce3-9013-4755a5596299';
  u_team uuid := gen_random_uuid();      -- team login with access to the first artist only
  u_all uuid := gen_random_uuid();       -- team login with a Tour grant for ALL artists
  u_none uuid := gen_random_uuid();      -- team login with no access
  u_artist uuid := gen_random_uuid();    -- the first artist's own login
  m_team uuid; m_all uuid; n int; total int; non_demo int; got text;
begin
  select count(*) into non_demo from public.clients where workspace_id = ws and demo_owner is null;
  insert into auth.users (id, email, instance_id, aud, role) values
    (u_team,   'test-team@example.invalid',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_all,    'test-all@example.invalid',    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_none,   'test-none@example.invalid',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_artist, 'test-artist@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  delete from public.workspace_members where user_id in (u_team, u_all, u_none, u_artist);
  insert into public.workspace_members (id, workspace_id, user_id, role, client_id) values
    (gen_random_uuid(), ws, u_team, 'team', null), (gen_random_uuid(), ws, u_all, 'team', null),
    (gen_random_uuid(), ws, u_none, 'team', null), (gen_random_uuid(), ws, u_artist, 'artist', cid);
  select id into m_team from public.workspace_members where user_id = u_team;
  select id into m_all from public.workspace_members where user_id = u_all;
  insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values
    ('t-g-cv-1', m_team, 'tour', cid, false), ('t-g-cv-2', m_all, 'tour', null, false);
  update public.clients set calendar_token = 'secret-token-for-' || id where id in (cid, other);

  -- 1. a manager still sees every artist (and the numbers are the same as before)
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into total from public.clients where workspace_id = ws;
  if total <> non_demo + 1 then raise exception '1: a manager should see every artist including their own demo (% vs %)', total, non_demo + 1; end if;
  select count(*) into n from public.clients where id in (cid, other) and calendar_token is not null;
  if n <> 2 then raise exception '1b: a manager should still read the calendar links'; end if;
  -- 1c. adding, renaming (upsert) and removing an artist still work, including reading the new row straight back
  insert into public.clients (id, workspace_id, name, genre, color) values ('t-new-artist', ws, 'ZZ New', 'x', '#123456') returning id into got;
  if got is distinct from 't-new-artist' then raise exception '1c: insert returning failed'; end if;
  insert into public.clients (id, workspace_id, name, genre, color) values ('t-new-artist', ws, 'ZZ Renamed', 'x', '#123456') on conflict (id) do update set name = excluded.name;
  select count(*) into n from public.clients where id = 't-new-artist' and name = 'ZZ Renamed';
  if n <> 1 then raise exception '1d: the upsert did not change the artist'; end if;
  delete from public.clients where id = 't-new-artist';
  get diagnostics n = row_count; if n <> 1 then raise exception '1e: manager could not remove the artist'; end if;
  reset role;

  -- 2. a teammate with access to ONE artist sees only that artist, and never the others' calendar link
  perform set_config('request.jwt.claims', json_build_object('sub', u_team, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.clients;
  if n <> 1 then raise exception '2: a teammate with one artist should see exactly one, saw %', n; end if;
  select count(*) into n from public.clients where id = other;
  if n <> 0 then raise exception '2b: the other artist must not be visible'; end if;
  select count(*) into n from public.clients where calendar_token = 'secret-token-for-' || other;
  if n <> 0 then raise exception '2c: another artist''s calendar link was readable'; end if;
  reset role;

  -- 3. a teammate with a grant for ALL artists sees all of them; with no grant, none
  perform set_config('request.jwt.claims', json_build_object('sub', u_all, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.clients;
  if n <> non_demo then raise exception '3: an all-artists grant should see every real artist, not the private demo (% of %)', n, non_demo; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_none, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.clients;
  if n <> 0 then raise exception '3b: no access should see no artists, saw %', n; end if;
  reset role;

  -- 4. the artist's own login sees only their own row, never another artist's link
  perform set_config('request.jwt.claims', json_build_object('sub', u_artist, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.clients;
  if n <> 1 then raise exception '4: an artist should see only their own page, saw %', n; end if;
  select count(*) into n from public.clients where id = other;
  if n <> 0 then raise exception '4b: the artist saw another artist'; end if;
  reset role;

  -- 5. signed-out visitors see nothing at all
  set local role anon;
  begin perform 1 from public.clients limit 1; raise exception '5: anon read the artists';
  exception when insufficient_privilege then null; end;
  reset role;

  raise exception 'ALL CLIENT VISIBILITY CHECKS PASSED (rolled back)';
end $$;
