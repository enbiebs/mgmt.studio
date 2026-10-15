-- Run in the Supabase SQL editor. Uses made-up logins and ends with an intentional error
-- ("ALL AGENDA CHECKS PASSED (rolled back)"), so nothing it makes is kept.
do $$
declare
  mgr uuid := 'f7303cf1-f728-46a2-a861-dc7787c00d9c';   -- a real manager in the workspace below
  cid text := 'nimino-7tohmry';
  other text := 'wes-mills-f0kz7ze';
  ws uuid := '873c4c0d-be6a-4ce3-9013-4755a5596299';
  u_edit uuid := gen_random_uuid();      -- team login with Projects EDIT for this artist
  u_view uuid := gen_random_uuid();      -- team login with Projects VIEW for this artist
  u_none uuid := gen_random_uuid();      -- team login with no access
  u_artist uuid := gen_random_uuid();    -- the artist's own login
  m_edit uuid; m_view uuid; n int; r record;
begin
  insert into auth.users (id, email, instance_id, aud, role) values
    (u_edit,   'test-edit@example.invalid',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_view,   'test-view@example.invalid',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_none,   'test-none@example.invalid',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_artist, 'test-artist@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  delete from public.workspace_members where user_id in (u_edit, u_view, u_none, u_artist);
  insert into public.workspace_members (id, workspace_id, user_id, role, client_id) values
    (gen_random_uuid(), ws, u_edit, 'team', null), (gen_random_uuid(), ws, u_view, 'team', null),
    (gen_random_uuid(), ws, u_none, 'team', null), (gen_random_uuid(), ws, u_artist, 'artist', cid);
  select id into m_edit from public.workspace_members where user_id = u_edit;
  select id into m_view from public.workspace_members where user_id = u_view;
  insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values
    ('t-g-ag-1', m_edit, 'projects', cid, true), ('t-g-ag-2', m_view, 'projects', cid, false);

  -- as the manager: a project, a to-do given to the editor, and a to-do about money nobody else can see
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.projects (id, client_id, title, type, status, created_at, from_artist) values ('t-ag-proj', cid, 'Press run', 'content', 'in-progress', current_date, false);
  insert into public.projects (id, client_id, title, type, status, created_at, from_artist) values ('t-ag-proj-other', other, 'Other', 'content', 'in-progress', current_date, false);
  insert into public.tasks (id, client_id, title, assignee) values ('t-ag-task', cid, 'Call the label', u_edit);
  insert into public.tasks (id, client_id, title, link_type, link_id) values ('t-ag-money', cid, 'Chase invoice', 'invoice', 'inv-1');

  -- 1. the manager writes agendas; the server sets who wrote each point
  insert into public.agenda_points (id, client_id, item_type, item_id, text, created_by) values ('t-pt-1', cid, 'project', 't-ag-proj', 'Agree the schedule', u_artist);
  insert into public.agenda_points (id, client_id, item_type, item_id, text) values ('t-pt-2', cid, 'task', 't-ag-task', 'Ask about the advance');
  insert into public.agenda_points (id, client_id, item_type, item_id, text) values ('t-pt-3', cid, 'task', 't-ag-money', 'Quote the invoice number');
  select * into r from public.agenda_points where id = 't-pt-1';
  if r.created_by <> mgr then raise exception '1: created_by must be the signed-in person, got %', r.created_by; end if;

  -- 2. bad shapes are refused
  begin insert into public.agenda_points (id, client_id, item_type, item_id, text) values ('t-bad-1', cid, 'project', 't-ag-proj', '  '); raise exception '2: blank text accepted';
  exception when check_violation then null; end;
  begin insert into public.agenda_points (id, client_id, item_type, item_id, text) values ('t-bad-2', cid, 'song', 'x', 'x'); raise exception '2b: unknown item type accepted';
  exception when check_violation or insufficient_privilege then null; end;
  -- a point cannot hang off an item that belongs to a different artist
  begin insert into public.agenda_points (id, client_id, item_type, item_id, text) values ('t-bad-3', cid, 'project', 't-ag-proj-other', 'x'); raise exception '3: pointed at another artist''s project';
  exception when insufficient_privilege then null; end;
  begin insert into public.agenda_points (id, client_id, item_type, item_id, text) values ('t-bad-4', cid, 'project', 'does-not-exist', 'x'); raise exception '3b: pointed at nothing';
  exception when insufficient_privilege then null; end;
  -- at most 60 points on one item
  for n in 1..59 loop insert into public.agenda_points (id, client_id, item_type, item_id, text) values ('t-fill-' || n, cid, 'project', 't-ag-proj', 'p' || n); end loop;
  begin insert into public.agenda_points (id, client_id, item_type, item_id, text) values ('t-fill-61', cid, 'project', 't-ag-proj', 'one too many'); raise exception '4: a 61st point was accepted';
  exception when raise_exception then if sqlerrm not like 'An agenda can have at most 60 points%' then raise; end if; end;
  delete from public.agenda_points where id like 't-fill-%';
  reset role;

  -- 5. Projects EDIT: reads and writes the project's agenda; sees the to-do given to them but NOT the money one
  perform set_config('request.jwt.claims', json_build_object('sub', u_edit, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.agenda_points where id in ('t-pt-1', 't-pt-2', 't-pt-3');
  if n <> 2 then raise exception '5: should see the project agenda and the agenda of the to-do given to them, saw %', n; end if;
  insert into public.agenda_points (id, client_id, item_type, item_id, text) values ('t-pt-4', cid, 'project', 't-ag-proj', 'Added by the editor');
  update public.agenda_points set done = true where id = 't-pt-1';
  get diagnostics n = row_count; if n <> 1 then raise exception '5b: editor should tick a point'; end if;
  insert into public.agenda_points (id, client_id, item_type, item_id, text) values ('t-pt-5', cid, 'task', 't-ag-task', 'Added by the assignee');
  -- a point cannot be moved to another item or artist
  update public.agenda_points set item_id = 't-ag-proj-other', client_id = other where id = 't-pt-4';
  select * into r from public.agenda_points where id = 't-pt-4';
  if r.item_id <> 't-ag-proj' or r.client_id <> cid then raise exception '5c: a point moved to another item'; end if;
  reset role;

  -- 6. Projects VIEW: can read the project's agenda, cannot change it
  perform set_config('request.jwt.claims', json_build_object('sub', u_view, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.agenda_points where item_type = 'project' and item_id = 't-ag-proj';
  if n < 2 then raise exception '6: a viewer should read the project agenda'; end if;
  begin insert into public.agenda_points (id, client_id, item_type, item_id, text) values ('t-bad-5', cid, 'project', 't-ag-proj', 'x'); raise exception '6b: a viewer added a point';
  exception when insufficient_privilege then null; end;
  update public.agenda_points set done = false where id = 't-pt-1';
  get diagnostics n = row_count; if n <> 0 then raise exception '6c: a viewer changed a point'; end if;
  delete from public.agenda_points where id = 't-pt-1';
  get diagnostics n = row_count; if n <> 0 then raise exception '6d: a viewer removed a point'; end if;
  reset role;

  -- 7. no access, and the artist's own login (who CAN see the project itself): no agenda at all
  perform set_config('request.jwt.claims', json_build_object('sub', u_none, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.agenda_points where client_id = cid;
  if n <> 0 then raise exception '7: no access must see nothing'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u_artist, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.projects where id = 't-ag-proj';
  if n <> 1 then raise exception '8: (setup) the artist login should see its project'; end if;
  select count(*) into n from public.agenda_points where client_id = cid;
  if n <> 0 then raise exception '8b: the artist login must not see the team''s agenda, saw %', n; end if;
  begin insert into public.agenda_points (id, client_id, item_type, item_id, text) values ('t-bad-6', cid, 'project', 't-ag-proj', 'x'); raise exception '8c: the artist added a point';
  exception when insufficient_privilege then null; end;
  reset role;

  -- 9. anon sees nothing
  set local role anon;
  begin perform 1 from public.agenda_points limit 1; raise exception '9: anon must not read';
  exception when insufficient_privilege then null; end;
  reset role;

  -- 10. removing the project or to-do removes its agenda
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  delete from public.projects where id = 't-ag-proj';
  delete from public.tasks where id = 't-ag-task';
  reset role;
  select count(*) into n from public.agenda_points where item_id in ('t-ag-proj', 't-ag-task');
  if n <> 0 then raise exception '10: agenda points were left behind, %', n; end if;
  select count(*) into n from public.agenda_points where item_id = 't-ag-money';
  if n <> 1 then raise exception '10b: an unrelated agenda must stay'; end if;

  raise exception 'ALL AGENDA CHECKS PASSED (rolled back)';
end $$;
