-- Run in the Supabase SQL editor (after 044 and 047). Ends with an intentional error
-- ("ALL AGENDA HARDENING CHECKS PASSED (rolled back)"), so nothing it makes is kept.
do $$
declare
  mgr uuid := 'f7303cf1-f728-46a2-a861-dc7787c00d9c';   -- a real manager
  cid text := 'nimino-7tohmry';
  ws uuid := '873c4c0d-be6a-4ce3-9013-4755a5596299';
  u_a uuid := gen_random_uuid();         -- team login: Projects view, given a to-do
  u_fin uuid := gen_random_uuid();       -- team login: Finance view
  u_artist uuid := gen_random_uuid();    -- the artist's own login
  m_a uuid; m_fin uuid; n int; r record;
begin
  insert into auth.users (id, email, instance_id, aud, role) values
    (u_a,      'test-a@example.invalid',      '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_fin,    'test-fin@example.invalid',    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_artist, 'test-artist@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  delete from public.workspace_members where user_id in (u_a, u_fin, u_artist);
  insert into public.workspace_members (id, workspace_id, user_id, role, client_id) values
    (gen_random_uuid(), ws, u_a, 'team', null), (gen_random_uuid(), ws, u_fin, 'team', null), (gen_random_uuid(), ws, u_artist, 'artist', cid);
  select id into m_a from public.workspace_members where user_id = u_a;
  select id into m_fin from public.workspace_members where user_id = u_fin;
  insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values
    ('t-g-ah-1', m_a, 'projects', cid, false), ('t-g-ah-2', m_fin, 'finance', cid, true);

  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.projects (id, client_id, title, type, status, created_at, from_artist) values ('t-ah-proj', cid, 'P', 'content', 'in-progress', current_date, false);
  insert into public.tasks (id, client_id, title, assignee) values ('t-ah-task', cid, 'Given to A', u_a);
  insert into public.tasks (id, client_id, title, link_type, link_id) values ('t-ah-inv', cid, 'Chase invoice', 'invoice', 'inv-1');
  insert into public.agenda_points (id, client_id, item_type, item_id, text) values ('t-ah-pt-task', cid, 'task', 't-ah-task', 'Ask about the advance');
  insert into public.agenda_points (id, client_id, item_type, item_id, text) values ('t-ah-pt-inv', cid, 'task', 't-ah-inv', 'Quote the number');

  -- 1. a full agenda (60 points) can still be ticked, with an ordinary save (upsert) too
  for n in 1..60 loop insert into public.agenda_points (id, client_id, item_type, item_id, text) values ('t-ah-fill-' || n, cid, 'project', 't-ah-proj', 'p' || n); end loop;
  begin insert into public.agenda_points (id, client_id, item_type, item_id, text) values ('t-ah-61', cid, 'project', 't-ah-proj', 'one too many'); raise exception '1: a 61st point was accepted';
  exception when raise_exception then if sqlerrm not like 'An agenda can have at most 60 points%' then raise; end if; end;
  update public.agenda_points set done = true where id = 't-ah-fill-1';
  get diagnostics n = row_count; if n <> 1 then raise exception '1b: could not tick a point on a full agenda'; end if;
  insert into public.agenda_points (id, client_id, item_type, item_id, text, done) values ('t-ah-fill-2', cid, 'project', 't-ah-proj', 'p2', true)
    on conflict (id) do update set done = excluded.done;
  select done into r from public.agenda_points where id = 't-ah-fill-2';
  if r.done is not true then raise exception '1c: the upsert of an existing point on a full agenda failed'; end if;
  reset role;

  -- 2. the artist's own login is turned away with a plain answer, even for a project it can see
  perform set_config('request.jwt.claims', json_build_object('sub', u_artist, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin insert into public.agenda_points (id, client_id, item_type, item_id, text) values ('t-ah-bad', cid, 'project', 't-ah-proj', 'x'); raise exception '2: the artist added a point';
  exception when insufficient_privilege then if sqlerrm <> 'Not allowed' then raise exception '2b: expected a plain refusal, got: %', sqlerrm; end if; end;
  select count(*) into n from public.agenda_points where client_id = cid;
  if n <> 0 then raise exception '2c: the artist login saw % agenda points', n; end if;
  reset role;

  -- 3. the person a to-do is given to sees and adds to its agenda while they have access ...
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.agenda_points where id = 't-ah-pt-task';
  if n <> 1 then raise exception '3: the assignee should see the agenda of their to-do'; end if;
  insert into public.agenda_points (id, client_id, item_type, item_id, text) values ('t-ah-pt-task2', cid, 'task', 't-ah-task', 'Added by the assignee');
  reset role;
  -- ... and loses all of it when their access is taken away
  delete from public.access_grants where workspace_member_id = m_a;
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.agenda_points where item_id = 't-ah-task';
  if n <> 0 then raise exception '3b: someone with no access left still sees the agenda of a to-do given to them'; end if;
  begin insert into public.agenda_points (id, client_id, item_type, item_id, text) values ('t-ah-bad2', cid, 'task', 't-ah-task', 'x'); raise exception '3c: added a point without access';
  exception when insufficient_privilege then null; end;
  reset role;

  -- 4. an agenda follows its to-do's hidden items: an invoice hidden from this person hides the to-do's agenda
  perform set_config('request.jwt.claims', json_build_object('sub', u_fin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.agenda_points where id = 't-ah-pt-inv';
  if n <> 1 then raise exception '4: Finance should see the agenda of an invoice to-do'; end if;
  reset role;
  insert into public.item_access (id, client_id, item_type, item_id, member_id, effect) values ('t-ah-ia', cid, 'invoice', 'inv-1', m_fin, 'hide');
  perform set_config('request.jwt.claims', json_build_object('sub', u_fin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.agenda_points where id = 't-ah-pt-inv';
  if n <> 0 then raise exception '4b: the agenda of a to-do about a hidden invoice is still visible'; end if;
  reset role;

  raise exception 'ALL AGENDA HARDENING CHECKS PASSED (rolled back)';
end $$;
