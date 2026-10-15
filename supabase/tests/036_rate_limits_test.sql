-- Run in the Supabase SQL editor. Everything is rolled back at the end ("PASSED" is raised on purpose).
do $$
declare r boolean; res text := '';
begin
  for i in 1..3 loop r := public.rate_limit_hit('test:a', 3, 60); res := res || r::text || ','; end loop;
  r := public.rate_limit_hit('test:a', 3, 60); res := res || r::text;
  if res <> 'true,true,true,false' then raise exception 'limit sequence wrong: %', res; end if;
  if not public.rate_limit_hit('test:b', 3, 60) then raise exception 'keys should be independent'; end if;
  insert into public.rate_limits (key, window_start, hits) values ('test:old', now() - interval '10 minutes', 999);
  if not public.rate_limit_hit('test:old', 1, 60) then raise exception 'an old window should not count'; end if;
  if public.rate_limit_hit('test:old', 1, 60) then raise exception 'second hit in the new window should be refused'; end if;
  begin perform public.rate_limit_hit('x', 0, 60); raise exception 'should have rejected limit 0'; exception when raise_exception then if sqlerrm = 'should have rejected limit 0' then raise; end if; end;
  begin perform public.rate_limit_hit('x', 5, 999999); raise exception 'should have rejected a huge window'; exception when raise_exception then if sqlerrm = 'should have rejected a huge window' then raise; end if; end;
  if has_function_privilege('anon', 'public.rate_limit_hit(text,integer,integer)', 'execute') then raise exception 'anon can execute'; end if;
  if has_function_privilege('authenticated', 'public.rate_limit_hit(text,integer,integer)', 'execute') then raise exception 'authenticated can execute'; end if;
  if not has_function_privilege('service_role', 'public.rate_limit_hit(text,integer,integer)', 'execute') then raise exception 'service_role cannot execute'; end if;
  if has_table_privilege('authenticated', 'public.rate_limits', 'select') or has_table_privilege('anon', 'public.rate_limits', 'insert') then raise exception 'table is reachable from the browser roles'; end if;
  raise exception 'PASSED: all rate limit checks (rolled back)';
end $$;
