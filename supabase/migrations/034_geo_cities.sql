-- Where cities are, so the app can measure distances: radius clauses ("no shows within 100 miles"),
-- "can they reach it the next day", "what's within 100 miles". Reference data only (no customer
-- information); loaded from GeoNames (CC BY 4.0, geonames.org) by scripts/load-geonames.mjs.
create extension if not exists pg_trgm with schema extensions;
create extension if not exists fuzzystrmatch with schema extensions;

create table if not exists public.geo_cities (
  geonameid  integer primary key,
  name       text not null,                    -- how to show it, e.g. "Jacksonville"
  ascii_name text not null,                    -- lowercase plain letters, for matching
  alt_names  text[] not null default '{}',     -- other spellings (lowercase plain letters)
  lat        double precision not null,
  lon        double precision not null,
  country    text not null,                    -- ISO code, e.g. 'US', 'GB'
  admin1     text,                             -- state / province: 'FL', 'ON', 'VIC' (or the raw code elsewhere)
  population integer not null default 0
);
create index if not exists geo_cities_ascii_idx on public.geo_cities (ascii_name);
create index if not exists geo_cities_ascii_trgm on public.geo_cities using gin (ascii_name extensions.gin_trgm_ops);
create index if not exists geo_cities_alt_idx on public.geo_cities using gin (alt_names);

alter table public.geo_cities enable row level security;
drop policy if exists "geo_cities read" on public.geo_cities;
create policy "geo_cities read" on public.geo_cities for select to authenticated using (true);

-- Finds each place the app asks about: [{key, name, regions:[{country?, admin1?}]}] ->
-- [{key, lat, lon, label, how}]. `how` says how sure it is:
--   exact      the name and the state/country both match (or the name alone is unambiguous)
--   name-only  the name matched but the state/country didn't (or wasn't given and several big cities
--              share the name): the biggest city of that name
--   fuzzy      a typo: at most 2 letters different (and in the written state/country if one was written)
-- Nothing is returned for a place it can't place: a wrong answer is worse than none.
create or replace function public.locate_places(p jsonb)
returns jsonb
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  item jsonb;
  n text;
  regs jsonb;
  found record;
  how text;
  out jsonb := '[]'::jsonb;
begin
  perform set_config('pg_trgm.similarity_threshold', '0.5', true);
  for item in select * from jsonb_array_elements(p) loop
    n := item->>'name';
    regs := coalesce(item->'regions', '[]'::jsonb);
    found := null; how := null;

    if coalesce(n, '') <> '' then
      -- 1. the name, in the state/country that was written
      if jsonb_array_length(regs) > 0 then
        select c.name, c.lat, c.lon, c.country, c.admin1 into found
          from geo_cities c
         where (c.ascii_name = n or n = any(c.alt_names))
           and exists (select 1 from jsonb_array_elements(regs) r
                        where (r->>'country' is null or r->>'country' = c.country)
                          and (r->>'admin1' is null or r->>'admin1' = c.admin1))
         order by c.population desc limit 1;
        if found.name is not null then how := 'exact'; end if;
      end if;
      -- 2. the name alone: the biggest city called that. When a state/country WAS written but nothing
      --    matched it, only a real city (15,000+) is offered, never a small village that merely shares the name.
      if how is null then
        select c.name, c.lat, c.lon, c.country, c.admin1 into found
          from geo_cities c
         where (c.ascii_name = n or n = any(c.alt_names))
           and (jsonb_array_length(regs) = 0 or c.population >= 15000)
         order by c.population desc limit 1;
        if found.name is not null then
          if jsonb_array_length(regs) = 0
             and (select count(*) from geo_cities c where (c.ascii_name = n or n = any(c.alt_names)) and c.population >= 50000) <= 1
          then how := 'exact'; else how := 'name-only'; end if;
        end if;
      end if;
      -- 3. a typo: at most 2 letters different, and in the written state/country if one was written
      if how is null and length(n) >= 5 then
        select c.name, c.lat, c.lon, c.country, c.admin1 into found
          from geo_cities c
         where c.ascii_name % n and levenshtein(c.ascii_name, n) <= 2
           and (jsonb_array_length(regs) = 0 or exists (select 1 from jsonb_array_elements(regs) r
                  where (r->>'country' is null or r->>'country' = c.country)
                    and (r->>'admin1' is null or r->>'admin1' = c.admin1)))
         order by similarity(c.ascii_name, n) desc, c.population desc limit 1;
        if found.name is not null then how := 'fuzzy'; end if;
      end if;
    end if;

    out := out || jsonb_build_array(case when how is null then jsonb_build_object('key', item->>'key')
      else jsonb_build_object('key', item->>'key', 'lat', found.lat, 'lon', found.lon,
             'label', found.name || case when found.country in ('US', 'CA', 'AU') and coalesce(found.admin1, '') <> '' then ', ' || found.admin1 else '' end || ', ' || found.country,
             'how', how) end);
  end loop;
  return out;
end;
$$;

revoke execute on function public.locate_places(jsonb) from public, anon;
grant  execute on function public.locate_places(jsonb) to authenticated;
