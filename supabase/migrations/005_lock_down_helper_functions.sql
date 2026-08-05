-- ─────────────────────────────────────────────────────────────
-- Studio · Lock down RLS helper functions
--
-- my_workspace_ids() and client_ids_for_user() had the same missing
-- search_path issue fixed on handle_new_user() in 004. They also had no
-- restriction on who could call them directly via the REST API
-- (/rest/v1/rpc/...), including logged-out visitors — Supabase's
-- security scanner flags this as "Public Can Execute SECURITY DEFINER
-- Function". In practice neither function ever returned another
-- workspace's data (both filter by auth.uid()), but there's no reason
-- to leave the door open.
--
-- Fix:
--   - Pin search_path = '' on both, fully-qualify table references
--     (same pattern as 004_fix_signup_trigger.sql)
--   - Revoke EXECUTE from anon (not logged in) and PUBLIC entirely
--   - handle_new_user() only ever runs via its trigger — revoke
--     EXECUTE from authenticated too, nothing should call it directly
--   - my_workspace_ids() / client_ids_for_user() stay executable by
--     authenticated, since every RLS policy in 001_initial_schema.sql
--     calls them on behalf of the logged-in user's own queries —
--     revoking that would lock everyone out of their own data
--
-- Verified live against avmigforzdklzrujshrc: security scanner warnings
-- gone (except the expected "authenticated can call this" ones, which
-- are intentional), and a real logged-in query still returns the
-- correct data.
-- ─────────────────────────────────────────────────────────────

create or replace function public.my_workspace_ids()
returns setof uuid language sql security definer stable set search_path = '' as $$
  select workspace_id from public.workspace_members where user_id = auth.uid()
$$;

create or replace function public.client_ids_for_user()
returns setof text language sql security definer stable set search_path = '' as $$
  select id from public.clients where workspace_id in (select public.my_workspace_ids())
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

revoke execute on function public.my_workspace_ids() from public, anon;
grant execute on function public.my_workspace_ids() to authenticated;

revoke execute on function public.client_ids_for_user() from public, anon;
grant execute on function public.client_ids_for_user() to authenticated;
