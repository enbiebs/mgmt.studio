-- Run in the Supabase SQL editor. Uses made-up logins and ends with an intentional error
-- ("ALL PROJECT ASSIGNEE CHECKS PASSED (rolled back)"), so nothing it makes is kept.
do $$
declare
  mgr uuid := 'f7303cf1-f728-46a2-a861-dc7787c00d9c';   -- a real manager in the workspace below
  cid text := 'nimino-7tohmry';
  other text := 'wes-mills-f0kz7ze';                    -- a second artist in the same workspace
  ws uuid := '873c4c0d-be6a-4ce3-9013-4755a5596299';
  u_team uuid := gen_random_uuid();      -- team login with access to the first artist only
  u_none uuid := gen_random_uuid();      -- team login with no access at all
  u_artist uuid := gen_random_uuid();    -- the first artist's own login
  m_team uuid; n int; r record;
begin
  insert into auth.users (id, email, instance_id, aud, role) values
    (u_team,   'test-team@example.invalid',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_none,   'test-none@example.invalid',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_artist, 'test-artist@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  delete from public.workspace_members where user_id in (u_team, u_none, u_artist);
  insert into public.workspace_members (id, workspace_id, user_id, role, client_id) values
    (gen_random_uuid(), ws, u_team, 'team', null),
    (gen_random_uuid(), ws, u_none, 'team', null),
    (gen_random_uuid(), ws, u_artist, 'artist', cid);
  select id into m_team from public.workspace_members where user_id = u_team;
  insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values ('t-grant-proj', m_team, 'projects', cid, true);

  -- 1. the manager can give a project to a teammate who can open this artist (and to themselves)
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.projects (id, client_id, title, type, status, created_at, from_artist, assignee_user)
    values ('t-proj-1', cid, 'Press photos', 'content', 'in-progress', current_date, false, u_team);
  select * into r from public.projects where id = 't-proj-1';
  if r.assignee_user <> u_team then raise exception '1: should be given to the teammate'; end if;
  update public.projects set assignee_user = mgr where id = 't-proj-1';
  get diagnostics n = row_count; if n <> 1 then raise exception '1b: manager should be able to reassign'; end if;
  update public.projects set assignee_user = null where id = 't-proj-1';
  get diagnostics n = row_count; if n <> 1 then raise exception '1c: manager should be able to unassign'; end if;

  -- 2. never to someone who cannot open the artist, nor to an artist login, nor to a teammate of another artist only
  begin update public.projects set assignee_user = u_none where id = 't-proj-1'; raise exception '2: given to a login with no access';
  exception when raise_exception then if sqlerrm not like 'That person cannot open this artist%' then raise; end if; end;
  begin update public.projects set assignee_user = u_artist where id = 't-proj-1'; raise exception '2b: given to the artist login';
  exception when raise_exception then if sqlerrm not like 'That person cannot open this artist%' then raise; end if; end;
  insert into public.projects (id, client_id, title, type, status, created_at, from_artist) values ('t-proj-2', other, 'Other artist', 'show', 'in-progress', current_date, false);
  begin update public.projects set assignee_user = u_team where id = 't-proj-2'; raise exception '2c: given to a teammate who has no access to this artist';
  exception when raise_exception then if sqlerrm not like 'That person cannot open this artist%' then raise; end if; end;
  reset role;

  -- 3. the artist's own login can submit a request, but cannot choose who gets it or change who has it
  perform set_config('request.jwt.claims', json_build_object('sub', u_artist, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.projects (id, client_id, title, type, status, created_at, from_artist, assignee_user)
    values ('t-proj-3', cid, 'Can I get a press release?', 'content', 'submitted', current_date, true, mgr);
  select * into r from public.projects where id = 't-proj-3';
  if r.assignee_user is not null then raise exception '3: an artist request must arrive unassigned, got %', r.assignee_user; end if;
  reset role;
  update public.projects set assignee_user = u_team where id = 't-proj-3';
  perform set_config('request.jwt.claims', json_build_object('sub', u_artist, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.projects set assignee_user = mgr, title = 'Renamed by the artist' where id = 't-proj-3';
  select * into r from public.projects where id = 't-proj-3';
  if r.assignee_user <> u_team then raise exception '3b: the artist must not be able to reassign, got %', r.assignee_user; end if;
  if r.title <> 'Renamed by the artist' then raise exception '3c: the artist can still edit the rest of their own request'; end if;
  reset role;

  -- 4. the old placeholder column is untouched and nothing breaks for a project with no one assigned
  update public.projects set assignee = 'PH' where id = 't-proj-2';
  select count(*) into n from public.projects where id = 't-proj-2' and assignee = 'PH' and assignee_user is null;
  if n <> 1 then raise exception '4: legacy value should be kept as is'; end if;

  raise exception 'ALL PROJECT ASSIGNEE CHECKS PASSED (rolled back)';
end $$;
