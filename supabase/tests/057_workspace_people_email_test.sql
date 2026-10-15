-- Run in the Supabase SQL editor AFTER migration 057 (or inside the rolled-back dry run). Ends with an intentional error,
-- so nothing it makes is kept.
do $$
declare
  ws uuid := '873c4c0d-be6a-4ce3-9013-4755a5596299';
  mgr uuid; u_staff uuid := gen_random_uuid(); u_out uuid := gen_random_uuid();
  n int; r record;
begin
  select user_id into mgr from public.workspace_members where workspace_id = ws and role = 'manager' and client_id is null limit 1;
  insert into auth.users (id, email, instance_id, aud, role) values
    (u_staff, 'zz-staff-' || left(u_staff::text, 6) || '@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_out,   'zz-out-'   || left(u_out::text, 6)   || '@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  delete from public.workspace_members where user_id in (u_staff, u_out);   -- the sign-up trigger made each their own company; keep only what the test sets up
  insert into public.workspace_members (id, workspace_id, user_id, role, client_id) values (gen_random_uuid(), ws, u_staff, 'team', null);

  -- the manager gets every login's email, lower-cased
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.workspace_people();
  if n < 2 then raise exception '1a: the manager should see the team (%)', n; end if;
  select * into r from public.workspace_people() where user_id = u_staff;
  if r.email is distinct from lower(r.email) or r.email not like 'zz-staff-%@example.invalid' then raise exception '1b: the manager should get the email, got %', r.email; end if;
  reset role;

  -- a teammate sees who is on the team but never their emails
  perform set_config('request.jwt.claims', json_build_object('sub', u_staff, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.workspace_people();
  if n < 2 then raise exception '2a: a teammate should still see the team (%)', n; end if;
  select count(*) into n from public.workspace_people() where email is not null;
  if n <> 0 then raise exception '2b: a teammate must not be given emails (% rows)', n; end if;
  reset role;

  -- someone from another company sees nothing, and anon cannot call it
  perform set_config('request.jwt.claims', json_build_object('sub', u_out, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.workspace_people();
  if n <> 0 then raise exception '3a: an outsider sees % people', n; end if;
  reset role;
  set local role anon;
  begin perform * from public.workspace_people(); raise exception '3b: anon could call workspace_people';
  exception when insufficient_privilege then null; end;
  reset role;

  raise exception 'ALL WORKSPACE-PEOPLE EMAIL CHECKS PASSED (rolled back)';
end $$;
