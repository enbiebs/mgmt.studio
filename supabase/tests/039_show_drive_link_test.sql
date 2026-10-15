-- Run in the Supabase SQL editor. Ends with an intentional error, so nothing it makes is kept.
do $$
declare mgr uuid := 'f7303cf1-f728-46a2-a861-dc7787c00d9c'; cid text := 'nimino-7tohmry'; n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.shows (id, client_id, date, city, venue, time, status, drive_url) values ('t-show-1', cid, '2030-01-01', 'X', 'X', '20:00', 'hold', 'https://drive.google.com/drive/folders/abc');
  begin insert into public.shows (id, client_id, date, city, venue, time, status, drive_url) values ('t-show-2', cid, '2030-01-01', 'X', 'X', '20:00', 'hold', 'javascript:alert(1)'); raise exception '1: javascript link accepted';
  exception when check_violation then null; end;
  begin insert into public.shows (id, client_id, date, city, venue, time, status, drive_url) values ('t-show-3', cid, '2030-01-01', 'X', 'X', '20:00', 'hold', 'ftp://x'); raise exception '2: ftp link accepted';
  exception when check_violation then null; end;
  begin insert into public.shows (id, client_id, date, city, venue, time, status, drive_url) values ('t-show-4', cid, '2030-01-01', 'X', 'X', '20:00', 'hold', 'https://' || repeat('a', 600)); raise exception '3: oversized link accepted';
  exception when check_violation then null; end;
  update public.shows set drive_url = null where id = 't-show-1';
  get diagnostics n = row_count; if n <> 1 then raise exception '4: clearing the link should work'; end if;
  raise exception 'ALL SHOW LINK CHECKS PASSED (rolled back)';
end $$;
