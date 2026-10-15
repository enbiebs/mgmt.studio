-- Run in the Supabase SQL editor. Uses made-up logins and ends with an intentional error
-- ("ALL TASKS CHECKS PASSED (rolled back)"), so nothing it makes is kept.
do $$
declare
  mgr uuid := 'f7303cf1-f728-46a2-a861-dc7787c00d9c';   -- a real manager in the workspace below
  cid text := 'nimino-7tohmry';
  ws uuid := '873c4c0d-be6a-4ce3-9013-4755a5596299';
  u_tour uuid := gen_random_uuid();      -- team login with Tour edit access to this artist
  u_none uuid := gen_random_uuid();      -- team login with no access at all
  u_artist uuid := gen_random_uuid();    -- the artist's own login
  m_tour uuid; n int; r record;
begin
  insert into auth.users (id, email, instance_id, aud, role) values
    (u_tour,   'test-tour@example.invalid',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_none,   'test-none@example.invalid',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_artist, 'test-artist@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  delete from public.workspace_members where user_id in (u_tour, u_none, u_artist);
  insert into public.workspace_members (id, workspace_id, user_id, role, client_id) values
    (gen_random_uuid(), ws, u_tour, 'team', null),
    (gen_random_uuid(), ws, u_none, 'team', null),
    (gen_random_uuid(), ws, u_artist, 'artist', cid);
  select id into m_tour from public.workspace_members where user_id = u_tour;
  insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values ('t-grant-task', m_tour, 'tour', cid, true);

  -- 1. the manager adds to-dos; the server, not the browser, sets who wrote it and which section it belongs to
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.tasks (id, client_id, title, assignee, created_by, section)
    values ('t-task-free', cid, 'Call the promoter', u_tour, u_artist, 'finance');
  select * into r from public.tasks where id = 't-task-free';
  if r.created_by <> mgr then raise exception '1: created_by must be the signed-in person, got %', r.created_by; end if;
  if r.section is not null then raise exception '1b: a to-do that points at nothing has no section, got %', r.section; end if;
  insert into public.tasks (id, client_id, title, done_at, done_by)
    values ('t-task-forge', cid, 'Forged as done', now() - interval '3 years', u_artist);
  select * into r from public.tasks where id = 't-task-forge';
  if r.done_at < now() - interval '1 day' or r.done_by <> mgr then raise exception '1c: a forged done date/person must be replaced by the server''s'; end if;
  insert into public.tasks (id, client_id, title, link_type, link_id, section) values ('t-task-inv', cid, 'Chase invoice', 'invoice', 'inv-1', 'tour');
  select section into r from public.tasks where id = 't-task-inv';
  if r.section <> 'finance' then raise exception '1d: an invoice to-do belongs to finance, got %', r.section; end if;
  insert into public.tasks (id, client_id, title, link_type, link_id) values ('t-task-show', cid, 'Send advance', 'show', 'show-1');
  insert into public.tasks (id, client_id, title, link_type, link_id) values ('t-task-song', cid, 'Clear sample', 'song', 'song-1');
  select section into r from public.tasks where id = 't-task-song';
  if r.section <> 'music' then raise exception '1e: a song to-do belongs to music, got %', r.section; end if;

  -- 2. bad shapes are refused
  begin insert into public.tasks (id, client_id, title) values ('t-bad-1', cid, '   '); raise exception '2: blank title accepted';
  exception when check_violation then null; end;
  begin insert into public.tasks (id, client_id, title, link_type) values ('t-bad-2', cid, 'x', 'show'); raise exception '2b: link type without an id accepted';
  exception when check_violation then null; end;
  begin insert into public.tasks (id, client_id, title, link_type, link_id) values ('t-bad-3', cid, 'x', 'spaceship', '1'); raise exception '2c: unknown link type accepted';
  exception when check_violation then null; end;

  -- 3. it can only be given to someone who can open this artist
  begin insert into public.tasks (id, client_id, title, assignee) values ('t-bad-4', cid, 'x', u_none); raise exception '3: given to a login with no access';
  exception when raise_exception then if sqlerrm not like 'That person cannot open this artist%' then raise; end if; end;
  begin insert into public.tasks (id, client_id, title, assignee) values ('t-bad-5', cid, 'x', u_artist); raise exception '3b: given to the artist login';
  exception when raise_exception then if sqlerrm not like 'That person cannot open this artist%' then raise; end if; end;
  reset role;

  -- 4. the teammate with Tour access: sees what is given to them and what points at Tour, nothing else
  perform set_config('request.jwt.claims', json_build_object('sub', u_tour, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.tasks where client_id = cid and id like 't-task-%';
  if n <> 2 then raise exception '4: should see exactly the given-to-me and the Tour to-do, saw %', n; end if;
  if exists (select 1 from public.tasks where id in ('t-task-inv', 't-task-song')) then raise exception '4b: must not see Finance or Music to-dos'; end if;

  -- 5. they can check off the one given to them (even with no Projects access) and the server records them
  update public.tasks set done_at = now() where id = 't-task-free';
  get diagnostics n = row_count; if n <> 1 then raise exception '5: assignee should be able to check it off'; end if;
  select * into r from public.tasks where id = 't-task-free';
  if r.done_by <> u_tour then raise exception '5b: done_by must be the person who checked it, got %', r.done_by; end if;
  update public.tasks set done_at = null where id = 't-task-free';
  select * into r from public.tasks where id = 't-task-free';
  if r.done_at is not null or r.done_by is not null then raise exception '5c: unchecking must clear it'; end if;
  begin update public.tasks set client_id = 'someone-else' where id = 't-task-free'; raise exception '5d: moved to another artist';
  exception when raise_exception then if sqlerrm not like 'A to-do cannot move%' then raise; end if;
            when foreign_key_violation then null; end;

  -- 6. with Tour edit they can add a Tour to-do (given to themselves) but not a Finance one
  insert into public.tasks (id, client_id, title, link_type, link_id, assignee) values ('t-task-tour2', cid, 'Book van', 'show', 'show-1', u_tour);
  begin insert into public.tasks (id, client_id, title, link_type, link_id) values ('t-task-fin2', cid, 'Pay vendor', 'expense', 'exp-1'); raise exception '6: Finance to-do added without Finance access';
  exception when insufficient_privilege then null; end;
  begin insert into public.tasks (id, client_id, title) values ('t-task-free2', cid, 'No Projects access'); raise exception '6b: free to-do added without Projects access';
  exception when insufficient_privilege then null; end;
  -- ...and cannot remove or change what they were not given and cannot edit
  delete from public.tasks where id = 't-task-inv';
  get diagnostics n = row_count; if n <> 0 then raise exception '6c: must not delete a Finance to-do'; end if;
  -- the team login may remove the one it wrote itself
  delete from public.tasks where id = 't-task-tour2';
  get diagnostics n = row_count; if n <> 1 then raise exception '6d: should delete its own to-do'; end if;

  -- 7. the list of teammates: a manager-side person gets it, with names from the login when there is no person record
  select count(*) into n from public.workspace_people() where user_id = u_tour and label = 'test-tour@example.invalid' and not all_clients and client_ids = array[cid];
  if n <> 1 then raise exception '7: workspace_people should list the Tour teammate with their one artist, got %', n; end if;
  select count(*) into n from public.workspace_people() where user_id = u_artist;
  if n <> 0 then raise exception '7b: artist logins must not be listed'; end if;
  reset role;

  -- 8. a login with no access sees nothing and cannot add
  perform set_config('request.jwt.claims', json_build_object('sub', u_none, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.tasks where client_id = cid;
  if n <> 0 then raise exception '8: no access must see nothing'; end if;
  begin insert into public.tasks (id, client_id, title) values ('t-task-x', cid, 'x'); raise exception '8b: should be refused';
  exception when insufficient_privilege then null; end;
  reset role;

  -- 9. the artist's own login sees nothing, adds nothing, and is told nothing about the team
  perform set_config('request.jwt.claims', json_build_object('sub', u_artist, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.tasks where client_id = cid;
  if n <> 0 then raise exception '9: the artist login must not see the management to-dos'; end if;
  begin insert into public.tasks (id, client_id, title) values ('t-task-y', cid, 'y'); raise exception '9b: artist login added a to-do';
  exception when insufficient_privilege then null; end;
  select count(*) into n from public.workspace_people();
  if n <> 0 then raise exception '9c: the artist login must not get the team list, got %', n; end if;
  reset role;

  -- 10. the public (not signed in) sees nothing at all
  set local role anon;
  begin perform 1 from public.tasks limit 1; raise exception '10: anon must not read';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.workspace_people(); raise exception '10b: anon must not list the team';
  exception when insufficient_privilege then null; end;
  reset role;

  raise exception 'ALL TASKS CHECKS PASSED (rolled back)';
end $$;
