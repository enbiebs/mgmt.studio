-- Run in the Supabase SQL editor (after migration 053). Ends with an intentional error
-- ("ALL PEOPLE TITLE CHECKS PASSED (rolled back)"), so nothing it makes is kept.
do $$
declare
  mgr uuid := 'f7303cf1-f728-46a2-a861-dc7787c00d9c';
  x text := 'nimino-7tohmry';
  t text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.people (id, client_id, name, title) values ('zz-t-1', x, 'Test Person', 'Tour Manager / Stylist');
  select title into t from public.people where id = 'zz-t-1';
  if t is distinct from 'Tour Manager / Stylist' then raise exception '1: the title was not saved'; end if;
  update public.people set title = null where id = 'zz-t-1';
  select title into t from public.people where id = 'zz-t-1';
  if t is not null then raise exception '2: the title could not be cleared'; end if;
  begin
    update public.people set title = repeat('x', 81) where id = 'zz-t-1';
    raise exception '3: an 81-character title was accepted';
  exception when check_violation then null; end;
  update public.people set title = repeat('x', 80) where id = 'zz-t-1';   -- 80 is fine
  reset role;
  raise exception 'ALL PEOPLE TITLE CHECKS PASSED (rolled back)';
end $$;
