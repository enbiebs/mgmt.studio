-- Run in the Supabase SQL editor (after migrations 040, 041 and 044). Ends with an intentional error
-- ("ALL LOCK-DOWN CHECKS PASSED (rolled back)"), so nothing it makes is kept.
do $$
declare
  mgr uuid := 'f7303cf1-f728-46a2-a861-dc7787c00d9c';   -- a real manager in the workspace
  cid text := 'nimino-7tohmry';
  r record; n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  -- tasks_guard still fills in the author and the section
  insert into public.tasks (id, client_id, title, link_type, link_id) values ('t-lock-task', cid, 'Chase invoice', 'invoice', 'inv-1');
  select * into r from public.tasks where id = 't-lock-task';
  if r.created_by <> mgr or r.section <> 'finance' then raise exception '1: tasks_guard stopped working (author %, section %)', r.created_by, r.section; end if;
  -- projects_guard still checks who a project may be given to
  insert into public.projects (id, client_id, title, type, status, created_at, from_artist, assignee_user) values ('t-lock-proj', cid, 'P', 'content', 'in-progress', current_date, false, mgr);
  begin update public.projects set assignee_user = gen_random_uuid() where id = 't-lock-proj'; raise exception '2: an unknown person was accepted as assignee';
  exception when raise_exception then if sqlerrm not like 'That person cannot open this artist%' then raise; end if; end;
  -- agenda_points_guard still sets the author
  insert into public.agenda_points (id, client_id, item_type, item_id, text) values ('t-lock-pt', cid, 'project', 't-lock-proj', 'a point');
  select * into r from public.agenda_points where id = 't-lock-pt';
  if r.created_by <> mgr then raise exception '3: agenda_points_guard stopped working'; end if;
  -- the cleanup trigger still removes the points with the item
  delete from public.projects where id = 't-lock-proj';
  reset role;
  select count(*) into n from public.agenda_points where id = 't-lock-pt';
  if n <> 0 then raise exception '4: the cleanup trigger stopped working'; end if;
  -- and nobody can call the functions directly any more
  set local role anon;
  begin perform public.tasks_guard(); raise exception '5: anon can still call tasks_guard';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform public.agenda_points_cleanup(); raise exception '6: signed-in users can still call agenda_points_cleanup';
  exception when insufficient_privilege then null; end;
  reset role;
  raise exception 'ALL LOCK-DOWN CHECKS PASSED (rolled back)';
end $$;
