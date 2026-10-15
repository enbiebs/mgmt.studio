-- Rate limits: how many times one person (or one internet address) may call an endpoint in a window.
--
-- The counters live in the database because the site runs as many short-lived servers that cannot
-- share memory. Only the server's own key can touch them: nothing here is callable from the
-- browser, so nobody can read, reset, or flood the counters through the public API.
create table if not exists public.rate_limits (
  key          text        not null,   -- "u:<user id>:<bucket>" for a signed-in person, "ip:<hash>:<bucket>" for the public
  window_start timestamptz not null,   -- the start of the fixed window this count belongs to
  hits         integer     not null default 0,
  primary key (key, window_start)
);
create index if not exists rate_limits_window_idx on public.rate_limits (window_start);

alter table public.rate_limits enable row level security;   -- no policies: only the function below reads or writes it
revoke all on public.rate_limits from anon, authenticated;

-- Counts one call and says whether it is still within the limit.
create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  w timestamptz;
  n integer;
begin
  if p_limit < 1 or p_window_seconds < 1 or p_window_seconds > 86400 or length(p_key) > 200 then
    raise exception 'bad rate limit arguments';
  end if;
  w := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limits as r (key, window_start, hits) values (p_key, w, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning r.hits into n;
  -- Sweep out old windows now and then so the table stays small.
  if random() < 0.02 then
    delete from public.rate_limits where window_start < now() - interval '2 days';
  end if;
  return n <= p_limit;
end;
$$;

revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
