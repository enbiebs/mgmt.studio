-- Point Person: a teammate who is the admin of ONE artist's whole business.
--
-- A Point Person can open and change everything for that artist and manage who else can: add teammates, change
-- their level, take their access away, and make other Point People (like "make changes and manage sharing" in
-- Google Calendar). What they never get:
--   • the vault (saved passwords and bank details): it always needs its own explicit grant from a manager
--   • anything for any other artist, or anything company-wide (managers are the workspace-wide admins)
--   • any power over a manager, or over an artist's own login
-- Several Point People per artist are fine. Managers always keep access, so nobody can lock them out.
--
-- It is stored as one more row in access_grants: section 'admin', for one artist, always can_edit. Everything
-- else keeps working through the same helper (has_section_access) that every table's rules already call.
alter table public.access_grants drop constraint if exists access_grants_section_check;
alter table public.access_grants add constraint access_grants_section_check
  check (section in ('music','tour','content','finance','team','projects','analytics','fandom','legal','profile','vault','admin'));

-- There is no such thing as a Point Person for "every artist" or a view-only one.
alter table public.access_grants drop constraint if exists access_grants_admin_shape;
alter table public.access_grants add constraint access_grants_admin_shape
  check (section <> 'admin' or (client_id is not null and can_edit));

-- "Is the caller a Point Person for this artist?" Managers are not counted here (they are handled on their own),
-- and an artist's own login never is. Like the other helpers it only ever answers about the caller.
create or replace function public.is_artist_admin(target_client_id text)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  wm record;
begin
  select wm2.* into wm
  from public.workspace_members wm2
  join public.clients c on c.workspace_id = wm2.workspace_id
  where wm2.user_id = auth.uid() and c.id = target_client_id
    and (c.demo_owner is null or c.demo_owner = auth.uid())
  limit 1;
  if wm is null or wm.client_id is not null or wm.role = 'manager' then return false; end if;
  return exists (
    select 1 from public.access_grants g
    where g.workspace_member_id = wm.id and g.section = 'admin' and g.client_id = target_client_id
  );
end;
$function$;
revoke all on function public.is_artist_admin(text) from public, anon;
grant execute on function public.is_artist_admin(text) to authenticated;

-- The one helper every table's rules call (same body as migration 031, plus: a Point Person for this artist
-- passes every section except the vault).
create or replace function public.has_section_access(target_client_id text, target_section text, require_edit boolean default false)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  wm record;
begin
  select wm2.* into wm
  from public.workspace_members wm2
  join public.clients c on c.workspace_id = wm2.workspace_id
  where wm2.user_id = auth.uid() and c.id = target_client_id
    and (c.demo_owner is null or c.demo_owner = auth.uid())
  limit 1;

  if wm is null then
    return false;
  end if;

  if wm.role = 'manager' then
    return true;
  end if;

  if wm.client_id is not null then
    if wm.client_id <> target_client_id then
      return false;
    end if;
    if require_edit then
      return target_section = 'projects';
    end if;
    return true;
  end if;

  return exists (
    select 1 from public.access_grants g
    where g.workspace_member_id = wm.id
      and (
        (g.section = target_section
          and (g.client_id is null or g.client_id = target_client_id)
          and (not require_edit or g.can_edit = true))
        or (g.section = 'admin' and g.client_id = target_client_id and target_section <> 'vault')
      )
  );
end;
$function$;
revoke execute on function public.has_section_access(text, text, boolean) from public, anon;
grant  execute on function public.has_section_access(text, text, boolean) to authenticated;

-- ── Who may read and change access ───────────────────────────────────────────────────────────────
-- Managers: exactly as before. A Point Person: only the rows for THEIR artist, never the vault, never
-- company-wide rows, and only for teammates (not managers, not an artist's own login) of the same workspace.
drop policy if exists "access_grants select" on public.access_grants;
create policy "access_grants select" on public.access_grants for select
  using (
    exists (
      select 1 from public.workspace_members target
      join public.workspace_members caller on caller.workspace_id = target.workspace_id
      where target.id = access_grants.workspace_member_id
        and caller.user_id = auth.uid()
        and (caller.role = 'manager' or caller.id = target.id)
    )
    or (access_grants.client_id is not null and access_grants.section <> 'vault' and public.is_artist_admin(access_grants.client_id))
  );

drop policy if exists "access_grants insert" on public.access_grants;
create policy "access_grants insert" on public.access_grants for insert
  with check (
    exists (
      select 1 from public.workspace_members target
      join public.workspace_members caller on caller.workspace_id = target.workspace_id
      where target.id = access_grants.workspace_member_id
        and caller.user_id = auth.uid() and caller.role = 'manager'
    )
    or (
      access_grants.client_id is not null and access_grants.section <> 'vault'
      and public.is_artist_admin(access_grants.client_id)
      and exists (
        select 1 from public.workspace_members target
        join public.clients c on c.workspace_id = target.workspace_id
        where target.id = access_grants.workspace_member_id and c.id = access_grants.client_id
          and target.client_id is null and target.role <> 'manager'
      )
    )
  );

drop policy if exists "access_grants update" on public.access_grants;
create policy "access_grants update" on public.access_grants for update
  using (
    exists (
      select 1 from public.workspace_members target
      join public.workspace_members caller on caller.workspace_id = target.workspace_id
      where target.id = access_grants.workspace_member_id
        and caller.user_id = auth.uid() and caller.role = 'manager'
    )
    or (
      access_grants.client_id is not null and access_grants.section <> 'vault'
      and public.is_artist_admin(access_grants.client_id)
      and exists (
        select 1 from public.workspace_members target
        join public.clients c on c.workspace_id = target.workspace_id
        where target.id = access_grants.workspace_member_id and c.id = access_grants.client_id
          and target.client_id is null and target.role <> 'manager'
      )
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members target
      join public.workspace_members caller on caller.workspace_id = target.workspace_id
      where target.id = access_grants.workspace_member_id
        and caller.user_id = auth.uid() and caller.role = 'manager'
    )
    or (
      access_grants.client_id is not null and access_grants.section <> 'vault'
      and public.is_artist_admin(access_grants.client_id)
      and exists (
        select 1 from public.workspace_members target
        join public.clients c on c.workspace_id = target.workspace_id
        where target.id = access_grants.workspace_member_id and c.id = access_grants.client_id
          and target.client_id is null and target.role <> 'manager'
      )
    )
  );

drop policy if exists "access_grants delete" on public.access_grants;
create policy "access_grants delete" on public.access_grants for delete
  using (
    exists (
      select 1 from public.workspace_members target
      join public.workspace_members caller on caller.workspace_id = target.workspace_id
      where target.id = access_grants.workspace_member_id
        and caller.user_id = auth.uid() and caller.role = 'manager'
    )
    or (
      access_grants.client_id is not null and access_grants.section <> 'vault'
      and public.is_artist_admin(access_grants.client_id)
      and exists (
        select 1 from public.workspace_members target
        join public.clients c on c.workspace_id = target.workspace_id
        where target.id = access_grants.workspace_member_id and c.id = access_grants.client_id
          and target.client_id is null and target.role <> 'manager'
      )
    )
  );
