-- Run in the Supabase SQL editor (or as a dry run before applying 058). Ends with an intentional error, so nothing it makes is kept.
do $$
declare
  ws uuid := '873c4c0d-be6a-4ce3-9013-4755a5596299';
  mgr uuid; u_staff uuid := gen_random_uuid(); u_out uuid := gen_random_uuid(); other_ws uuid;
  n int; old_name text;
begin
  select user_id into mgr from public.workspace_members where workspace_id = ws and role = 'manager' and client_id is null limit 1;
  select name into old_name from public.workspaces where id = ws;
  insert into auth.users (id, email, instance_id, aud, role) values
    (u_staff, 'zz-staff-' || left(u_staff::text, 6) || '@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_out,   'zz-out-'   || left(u_out::text, 6)   || '@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  select workspace_id into other_ws from public.workspace_members where user_id = u_out limit 1;   -- the sign-up trigger gave the outsider their own company
  delete from public.workspace_members where user_id = u_staff;
  insert into public.workspace_members (id, workspace_id, user_id, role, client_id) values (gen_random_uuid(), ws, u_staff, 'team', null);

  -- 1. the manager can rename their own company, and only the name
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.workspaces set name = 'Renamed By Test' where id = ws;
  get diagnostics n = row_count;
  if n <> 1 then raise exception '1a: the manager could not rename their company'; end if;
  if (select name from public.workspaces where id = ws) <> 'Renamed By Test' then raise exception '1b: the name did not change'; end if;
  begin update public.workspaces set created_at = now() where id = ws; raise exception '1c: the manager changed created_at';
  exception when insufficient_privilege then null; end;
  begin update public.workspaces set id = gen_random_uuid() where id = ws; raise exception '1d: the manager changed the company id';
  exception when insufficient_privilege then null; end;
  begin update public.workspaces set name = '   ' where id = ws; raise exception '1e: a blank name was accepted';
  exception when check_violation then null; end;
  begin update public.workspaces set name = repeat('x', 81) where id = ws; raise exception '1f: a very long name was accepted';
  exception when check_violation then null; end;
  update public.workspaces set name = 'Another Company''s Name' where id = other_ws;
  get diagnostics n = row_count;
  if n <> 0 then raise exception '1g: the manager renamed another company'; end if;
  begin delete from public.workspaces where id = ws; raise exception '1h: the manager deleted their company';
  exception when insufficient_privilege then null; end;
  reset role;

  -- 2. a teammate cannot rename it
  perform set_config('request.jwt.claims', json_build_object('sub', u_staff, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.workspaces set name = 'Staff Rename' where id = ws;
  get diagnostics n = row_count;
  if n <> 0 then raise exception '2a: a teammate renamed the company'; end if;
  reset role;

  -- 3. an outsider cannot, and anon cannot even try
  perform set_config('request.jwt.claims', json_build_object('sub', u_out, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.workspaces set name = 'Outsider Rename' where id = ws;
  get diagnostics n = row_count;
  if n <> 0 then raise exception '3a: an outsider renamed the company'; end if;
  reset role;
  set local role anon;
  begin update public.workspaces set name = 'Anon Rename' where id = ws; raise exception '3b: anon could update workspaces';
  exception when insufficient_privilege then null; end;
  reset role;

  if (select name from public.workspaces where id = ws) <> 'Renamed By Test' then raise exception '4: the name should only have changed once'; end if;
  raise exception 'ALL COMPANY RENAME CHECKS PASSED (rolled back)';
end $$;
