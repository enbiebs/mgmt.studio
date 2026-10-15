-- Run in the Supabase SQL editor any time (it only reads). It is the "nothing was forgotten" check for access:
--   • every table must have row-level security switched on
--   • every table must use one of the access helpers (has_section_access, can_see_item, can_open_client,
--     can_see_task_item, is_management_side, is_artist_admin, has_workspace_legal_template_access), OR be listed
--     below with the reason it does not
-- A new table that forgets its access rule makes this fail with the table's name, instead of quietly leaking.
-- Ends with an intentional message ("ALL GATE COVERAGE CHECKS PASSED") so it never changes anything.
do $$
declare
  gated constant text := 'has_section_access|can_see_item|can_open_client|can_see_task_item|is_management_side|is_artist_admin|has_workspace_legal_template_access';
  -- no policies on purpose: only the server (service key) ever touches these
  server_only constant text[] := array['bank_connections', 'google_calendar_connections', 'google_calendar_event_links', 'pending_invites', 'profile_secure', 'rate_limits'];
  -- gated some other way, each reason spelled out
  other_ok constant text[] := array[
    'fx_rates',            -- public exchange-rate reference data (read only)
    'geo_cities',          -- public city reference data (read only)
    'inbox_state',         -- each person's own rows (user_id = auth.uid())
    'item_access',         -- managers only
    'workspace_members',   -- everyone in the workspace can read the team list (to be tightened: see the access plan, step 3)
    'workspaces'           -- members of the workspace
  ];
  r record; bad text[] := '{}'; n int;
begin
  select array_agg(c.relname order by c.relname) into bad
  from pg_class c join pg_namespace ns on ns.oid = c.relnamespace and ns.nspname = 'public'
  where c.relkind = 'r' and not c.relrowsecurity;
  if bad is not null then raise exception 'Row-level security is OFF for: %', array_to_string(bad, ', '); end if;

  for r in
    select c.relname as t,
           count(p.policyname) as policies,
           coalesce(bool_or((coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) ~* gated), false) as uses_gate
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace and ns.nspname = 'public'
    left join pg_policies p on p.schemaname = 'public' and p.tablename = c.relname
    where c.relkind = 'r' and c.relrowsecurity
    group by c.relname
  loop
    if r.t = any(server_only) then
      if r.policies <> 0 then raise exception '% is meant to be server-only but has % policies', r.t, r.policies; end if;
    elsif r.t = any(other_ok) then
      null;
    elsif not r.uses_gate then
      bad := bad || r.t;
    end if;
  end loop;
  if cardinality(bad) > 0 then
    raise exception 'These tables have no access gate: %. Give them one (has_section_access ...) or list them in gate_coverage_test.sql with the reason.', array_to_string(bad, ', ');
  end if;

  -- the listed exceptions must still exist (a renamed table should not silently drop out of the check)
  select count(*) into n from pg_class c join pg_namespace ns on ns.oid = c.relnamespace and ns.nspname = 'public'
   where c.relkind = 'r' and c.relname = any(server_only || other_ok);
  if n <> cardinality(server_only) + cardinality(other_ok) then raise exception 'A table listed as an exception no longer exists; update gate_coverage_test.sql'; end if;

  raise exception 'ALL GATE COVERAGE CHECKS PASSED';
end $$;
