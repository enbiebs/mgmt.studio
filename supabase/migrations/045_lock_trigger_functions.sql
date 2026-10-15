-- The helper functions behind the to-do, project and agenda safety checks only ever run as database triggers.
-- They were left callable from the outside (the database's own security check flagged them), which does nothing
-- harmful (a trigger function cannot be called directly) but is needlessly open. A trigger does not need the
-- person who caused it to have permission to run its function, so nothing changes for anyone.
do $$
declare
  f text;
begin
  foreach f in array array['public.tasks_guard()', 'public.projects_guard()', 'public.agenda_points_guard()', 'public.agenda_points_cleanup()'] loop
    if to_regprocedure(f) is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', f);
    end if;
  end loop;
end $$;
