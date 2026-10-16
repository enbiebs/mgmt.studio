-- Run in the Supabase SQL editor (or as a dry run before applying 059). Ends with an intentional error, so nothing it makes is kept.
do $$
declare
  n int; ws uuid; owner uuid; nm text; u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); u3 uuid := gen_random_uuid(); u_inv uuid := gen_random_uuid();
  noted uuid := '873c4c0d-be6a-4ce3-9013-4755a5596299';
begin
  -- 1. every existing company that has a manager has an owner, and the owner is one of its managers
  --    (a company with nobody in it, such as an old test one, has no owner to record)
  select count(*) into n from public.workspaces w
   where w.owner_user_id is null and exists (select 1 from public.workspace_members m where m.workspace_id = w.id and m.role = 'manager');
  if n <> 0 then raise exception '1a: % companies with a manager have no owner', n; end if;
  select count(*) into n from public.workspaces w
   where w.owner_user_id is not null
     and not exists (select 1 from public.workspace_members m where m.workspace_id = w.id and m.user_id = w.owner_user_id and m.role = 'manager');
  if n <> 0 then raise exception '1b: % companies have an owner who is not their manager', n; end if;

  -- 2. signing up creates a company owned by the person, named as typed (trimmed)
  insert into auth.users (id, email, instance_id, aud, role, raw_user_meta_data)
  values (u1, 'zz-own1-' || left(u1::text, 6) || '@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{"workspace_name": "   Test Co   "}'::jsonb);
  select w.id, w.owner_user_id into ws, owner from public.workspaces w join public.workspace_members m on m.workspace_id = w.id where m.user_id = u1;
  if ws is null then raise exception '2a: no company was created'; end if;
  if owner is distinct from u1 then raise exception '2b: the new company is not owned by the person who signed up'; end if;
  if (select name from public.workspaces where id = ws) <> 'Test Co' then raise exception '2c: the name was not trimmed (%)', (select name from public.workspaces where id = ws); end if;
  if (select role from public.workspace_members where workspace_id = ws and user_id = u1) <> 'manager' then raise exception '2d: the owner is not a manager'; end if;

  -- a blank name falls back to the email's first part (it must not break sign-up), and a very long one is cut to 80
  insert into auth.users (id, email, instance_id, aud, role, raw_user_meta_data)
  values (u2, 'zz-own2-' || left(u2::text, 6) || '@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{"workspace_name": "     "}'::jsonb);
  select w.name into nm from public.workspaces w join public.workspace_members m on m.workspace_id = w.id where m.user_id = u2;
  if nm is null or position('zz-own2-' in nm) <> 1 then raise exception '2e: a blank name did not fall back to the email (%)', nm; end if;
  insert into auth.users (id, email, instance_id, aud, role, raw_user_meta_data)
  values (u3, 'zz-own3-' || left(u3::text, 6) || '@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', jsonb_build_object('workspace_name', repeat('x', 200)));
  select char_length(w.name) into n from public.workspaces w join public.workspace_members m on m.workspace_id = w.id where m.user_id = u3;
  if n <> 80 then raise exception '2f: a long name should be cut to 80 (was %)', n; end if;

  -- 3. an invited person joins the company they were invited to; no new company, the owner does not change
  select count(*) into n from public.workspaces;
  select owner_user_id into owner from public.workspaces where id = noted;
  insert into public.pending_invites (email, workspace_id, role, access) values ('zz-inv-' || left(u_inv::text, 6) || '@example.invalid', noted, 'team', '[]'::jsonb);
  insert into auth.users (id, email, instance_id, aud, role)
  values (u_inv, 'zz-inv-' || left(u_inv::text, 6) || '@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  if (select count(*) from public.workspaces) <> n then raise exception '3a: an invited person got a company of their own'; end if;
  if (select owner_user_id from public.workspaces where id = noted) is distinct from owner then raise exception '3b: the owner changed'; end if;
  if not exists (select 1 from public.workspace_members where workspace_id = noted and user_id = u_inv and role = 'team') then raise exception '3c: the invited person did not join'; end if;

  -- 4. nobody can change who owns a company from the app (only the name is open)
  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin update public.workspaces set owner_user_id = u1 where id = noted; raise exception '4a: a manager changed an owner';
  exception when insufficient_privilege then null; end;
  begin update public.workspaces set owner_user_id = u2 where id = ws; raise exception '4b: the owner changed their own company''s owner';
  exception when insufficient_privilege then null; end;
  reset role;

  raise exception 'ALL COMPANY OWNER CHECKS PASSED (rolled back)';
end $$;
