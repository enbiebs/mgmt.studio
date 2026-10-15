-- Run in the Supabase SQL editor. Ends with an intentional error ("ALL AUTO KEY CHECKS PASSED (rolled back)").
do $$
declare
  mgr uuid := 'f7303cf1-f728-46a2-a861-dc7787c00d9c';   -- a real manager
  cid text := 'nimino-7tohmry';
  n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.tasks (id, client_id, title, source, auto_key, link_type, link_id)
    values ('t-auto-1', cid, 'Start the advance', 'auto', 'advance:show-1', 'show', 'show-1');
  -- the same key date cannot be taken twice for the same artist
  begin
    insert into public.tasks (id, client_id, title, source, auto_key, link_type, link_id)
      values ('t-auto-2', cid, 'Start the advance (again)', 'auto', 'advance:show-1', 'show', 'show-1');
    raise exception '1: the same key date was taken twice';
  exception when unique_violation then null; end;
  -- a different key date, and an ordinary to-do (no key), are fine
  insert into public.tasks (id, client_id, title, source, auto_key) values ('t-auto-3', cid, 'Book travel', 'auto', 'travel:show-1');
  insert into public.tasks (id, client_id, title) values ('t-auto-4', cid, 'No key');
  insert into public.tasks (id, client_id, title) values ('t-auto-5', cid, 'No key either');
  select count(*) into n from public.tasks where id like 't-auto-%';
  if n <> 4 then raise exception '2: expected 4 rows, saw %', n; end if;
  -- the source list is enforced, and keys have a length cap
  begin insert into public.tasks (id, client_id, title, source) values ('t-auto-6', cid, 'x', 'robot'); raise exception '3: unknown source accepted';
  exception when check_violation then null; end;
  begin insert into public.tasks (id, client_id, title, auto_key) values ('t-auto-7', cid, 'x', repeat('k', 121)); raise exception '4: huge key accepted';
  exception when check_violation then null; end;
  reset role;
  raise exception 'ALL AUTO KEY CHECKS PASSED (rolled back)';
end $$;
