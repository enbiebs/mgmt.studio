-- Run in the Supabase SQL editor (after migrations 050 and 051). Ends with an intentional error
-- ("ALL HARDENING CHECKS PASSED (rolled back)"), so nothing it makes is kept.
do $$
declare
  mgr uuid := 'f7303cf1-f728-46a2-a861-dc7787c00d9c';
  x text := 'nimino-7tohmry';
  y text := 'wes-mills-f0kz7ze';
  ws uuid := '873c4c0d-be6a-4ce3-9013-4755a5596299';
  u_pp uuid := gen_random_uuid();        -- Point Person for X
  u_tm uuid := gen_random_uuid();        -- teammate
  u_orphan uuid := gen_random_uuid();    -- a former artist login (its artist was deleted: role 'artist', no client)
  u_mgr2 uuid := gen_random_uuid();      -- a second manager
  u_other uuid := gen_random_uuid();     -- a manager of a DIFFERENT company (its own workspace)
  m_pp uuid; m_tm uuid; m_orphan uuid; m_mgr2 uuid; m_other uuid; ws2 uuid;
  n int; r record;
begin
  insert into auth.users (id, email, instance_id, aud, role) values
    (u_pp,     'test-pp@example.invalid',     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_tm,     'test-tm@example.invalid',     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_orphan, 'test-orphan@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_mgr2,   'test-mgr2@example.invalid',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_other,  'test-other@example.invalid',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  -- u_other keeps the empty workspace + manager seat the sign-up trigger just made for it (that is another company)
  select workspace_id, id into ws2, m_other from public.workspace_members where user_id = u_other;
  delete from public.workspace_members where user_id in (u_pp, u_tm, u_orphan, u_mgr2);
  insert into public.workspace_members (id, workspace_id, user_id, role, client_id) values
    (gen_random_uuid(), ws, u_pp, 'team', null), (gen_random_uuid(), ws, u_tm, 'team', null),
    (gen_random_uuid(), ws, u_orphan, 'artist', null), (gen_random_uuid(), ws, u_mgr2, 'manager', null);
  select id into m_pp from public.workspace_members where user_id = u_pp;
  select id into m_tm from public.workspace_members where user_id = u_tm;
  select id into m_orphan from public.workspace_members where user_id = u_orphan;
  select id into m_mgr2 from public.workspace_members where user_id = u_mgr2;
  insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values ('t-pp-admin', m_pp, 'admin', x, true);

  -- 1. a former artist login is not a teammate: a Point Person cannot give it access or make it a Point Person
  perform set_config('request.jwt.claims', json_build_object('sub', u_pp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values ('t-o1', m_orphan, 'tour', x, false);
    raise exception '1a: gave a former artist login access';
  exception when insufficient_privilege then null; end;
  begin insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values ('t-o2', m_orphan, 'admin', x, true);
    raise exception '1b: made a former artist login a Point Person';
  exception when insufficient_privilege then null; end;
  reset role;

  -- 2. a manager of ANOTHER company cannot plant a row pointing at this company's artist, nor touch this company's people
  perform set_config('request.jwt.claims', json_build_object('sub', u_other, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values ('t-x1', m_other, 'tour', x, false);
    raise exception '2a: planted a row pointing at another company''s artist';
  exception when insufficient_privilege then null; end;
  begin insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values ('t-x2', m_tm, 'tour', x, false);
    raise exception '2b: changed another company''s person';
  exception when insufficient_privilege then null; end;
  insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values ('t-x3', m_other, 'legal', null, false);   -- their own company-wide grant is fine
  reset role;

  -- 3. a manager of THIS company still has full reach: any teammate, company-wide rows, the vault
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values
    ('t-m1', m_tm, 'tour', x, false), ('t-m2', m_tm, 'finance', x, true), ('t-m3', m_tm, 'vault', x, false), ('t-m4', m_tm, 'legal', null, false);
  update public.access_grants set can_edit = true where id = 't-m1';
  get diagnostics n = row_count; if n <> 1 then raise exception '3: a manager could not change a grant'; end if;
  begin insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values ('t-m5', m_other, 'tour', x, false);
    raise exception '3: a manager changed a person from another company';
  exception when insufficient_privilege then null; end;
  reset role;

  -- 4. signed-out requests see nothing and cannot call the helpers
  set local role anon;
  select count(*) into n from public.access_grants;
  if n <> 0 then raise exception '4: signed-out callers can read access rows'; end if;
  begin perform public.can_change_grant(m_tm, x, 'tour'); raise exception '4: signed-out callers can call can_change_grant';
  exception when insufficient_privilege then null; end;
  begin perform public.revoke_artist_access(m_tm, x); raise exception '4: signed-out callers can call revoke_artist_access';
  exception when insufficient_privilege then null; end;
  reset role;

  -- 5. a Point Person cannot turn a row into a vault row, and company-wide rows stay out of reach
  perform set_config('request.jwt.claims', json_build_object('sub', u_pp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin update public.access_grants set section = 'vault' where id = 't-m1';
    raise exception '5a: turned a row into a vault row';
  exception when insufficient_privilege then null; end;
  update public.access_grants set can_edit = false where id = 't-m4';
  get diagnostics n = row_count; if n <> 0 then raise exception '5b: touched a company-wide row'; end if;
  select count(*) into n from public.access_grants where id in ('t-m3', 't-m4', 't-x3', 't-o1');
  if n <> 0 then raise exception '5c: can see vault, company-wide or foreign rows (%)', n; end if;
  reset role;

  -- 6. revoke_artist_access: the Point Person removes a teammate completely, including the vault row they cannot see
  perform set_config('request.jwt.claims', json_build_object('sub', u_pp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select public.revoke_artist_access(m_tm, x) into n;
  if n <> 3 then raise exception '6a: expected 3 rows removed (tour, finance, vault), got %', n; end if;
  reset role;
  select count(*) into n from public.access_grants where workspace_member_id = m_tm and client_id = x;
  if n <> 0 then raise exception '6b: rows were left behind (%)', n; end if;
  select count(*) into n from public.access_grants where id = 't-m4';
  if n <> 1 then raise exception '6c: the company-wide row should not be touched by revoking one artist'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', u_tm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if public.has_section_access(x, 'tour', false) or public.has_section_access(x, 'vault', false) then raise exception '6d: still has access after being revoked'; end if;
  reset role;

  -- 7. revoke_artist_access refuses what it should
  insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values ('t-r1', m_tm, 'tour', y, false), ('t-r2', m_orphan, 'tour', x, false);
  perform set_config('request.jwt.claims', json_build_object('sub', u_pp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.revoke_artist_access(m_tm, y); raise exception '7a: revoked on another artist';
  exception when insufficient_privilege then null; end;
  begin perform public.revoke_artist_access(m_mgr2, x); raise exception '7b: revoked a manager';
  exception when insufficient_privilege then null; end;
  begin perform public.revoke_artist_access(m_orphan, x); raise exception '7c: revoked a former artist login as a Point Person';
  exception when insufficient_privilege then null; end;
  begin perform public.revoke_artist_access(m_other, x); raise exception '7d: revoked a person from another company';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_tm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.revoke_artist_access(m_pp, x); raise exception '7e: a plain teammate revoked someone';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select public.revoke_artist_access(m_orphan, x) into n;      -- a manager may clean up a leftover login
  if n <> 1 then raise exception '7f: a manager could not clean up a leftover login (%)', n; end if;
  reset role;

  -- 8. a Point Person removing THEMSELVES works as a single delete ... returning (what the app does)
  perform set_config('request.jwt.claims', json_build_object('sub', u_pp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  delete from public.access_grants where id = 't-pp-admin' returning id into r;
  if r.id is distinct from 't-pp-admin' then raise exception '8: a Point Person could not remove their own admin row'; end if;
  if public.has_section_access(x, 'tour', false) then raise exception '8: still has access after stepping down'; end if;
  reset role;

  raise exception 'ALL HARDENING CHECKS PASSED (rolled back)';
end $$;
