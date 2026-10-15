-- Run in the Supabase SQL editor (after migration 052). Ends with an intentional error
-- ("ALL INVITE ACCESS CHECKS PASSED (rolled back)"), so nothing it makes is kept.
do $$
declare
  mgr uuid := 'f7303cf1-f728-46a2-a861-dc7787c00d9c';
  ws uuid := '873c4c0d-be6a-4ce3-9013-4755a5596299';
  x text := 'nimino-7tohmry';
  y text := 'wes-mills-f0kz7ze';
  demo text := 'demo-nova-lane';
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); u3 uuid := gen_random_uuid(); u4 uuid := gen_random_uuid(); u5 uuid := gen_random_uuid();
  r record; n int; m uuid; ws_new uuid;
begin
  -- 1. a valid invite: the chosen access is waiting for the person, and every kind of junk in it is ignored
  insert into public.pending_invites (email, workspace_id, role, access) values ('zz-inv1@example.invalid', ws, 'team', jsonb_build_array(
    jsonb_build_object('section', 'tour',    'client_id', x, 'can_edit', true),
    jsonb_build_object('section', 'finance', 'client_id', x, 'can_edit', true),
    jsonb_build_object('section', 'team',    'client_id', x, 'can_edit', false),
    jsonb_build_object('section', 'admin',   'client_id', y, 'can_edit', true),
    jsonb_build_object('section', 'vault',   'client_id', x, 'can_edit', true),        -- never
    jsonb_build_object('section', 'fandom',  'client_id', x, 'can_edit', false),       -- not a page
    jsonb_build_object('section', 'bogus',   'client_id', x, 'can_edit', false),
    jsonb_build_object('section', 'tour',    'client_id', 'zz-not-an-artist', 'can_edit', false),   -- not this company's artist
    jsonb_build_object('section', 'tour',    'client_id', demo, 'can_edit', false),    -- a demo artist
    jsonb_build_object('section', 'admin',   'client_id', x, 'can_edit', false),       -- view-only Point Person
    jsonb_build_object('section', 'legal',   'client_id', null, 'can_edit', false),    -- company-wide
    jsonb_build_object('section', 'music',   'client_id', x)                           -- no level
  ));
  insert into auth.users (id, email, instance_id, aud, role) values (u1, 'zz-inv1@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  select wm.id, wm.workspace_id, wm.role into r from public.workspace_members wm where wm.user_id = u1;
  if r.workspace_id is distinct from ws or r.role <> 'team' then raise exception '1a: the invited person did not join the inviting workspace as a teammate'; end if;
  m := r.id;
  select count(*) into n from public.access_grants where workspace_member_id = m;
  if n <> 4 then raise exception '1b: expected exactly the 4 valid rows, got %', n; end if;
  if not exists (select 1 from public.access_grants where workspace_member_id = m and section = 'tour' and client_id = x and can_edit)
     or not exists (select 1 from public.access_grants where workspace_member_id = m and section = 'finance' and client_id = x and can_edit)
     or not exists (select 1 from public.access_grants where workspace_member_id = m and section = 'team' and client_id = x and not can_edit)
     or not exists (select 1 from public.access_grants where workspace_member_id = m and section = 'admin' and client_id = y and can_edit)
  then raise exception '1c: a valid row is missing or has the wrong level'; end if;
  if exists (select 1 from public.access_grants where workspace_member_id = m and (section in ('vault', 'fandom', 'bogus') or client_id is null or client_id in ('zz-not-an-artist', demo))) then
    raise exception '1d: a junk row was applied';
  end if;
  if (select apply_error from public.pending_invites where email = 'zz-inv1@example.invalid') is not null then raise exception '1e: apply_error should be empty'; end if;
  if (select used_at from public.pending_invites where email = 'zz-inv1@example.invalid') is null then raise exception '1f: the invite was not marked used'; end if;

  -- 2. an artist's own login gets no page access from an invite, whatever the row says
  insert into public.pending_invites (email, workspace_id, role, client_id, access) values ('zz-inv2@example.invalid', ws, 'artist', x,
    jsonb_build_array(jsonb_build_object('section', 'finance', 'client_id', x, 'can_edit', true)));
  insert into auth.users (id, email, instance_id, aud, role) values (u2, 'zz-inv2@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  select count(*) into n from public.access_grants g join public.workspace_members wm on wm.id = g.workspace_member_id where wm.user_id = u2;
  if n <> 0 then raise exception '2: an artist login got page rows from an invite'; end if;

  -- 3. malformed access never blocks the sign-up; the reason is recorded and nothing is applied
  insert into public.pending_invites (email, workspace_id, role, access) values ('zz-inv3@example.invalid', ws, 'team', '[1, 2, 3]'::jsonb);
  insert into auth.users (id, email, instance_id, aud, role) values (u3, 'zz-inv3@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  if not exists (select 1 from public.workspace_members where user_id = u3 and workspace_id = ws) then raise exception '3a: malformed access blocked the sign-up'; end if;
  select count(*) into n from public.access_grants g join public.workspace_members wm on wm.id = g.workspace_member_id where wm.user_id = u3;
  if n <> 0 then raise exception '3b: rows were applied from malformed access'; end if;
  if (select apply_error from public.pending_invites where email = 'zz-inv3@example.invalid') is null then raise exception '3c: the failure was not recorded'; end if;

  -- 4. nobody invited still gets their own empty workspace, no rows (the sign-up fix from migration 046 still holds)
  insert into auth.users (id, email, instance_id, aud, role) values (u4, 'zz-inv4@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  select workspace_id into ws_new from public.workspace_members where user_id = u4;
  if ws_new is null or ws_new = ws then raise exception '4a: an uninvited sign-up did not get its own workspace'; end if;
  if exists (select 1 from public.access_grants g join public.workspace_members wm on wm.id = g.workspace_member_id where wm.user_id = u4) then raise exception '4b: an uninvited sign-up got access rows'; end if;

  -- 5. an invite older than 14 days is ignored
  insert into public.pending_invites (email, workspace_id, role, access, created_at) values ('zz-inv5@example.invalid', ws, 'team',
    jsonb_build_array(jsonb_build_object('section', 'tour', 'client_id', x, 'can_edit', true)), now() - interval '15 days');
  insert into auth.users (id, email, instance_id, aud, role) values (u5, 'zz-inv5@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  select workspace_id into ws_new from public.workspace_members where user_id = u5;
  if ws_new = ws then raise exception '5: an expired invite was honored'; end if;

  -- 6. the table keeps its shape rules and stays server-only
  begin insert into public.pending_invites (email, workspace_id, role, access) values ('zz-inv6@example.invalid', ws, 'team', '{"a": 1}'::jsonb);
    raise exception '6a: access that is not a list was accepted';
  exception when check_violation then null; end;
  begin insert into public.pending_invites (email, workspace_id, role, access)
      select 'zz-inv7@example.invalid', ws, 'team', jsonb_agg(jsonb_build_object('section', 'tour', 'client_id', x, 'can_edit', false)) from generate_series(1, 301);
    raise exception '6b: an oversized access list was accepted';
  exception when check_violation then null; end;
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform count(*) from public.pending_invites; raise exception '6c: signed-in users can read pending invites';
  exception when insufficient_privilege then null; end;

  -- 7. the team list says who has not signed in yet
  select count(*) into n from public.workspace_people() where user_id = u1 and invited;
  if n <> 1 then raise exception '7a: the invited login should show as waiting'; end if;
  select count(*) into n from public.workspace_people() where user_id = mgr and invited;
  if n <> 0 then raise exception '7b: the manager should not show as waiting'; end if;
  reset role;
  update auth.users set last_sign_in_at = now() where id = u1;
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.workspace_people() where user_id = u1 and not invited;
  if n <> 1 then raise exception '7c: a login that has signed in should no longer show as waiting'; end if;
  reset role;

  raise exception 'ALL INVITE ACCESS CHECKS PASSED (rolled back)';
end $$;
