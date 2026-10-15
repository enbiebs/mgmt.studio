-- Run in the Supabase SQL editor (after migration 054). Ends with an intentional error
-- ("ALL WORKSPACE PEOPLE CHECKS PASSED (rolled back)"), so nothing it makes is kept.
do $$
declare
  mgr uuid := 'f7303cf1-f728-46a2-a861-dc7787c00d9c';
  ws uuid := '873c4c0d-be6a-4ce3-9013-4755a5596299';
  x text := 'nimino-7tohmry';
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid();
  n int; pid text;
begin
  insert into public.people (id, client_id, name) values ('zz-wp-1', x, 'Zz Linked Person');
  insert into public.pending_invites (email, workspace_id, role, person_id) values ('zz-wp1@example.invalid', ws, 'team', 'zz-wp-1');
  insert into auth.users (id, email, instance_id, aud, role) values (u1, 'zz-wp1@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  insert into auth.users (id, email, instance_id, aud, role) values (u2, 'zz-wp2@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  update public.workspace_members set workspace_id = ws, role = 'team', client_id = null where user_id = u2;   -- a login with no directory card

  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select person_id into pid from public.workspace_people() where user_id = u1;
  if pid is distinct from 'zz-wp-1' then raise exception '1: the login should point at its directory card (%)', pid; end if;
  select count(*) into n from public.workspace_people() where user_id = u2 and person_id is null;
  if n <> 1 then raise exception '2: a login with no card should have no person_id'; end if;
  select count(*) into n from public.workspace_people() where user_id = mgr;
  if n <> 1 then raise exception '3: the manager should still be listed'; end if;
  -- still only the caller's own company, and signed-out callers cannot use it
  reset role;
  set local role anon;
  begin perform * from public.workspace_people(); raise exception '4: signed-out callers can read the team list';
  exception when insufficient_privilege then null; end;
  reset role;
  raise exception 'ALL WORKSPACE PEOPLE CHECKS PASSED (rolled back)';
end $$;
