-- SECURITY FIX (found by an independent review): every member of a workspace could read EVERY artist's row, including each
-- artist's private calendar-feed link (calendar_token, which opens that artist's whole show list through a public
-- route) and their analytics numbers. An artist's own login, or a teammate who was only given access to one
-- artist, could read all the others'.
--
-- Now a person can only read the artist rows they are allowed to open at all: a manager (every artist in their
-- workspace), the artist's own login (their own row), or a teammate who was given any access to that artist (or
-- to all artists). A demo artist is still private to its owner. Nothing changes for a manager.
--
-- The check works on the row's own workspace and id (it does not look the row up again), so adding a new artist
-- and reading it straight back still works. Anyone who can open an artist can still read that artist's own
-- calendar link and analytics; narrowing those further would mean moving them to their own tables.
create or replace function public.can_open_client_row(p_workspace uuid, p_client text)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  wm record;
begin
  select wm2.* into wm from public.workspace_members wm2
  where wm2.user_id = auth.uid() and wm2.workspace_id = p_workspace limit 1;
  if wm is null then return false; end if;
  if wm.role = 'manager' then return true; end if;
  if wm.client_id is not null then return wm.client_id = p_client; end if;
  return exists (
    select 1 from public.access_grants g
    where g.workspace_member_id = wm.id and (g.client_id is null or g.client_id = p_client)
  );
end;
$function$;
revoke all on function public.can_open_client_row(uuid, text) from public, anon;
grant execute on function public.can_open_client_row(uuid, text) to authenticated;

drop policy if exists "clients select" on public.clients;
create policy "clients select" on public.clients for select
  using (public.can_open_client_row(workspace_id, id) and (demo_owner is null or demo_owner = auth.uid()));
