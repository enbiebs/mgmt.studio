-- Run in the Supabase SQL editor (after migrations 040, 041, 047). Ends with an intentional error
-- ("ALL TIGHTENING CHECKS PASSED (rolled back)"), so nothing it makes is kept.
do $$
declare
  mgr uuid := 'f7303cf1-f728-46a2-a861-dc7787c00d9c';   -- a real manager in the workspace below
  cid text := 'nimino-7tohmry';
  other text := 'wes-mills-f0kz7ze';
  ws uuid := '873c4c0d-be6a-4ce3-9013-4755a5596299';
  u_a uuid := gen_random_uuid();         -- team login: Projects view
  u_fin uuid := gen_random_uuid();       -- team login: Finance view
  u_tour uuid := gen_random_uuid();      -- team login: Tour view only (no Finance)
  u_artist uuid := gen_random_uuid();    -- the artist's own login
  m_a uuid; m_fin uuid; m_tour uuid; n int; r record;
begin
  insert into auth.users (id, email, instance_id, aud, role) values
    (u_a,      'test-a@example.invalid',      '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_fin,    'test-fin@example.invalid',    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_tour,   'test-tour@example.invalid',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u_artist, 'test-artist@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  delete from public.workspace_members where user_id in (u_a, u_fin, u_tour, u_artist);
  insert into public.workspace_members (id, workspace_id, user_id, role, client_id) values
    (gen_random_uuid(), ws, u_a, 'team', null), (gen_random_uuid(), ws, u_fin, 'team', null),
    (gen_random_uuid(), ws, u_tour, 'team', null), (gen_random_uuid(), ws, u_artist, 'artist', cid);
  select id into m_a from public.workspace_members where user_id = u_a;
  select id into m_fin from public.workspace_members where user_id = u_fin;
  select id into m_tour from public.workspace_members where user_id = u_tour;
  insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values
    ('t-g-tt-1', m_a, 'projects', cid, false), ('t-g-tt-2', m_fin, 'finance', cid, false), ('t-g-tt-3', m_tour, 'tour', cid, false);

  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.tasks (id, client_id, title, assignee) values ('t-tt-given', cid, 'Given to A', u_a);
  insert into public.tasks (id, client_id, title, link_type, link_id) values ('t-tt-inv', cid, 'Chase invoice', 'invoice', 'inv-1');
  insert into public.projects (id, client_id, title, type, status, created_at, from_artist, assignee_user) values ('t-tt-proj', cid, 'A project', 'content', 'in-progress', current_date, false, u_a);
  reset role;

  -- 1. given to A: A sees it and ticks it ...
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.tasks where id = 't-tt-given';
  if n <> 1 then raise exception '1: the person it is given to should see it'; end if;
  reset role;
  -- ... but once ALL of A's access is taken away, the to-do goes with it
  delete from public.access_grants where workspace_member_id = m_a;
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.tasks where id = 't-tt-given';
  if n <> 0 then raise exception '1b: someone with no access left still sees the to-do given to them'; end if;
  update public.tasks set title = 'still mine?' where id = 't-tt-given';
  get diagnostics n = row_count; if n <> 0 then raise exception '1c: someone with no access left can still change it'; end if;
  reset role;
  -- (give A the view access back for the later checks)
  insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values ('t-g-tt-4', m_a, 'projects', cid, false);

  -- 2. per-item hide and share: a to-do about an invoice follows that invoice
  perform set_config('request.jwt.claims', json_build_object('sub', u_fin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.tasks where id = 't-tt-inv';
  if n <> 1 then raise exception '2: Finance view should see a to-do about an invoice'; end if;
  reset role;
  insert into public.item_access (id, client_id, item_type, item_id, member_id, effect) values ('t-ia-1', cid, 'invoice', 'inv-1', m_fin, 'hide');
  perform set_config('request.jwt.claims', json_build_object('sub', u_fin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.tasks where id = 't-tt-inv';
  if n <> 0 then raise exception '2b: an invoice hidden from this person must hide its to-dos too'; end if;
  reset role;
  -- shared with someone who has no Finance access: they may look, not change
  insert into public.item_access (id, client_id, item_type, item_id, member_id, effect) values ('t-ia-2', cid, 'invoice', 'inv-1', m_tour, 'share');
  perform set_config('request.jwt.claims', json_build_object('sub', u_tour, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.tasks where id = 't-tt-inv';
  if n <> 1 then raise exception '2c: an invoice shared with someone should show its to-dos to them'; end if;
  update public.tasks set title = 'edited' where id = 't-tt-inv';
  get diagnostics n = row_count; if n <> 0 then raise exception '2d: sharing is look-only'; end if;
  reset role;
  delete from public.item_access where id in ('t-ia-1', 't-ia-2');
  perform set_config('request.jwt.claims', json_build_object('sub', u_tour, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.tasks where id = 't-tt-inv';
  if n <> 0 then raise exception '2e: without Finance or a share, no to-do about an invoice'; end if;
  reset role;

  -- 3. the artist's own login is turned away at once, with the same answer whoever the to-do is for
  perform set_config('request.jwt.claims', json_build_object('sub', u_artist, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin insert into public.tasks (id, client_id, title, assignee) values ('t-bad-1', cid, 'x', u_a); raise exception '3: the artist added a to-do';
  exception when insufficient_privilege then null; end;
  begin insert into public.tasks (id, client_id, title, assignee) values ('t-bad-2', cid, 'x', gen_random_uuid()); raise exception '3b: the artist added a to-do';
  exception when insufficient_privilege then if sqlerrm <> 'Not allowed' then raise exception '3c: the artist login must get a plain refusal, got: %', sqlerrm; end if; end;

  -- 4. projects: the artist can edit their own request but cannot clear or choose who has it, or move it
  update public.projects set assignee_user = null, title = 'Renamed by the artist' where id = 't-tt-proj';
  select * into r from public.projects where id = 't-tt-proj';
  if r.assignee_user is distinct from u_a then raise exception '4: the artist cleared the assignee (now %)', r.assignee_user; end if;
  if r.title <> 'Renamed by the artist' then raise exception '4b: the artist can still edit the rest of their request'; end if;
  begin update public.projects set client_id = other where id = 't-tt-proj'; raise exception '4c: a project moved to another artist';
  exception when raise_exception or insufficient_privilege then null; end;
  reset role;

  -- 5. saving an existing project or to-do does not re-check a person who has since lost access
  delete from public.access_grants where workspace_member_id = m_a;
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.projects (id, client_id, title, type, status, created_at, from_artist, assignee_user)
    values ('t-tt-proj', cid, 'A project', 'content', 'review', current_date, false, u_a)
    on conflict (id) do update set status = excluded.status, assignee_user = excluded.assignee_user;
  select status into r from public.projects where id = 't-tt-proj';
  if r.status <> 'review' then raise exception '5: the manager could not change the status of a project whose assignee lost access'; end if;
  insert into public.tasks (id, client_id, title, assignee) values ('t-tt-given', cid, 'Given to A', u_a)
    on conflict (id) do update set title = excluded.title, assignee = excluded.assignee;
  begin insert into public.tasks (id, client_id, title, assignee) values ('t-tt-new', cid, 'New for A', u_a); raise exception '5b: a NEW to-do was given to someone with no access';
  exception when raise_exception then if sqlerrm not like 'That person cannot open this artist%' then raise; end if; end;
  reset role;

  -- 6. the person it is given to can tick their own to-do with an ordinary update, even with view-only access.
  --    (An "upsert" is also an INSERT, which needs edit access, so the app saves existing to-dos with an update.)
  insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit) values ('t-g-tt-5', m_a, 'projects', cid, false);
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.tasks set done_at = now() where id = 't-tt-given';
  select * into r from public.tasks where id = 't-tt-given';
  if r.done_at is null or r.done_by is distinct from u_a then raise exception '6: the assignee could not tick their own to-do'; end if;
  update public.tasks set done_at = null where id = 't-tt-given';
  select * into r from public.tasks where id = 't-tt-given';
  if r.done_at is not null or r.done_by is not null then raise exception '6b: the assignee could not untick it'; end if;
  reset role;

  raise exception 'ALL TIGHTENING CHECKS PASSED (rolled back)';
end $$;
