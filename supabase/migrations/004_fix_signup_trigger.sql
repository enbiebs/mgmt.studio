-- ─────────────────────────────────────────────────────────────
-- Studio · Fix signup trigger
--
-- handle_new_user() (001_initial_schema.sql) had no search_path set.
-- Postgres security-hardened SECURITY DEFINER functions run with an
-- effectively empty search_path unless one is set explicitly, so the
-- unqualified `workspaces` / `workspace_members` references inside it
-- resolved to nothing — every signup failed with:
--   "Database error saving new user" (relation "workspaces" does not exist)
--
-- Fix: pin search_path to '' and fully-qualify every table reference.
-- Verified live against project avmigforzdklzrujshrc — signup now creates
-- a workspace + workspace_members row as expected.
-- ─────────────────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  new_workspace_id uuid;
begin
  -- Create a workspace named after the user's email
  insert into public.workspaces (name)
  values (coalesce(new.raw_user_meta_data->>'workspace_name', split_part(new.email, '@', 1)))
  returning id into new_workspace_id;

  -- Add the user as manager of that workspace
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_workspace_id, new.id, 'manager');

  return new;
end;
$$;
