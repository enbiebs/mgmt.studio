-- One email per artist. Run in the Supabase SQL editor (or through the SQL tool) BEFORE applying, and again after.
-- The statement under test is the first one; it is the same SQL that gets applied for real:
--
--   create unique index if not exists people_one_email_per_artist
--     on public.people (client_id, lower(btrim(email)))
--     where email is not null and btrim(email) <> '';
--
-- If the test below stops at step 0 ("artists already have two people with the same email"), this read-only query lists exactly who:
--
--   select client_id, lower(btrim(email)) as email, count(*) as how_many, string_agg(id || ' (' || name || ')', ', ' order by id) as people
--     from public.people where email is not null and btrim(email) <> ''
--    group by client_id, lower(btrim(email)) having count(*) > 1;
--
-- This block applies it inside a transaction, checks the rule, then ends with an intentional error so NOTHING is kept
-- (neither the index nor the test people). Success looks like: ERROR: PEOPLE UNIQUE EMAIL TEST OK (rolled back).
do $$
declare
  c1 text; c2 text; n int; refused boolean;
  tag text := left(gen_random_uuid()::text, 6);
begin
  -- the live data must be clean first, or the rule could not be applied at all
  select count(*) into n from (
    select 1 from public.people where email is not null and btrim(email) <> ''
    group by client_id, lower(btrim(email)) having count(*) > 1) d;
  if n <> 0 then raise exception '0: % artist(s) already have two people with the same email; merge them before applying', n; end if;

  create unique index if not exists people_one_email_per_artist
    on public.people (client_id, lower(btrim(email)))
    where email is not null and btrim(email) <> '';

  select id into c1 from public.clients order by id limit 1;
  select id into c2 from public.clients where id <> c1 order by id limit 1;
  if c1 is null or c2 is null then raise exception 'test needs two artists to exist'; end if;

  -- 1. a person with an email saves
  insert into public.people (id, client_id, name, email) values ('zz-p1-' || tag, c1, 'Marco', 'Marco-' || tag || '@Tour.example');

  -- 2. the same email on the same artist is refused, even in other capitals or with stray spaces
  refused := false;
  begin
    insert into public.people (id, client_id, name, email) values ('zz-p2-' || tag, c1, 'Marco again', '  marco-' || tag || '@tour.EXAMPLE ');
  exception when unique_violation then refused := true; end;
  if not refused then raise exception '2a: a second person with the same email was accepted'; end if;

  -- 3. editing someone onto a taken email is refused too
  insert into public.people (id, client_id, name, email) values ('zz-p3-' || tag, c1, 'Sam', 'sam-' || tag || '@tour.example');
  refused := false;
  begin
    update public.people set email = 'MARCO-' || tag || '@tour.example' where id = 'zz-p3-' || tag;
  exception when unique_violation then refused := true; end;
  if not refused then raise exception '3: editing a person onto a taken email was accepted'; end if;

  -- 4. the same email on a DIFFERENT artist is fine (a tour manager can work with several artists)
  insert into public.people (id, client_id, name, email) values ('zz-p4-' || tag, c2, 'Marco, other artist', 'marco-' || tag || '@tour.example');

  -- 5. people with no email, or a blank one, can repeat
  insert into public.people (id, client_id, name, email) values ('zz-p5-' || tag, c1, 'No email 1', null);
  insert into public.people (id, client_id, name, email) values ('zz-p6-' || tag, c1, 'No email 2', null);
  insert into public.people (id, client_id, name, email) values ('zz-p7-' || tag, c1, 'Blank 1', '');
  insert into public.people (id, client_id, name, email) values ('zz-p8-' || tag, c1, 'Blank 2', '   ');

  -- 6. saving the same person again (what the app does on every edit) is not a clash with themselves
  insert into public.people (id, client_id, name, email) values ('zz-p1-' || tag, c1, 'Marco renamed', 'marco-' || tag || '@tour.example')
    on conflict (id) do update set name = excluded.name, email = excluded.email;
  select count(*) into n from public.people where id = 'zz-p1-' || tag and name = 'Marco renamed';
  if n <> 1 then raise exception '6: re-saving the same person did not work'; end if;

  -- 7. removing someone frees their email
  delete from public.people where id = 'zz-p1-' || tag;
  insert into public.people (id, client_id, name, email) values ('zz-p9-' || tag, c1, 'Marco returns', 'marco-' || tag || '@tour.example');

  raise exception 'PEOPLE UNIQUE EMAIL TEST OK (rolled back)';
end $$;
