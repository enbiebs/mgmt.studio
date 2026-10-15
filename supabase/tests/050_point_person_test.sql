-- Run in the Supabase SQL editor (after migration 050). Ends with an intentional error
-- ("ALL POINT PERSON CHECKS PASSED (rolled back)"), so nothing it makes is kept.
do $$
declare
  mgr uuid := 'f7303cf1-f728-46a2-a861-dc7787c00d9c';   -- a real manager in the workspace below
  x text := 'nimino-7tohmry';                            -- the artist the Point Person runs
  y text := 'wes-mills-f0kz7ze';                         -- another artist they must never touch
  ws uuid := '873c4c0d-be6a-4ce3-9013-4755a5596299';
  u_pp uuid := gen_random_uuid();        -- Point Person for X
  u_tm uuid := gen_random_uuid();        -- ordinary teammate with no access yet
  u_tour uuid := gen_random_uuid();      -- teammate with Tour (view) on X
  u_mgr2 uuid := gen_random_uuid();      -- a second manager
  u_artist uuid := gen_random_uuid();    -- X's own login
  m_pp uuid; m_tm uuid; m_tour uuid; m_mgr2 uuid; m_artist uuid;
  s text; n int; r record; ok boolean;
begin
  insert into auth.users (id, email, instance_id, aud, role) values
    (u_pp,     'test-pp@example.invalid',     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_tm,     'test-tm@example.invalid',     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_tour,   'test-tour@example.invalid',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_mgr2,   'test-mgr2@example.invalid',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_artist, 'test-artist@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  delete from public.workspace_members where user_id in (u_pp, u_tm, u_tour, u_mgr2, u_artist);
  insert into public.workspace_members (id, workspace_id, user_id, role, client_id) values
    (gen_random_uuid(), ws, u_pp, 'team', null), (gen_random_uuid(), ws, u_tm, 'team', null),
    (gen_random_uuid(), ws, u_tour, 'team', null), (gen_random_uuid(), ws, u_mgr2, 'manager', null),
    (gen_random_uuid(), ws, u_artist, 'artist', x);
  select id into m_pp from public.workspace_members where user_id = u_pp;
  select id into m_tm from public.workspace_members where user_id = u_tm;
  select id into m_tour from public.workspace_members where user_id = u_tour;
  select id into m_mgr2 from public.workspace_members where user_id = u_mgr2;
  select id into m_artist from public.workspace_members where user_id = u_artist;

  -- 0. a manager makes someone a Point Person for X; the shape rules hold even for managers
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values ('t-pp-admin', m_pp, 'admin', x, true);
  insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values ('t-pp-tour', m_tour, 'tour', x, false);
  begin insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values ('t-bad1', m_tm, 'admin', x, false);
    raise exception '0a: a view-only Point Person was accepted';
  exception when check_violation then null; end;
  begin insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values ('t-bad2', m_tm, 'admin', null, true);
    raise exception '0b: a Point Person for every artist was accepted';
  exception when check_violation then null; end;
  reset role;

  -- 1. a Point Person passes every section on THEIR artist (view and edit) except the vault, and nothing on another artist
  perform set_config('request.jwt.claims', json_build_object('sub', u_pp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  foreach s in array array['music','tour','content','finance','team','projects','analytics','legal','profile','fandom'] loop
    if not public.has_section_access(x, s, false) then raise exception '1: a Point Person cannot see %', s; end if;
    if not public.has_section_access(x, s, true) then raise exception '1: a Point Person cannot change %', s; end if;
    if public.has_section_access(y, s, false) or public.has_section_access(y, s, true) then raise exception '1: a Point Person reaches % on ANOTHER artist', s; end if;
  end loop;
  if public.has_section_access(x, 'vault', false) or public.has_section_access(x, 'vault', true) then raise exception '1: a Point Person reaches the vault without being given it'; end if;
  if not public.is_artist_admin(x) then raise exception '1: is_artist_admin should say yes for their own artist'; end if;
  if public.is_artist_admin(y) then raise exception '1: is_artist_admin says yes for another artist'; end if;
  reset role;

  -- 2. ordinary access is unchanged: Tour view is Tour view, nothing more
  perform set_config('request.jwt.claims', json_build_object('sub', u_tour, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if not public.has_section_access(x, 'tour', false) then raise exception '2: Tour view lost'; end if;
  if public.has_section_access(x, 'tour', true) then raise exception '2: Tour view became edit'; end if;
  if public.has_section_access(x, 'finance', false) then raise exception '2: Tour view reaches Finance'; end if;
  if public.is_artist_admin(x) then raise exception '2: a Tour viewer counts as a Point Person'; end if;
  -- ... and cannot change anyone's access
  begin insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values ('t-no1', m_tm, 'tour', x, false);
    raise exception '2: a non-admin added access';
  exception when insufficient_privilege then null; end;
  reset role;

  -- 3. the Point Person gives a teammate access, changes it, and takes it away
  perform set_config('request.jwt.claims', json_build_object('sub', u_pp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values ('t-tm-tour', m_tm, 'tour', x, false);
  insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values ('t-tm-fin', m_tm, 'finance', x, true);
  update public.access_grants set can_edit = true where id = 't-tm-tour';
  get diagnostics n = row_count; if n <> 1 then raise exception '3: could not change a teammate''s level'; end if;
  delete from public.access_grants where id = 't-tm-fin';
  get diagnostics n = row_count; if n <> 1 then raise exception '3: could not take access away'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_tm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if not public.has_section_access(x, 'tour', true) then raise exception '3: the teammate did not get what the Point Person gave'; end if;
  if public.has_section_access(x, 'finance', false) then raise exception '3: the teammate kept access that was taken away'; end if;
  reset role;

  -- 4. what a Point Person can NEVER do
  perform set_config('request.jwt.claims', json_build_object('sub', u_pp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values ('t-n1', m_tm, 'tour', y, false);
    raise exception '4a: gave access to ANOTHER artist';
  exception when insufficient_privilege then null; end;
  begin insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values ('t-n2', m_tm, 'tour', null, false);
    raise exception '4b: gave access to ALL artists';
  exception when insufficient_privilege then null; end;
  begin insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values ('t-n3', m_tm, 'vault', x, false);
    raise exception '4c: handed out the vault';
  exception when insufficient_privilege then null; end;
  begin insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values ('t-n4', m_mgr2, 'tour', x, false);
    raise exception '4d: changed a manager';
  exception when insufficient_privilege then null; end;
  begin insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values ('t-n5', m_artist, 'finance', x, true);
    raise exception '4e: gave the artist''s own login more access';
  exception when insufficient_privilege then null; end;
  -- moving a row to another artist is refused too
  begin update public.access_grants set client_id = y where id = 't-tm-tour';
    raise exception '4f: moved a grant to another artist';
  exception when insufficient_privilege then null; end;
  reset role;

  -- 5. what a Point Person can see: the rows for their artist, never other artists', company-wide, or vault rows
  insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values
    ('t-oth-y', m_tm, 'tour', y, false), ('t-oth-all', m_tm, 'legal', null, false), ('t-oth-vault', m_tm, 'vault', x, false);
  perform set_config('request.jwt.claims', json_build_object('sub', u_pp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.access_grants where id in ('t-tm-tour', 't-pp-tour', 't-pp-admin');
  if n <> 3 then raise exception '5: cannot see the grants for their own artist (%)', n; end if;
  select count(*) into n from public.access_grants where id in ('t-oth-y', 't-oth-all', 't-oth-vault');
  if n <> 0 then raise exception '5: can see grants for another artist, company-wide, or the vault (%)', n; end if;
  delete from public.access_grants where id = 't-oth-vault';
  get diagnostics n = row_count; if n <> 0 then raise exception '5: removed a vault grant'; end if;
  reset role;

  -- 6. an explicit vault grant from a manager is honored (and a Point Person cannot undo it)
  insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values ('t-pp-vault', m_pp, 'vault', x, false);
  perform set_config('request.jwt.claims', json_build_object('sub', u_pp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if not public.has_section_access(x, 'vault', false) then raise exception '6: an explicit vault grant stopped working'; end if;
  delete from public.access_grants where id = 't-pp-vault';
  get diagnostics n = row_count; if n <> 0 then raise exception '6: a Point Person removed a vault grant'; end if;
  reset role;
  delete from public.access_grants where id = 't-pp-vault';

  -- 7. Point People can make other Point People, and take each other's (and their own) away
  perform set_config('request.jwt.claims', json_build_object('sub', u_pp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values ('t-tm-admin', m_tm, 'admin', x, true);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_tm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if not public.has_section_access(x, 'finance', true) then raise exception '7: the new Point Person cannot do everything'; end if;
  delete from public.access_grants where id = 't-pp-admin';
  get diagnostics n = row_count; if n <> 1 then raise exception '7: could not take another Point Person''s access away'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_pp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if public.has_section_access(x, 'tour', false) then raise exception '7: a removed Point Person still has access'; end if;
  reset role;

  -- 8. managers are unaffected: they still see every grant and can still change anything
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.access_grants where id in ('t-tm-tour', 't-tm-admin', 't-oth-y', 't-oth-all', 't-oth-vault');
  if n <> 5 then raise exception '8: a manager lost sight of grants (%)', n; end if;
  update public.access_grants set can_edit = false where id = 't-oth-all';
  get diagnostics n = row_count; if n <> 1 then raise exception '8: a manager could not change a grant'; end if;
  if (select count(*) from public.workspace_people() where user_id = u_tm and x = any(client_ids)) <> 1 then raise exception '8: the people list misses a Point Person''s artist'; end if;
  reset role;

  -- 9. the artist's own login is unchanged
  perform set_config('request.jwt.claims', json_build_object('sub', u_artist, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if not public.has_section_access(x, 'tour', false) then raise exception '9: the artist lost view access'; end if;
  if public.has_section_access(x, 'tour', true) then raise exception '9: the artist can edit Tour'; end if;
  if not public.has_section_access(x, 'projects', true) then raise exception '9: the artist cannot edit their own projects'; end if;
  if public.is_artist_admin(x) then raise exception '9: the artist counts as a Point Person'; end if;
  reset role;

  -- 10. signed-out callers cannot use the helper
  set local role anon;
  begin perform public.is_artist_admin(x); raise exception '10: signed-out callers can call is_artist_admin';
  exception when insufficient_privilege then null; end;
  reset role;

  raise exception 'ALL POINT PERSON CHECKS PASSED (rolled back)';
end $$;
