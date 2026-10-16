-- Run in the Supabase SQL editor (or as a dry run before applying 063: wrap the migration and this in one do-block).
-- Ends with an intentional error, so nothing it makes is kept.
do $$
declare
  noted uuid := '873c4c0d-be6a-4ce3-9013-4755a5596299';
  owner uuid; u_team uuid := gen_random_uuid(); m_team uuid := gen_random_uuid();
  inst text := '00000000-0000-0000-0000-000000000000';
  cid text; bid text := 'zz-bud-' || left(gen_random_uuid()::text, 6); n int;
begin
  select owner_user_id into owner from public.workspaces where id = noted;
  select id into cid from public.clients where workspace_id = noted and demo_owner is null order by created_at limit 1;
  insert into public.budgets (id, client_id, name, currency, status, version, lines, commissions) values (bid, cid, 'Test budget', 'USD', 'draft', 1, '[]'::jsonb, '[]'::jsonb);

  -- the owner can save and change a budget's assumptions
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.budgets set assumptions = '{"travelers":3,"rooms":2,"to":"Lisbon"}'::jsonb where id = bid;
  select count(*) into n from public.budgets where id = bid and assumptions->>'to' = 'Lisbon';
  if n <> 1 then raise exception '1a: the assumptions did not save'; end if;
  update public.budgets set assumptions = null where id = bid;
  select count(*) into n from public.budgets where id = bid and assumptions is null;
  if n <> 1 then raise exception '1b: clearing the assumptions did not work'; end if;
  update public.budgets set assumptions = '{"travelers":4}'::jsonb where id = bid;
  reset role;

  -- someone with the Tour page but not Finance cannot read or change the budget, assumptions included
  insert into auth.users (id, email, instance_id, aud, role, last_sign_in_at)
    values (u_team, 'zz-team-' || left(u_team::text, 6) || '@example.invalid', inst::uuid, 'authenticated', 'authenticated', now());
  delete from public.workspace_members where user_id = u_team;
  insert into public.workspace_members (id, workspace_id, user_id, role, client_id) values (m_team, noted, u_team, 'team', null);
  insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values ('grant-zz-' || left(gen_random_uuid()::text, 6), m_team, 'tour', cid, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u_team, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.budgets where id = bid;
  if n <> 0 then raise exception '2a: a person without Finance could read the budget'; end if;
  update public.budgets set assumptions = '{"travelers":99}'::jsonb where id = bid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception '2b: a person without Finance could change the budget'; end if;
  reset role;
  select count(*) into n from public.budgets where id = bid and assumptions->>'travelers' = '4';
  if n <> 1 then raise exception '2c: the owner''s value changed'; end if;

  raise exception 'ALL 063 CHECKS PASSED (rolled back)';
end $$;
