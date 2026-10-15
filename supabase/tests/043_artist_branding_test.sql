-- Run in the Supabase SQL editor. Uses made-up logins and ends with an intentional error
-- ("ALL BRANDING CHECKS PASSED (rolled back)"), so nothing it makes is kept.
do $$
declare
  mgr uuid := 'f7303cf1-f728-46a2-a861-dc7787c00d9c';   -- a real manager in the workspace below
  cid text := 'nimino-7tohmry';
  other text := 'wes-mills-f0kz7ze';
  ws uuid := '873c4c0d-be6a-4ce3-9013-4755a5596299';
  u_grant uuid := gen_random_uuid();     -- team login with access to the first artist only
  u_none uuid := gen_random_uuid();      -- team login with no access
  u_artist uuid := gen_random_uuid();    -- the first artist's own login
  u_artist2 uuid := gen_random_uuid();   -- the other artist's own login
  m_grant uuid; n int;
begin
  insert into auth.users (id, email, instance_id, aud, role) values
    (u_grant,   'test-grant@example.invalid',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_none,    'test-none@example.invalid',    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_artist,  'test-artist@example.invalid',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_artist2, 'test-artist2@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  delete from public.workspace_members where user_id in (u_grant, u_none, u_artist, u_artist2);
  insert into public.workspace_members (id, workspace_id, user_id, role, client_id) values
    (gen_random_uuid(), ws, u_grant, 'team', null), (gen_random_uuid(), ws, u_none, 'team', null),
    (gen_random_uuid(), ws, u_artist, 'artist', cid), (gen_random_uuid(), ws, u_artist2, 'artist', other);
  select id into m_grant from public.workspace_members where user_id = u_grant;
  insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values ('t-grant-brand', m_grant, 'tour', cid, false);

  -- 1. who may open which artist
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if not (public.can_open_client(cid) and public.can_open_client(other)) then raise exception '1: a manager opens every artist'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_grant, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if not public.can_open_client(cid) then raise exception '1b: a teammate with a grant opens that artist'; end if;
  if public.can_open_client(other) then raise exception '1c: ...but not another artist'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_none, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if public.can_open_client(cid) then raise exception '2: a teammate with no grant must not open the artist'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_artist, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if not public.can_open_client(cid) then raise exception '3: an artist opens their own page'; end if;
  if public.can_open_client(other) then raise exception '3b: an artist must not open another artist'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_artist2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if public.can_open_client(cid) then raise exception '3c: the other artist must not open this one'; end if;
  reset role;
  set local role anon;
  begin perform public.can_open_client(cid); raise exception '4: anon must not call it';
  exception when insufficient_privilege then null; end;
  reset role;

  -- 5. the file must sit in this artist's own folder and have the expected shape
  update public.clients set photo_path = cid || '/photo-abc123.jpg', logo_path = cid || '/logo-xyz.png' where id = cid;
  update public.clients set photo_path = cid || '/photo-abc123.webp' where id = cid;
  begin update public.clients set photo_path = other || '/photo-abc123.jpg' where id = cid; raise exception '5: pointed at another artist''s folder';
  exception when check_violation then null; end;
  begin update public.clients set photo_path = cid || '/photo-x.svg' where id = cid; raise exception '5b: svg accepted';
  exception when check_violation then null; end;
  begin update public.clients set photo_path = cid || '/logo-x.png' where id = cid; raise exception '5c: a logo file used as the photo';
  exception when check_violation then null; end;
  begin update public.clients set logo_path = cid || '/../' || other || '/logo-x.png' where id = cid; raise exception '5d: path trick accepted';
  exception when check_violation then null; end;
  begin update public.clients set photo_path = repeat('a', 300) where id = cid; raise exception '5e: huge path accepted';
  exception when check_violation then null; end;

  -- 6. the bucket is private and only takes the three image types
  select count(*) into n from storage.buckets where id = 'artist-branding' and public = false and file_size_limit = 5242880
    and allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];
  if n <> 1 then raise exception '6: the branding bucket is not set up as expected'; end if;
  select count(*) into n from pg_policies where schemaname = 'storage' and tablename = 'objects' and (qual ilike '%artist-branding%' or with_check ilike '%artist-branding%');
  if n <> 0 then raise exception '6b: the bucket must have no open storage policies'; end if;

  raise exception 'ALL BRANDING CHECKS PASSED (rolled back)';
end $$;
