-- Follow-ups from the independent security review of 050 (Point Person). All low severity, none exploitable for
-- more than the review described, but each closes a real gap:
--
--  1. "Teammate" is now an allow-list (team / agent / lawyer). A former artist login (its artist was deleted, which
--     nulls client_id and leaves role 'artist') used to pass the old "client_id is null" test, so a Point Person could
--     have handed it access.
--  2. Every rule now ties the artist to the SAME workspace as the person receiving access, managers included. Before,
--     a manager of one workspace could plant a row pointing at another workspace's artist (an artist-id existence
--     check, and junk rows the victim could not delete).
--  3. The access_grants rules apply to signed-in users only (signed-out requests no longer hit the helpers).
--  4. revoke_artist_access(): ONE clean way to take someone off an artist: deletes every row they have for it,
--     including the vault and Point Person rows a Point Person cannot see. Revoking only ever goes downwards, so a
--     Point Person may do it; granting the vault stays manager-only. It is also a single statement, so removing
--     someone can no longer be left half done.

-- May the caller add / change / delete this row? Managers of the person's workspace: yes. A Point Person of the artist:
-- only non-vault rows, only for teammates, only for their own artist.
create or replace function public.can_change_grant(p_member uuid, p_client text, p_section text)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  t record;
  ws uuid;
begin
  select wm.* into t from public.workspace_members wm where wm.id = p_member;
  if t is null then return false; end if;
  if p_client is not null then
    select c.workspace_id into ws from public.clients c
     where c.id = p_client and (c.demo_owner is null or c.demo_owner = auth.uid());
    if ws is null or ws <> t.workspace_id then return false; end if;
  end if;
  if exists (select 1 from public.workspace_members m
              where m.workspace_id = t.workspace_id and m.user_id = auth.uid() and m.role = 'manager') then
    return true;
  end if;
  return p_client is not null and p_section <> 'vault'
     and t.client_id is null and t.role in ('team', 'agent', 'lawyer')
     and public.is_artist_admin(p_client);
end;
$function$;
revoke all on function public.can_change_grant(uuid, text, text) from public, anon;
grant execute on function public.can_change_grant(uuid, text, text) to authenticated;

-- May a Point Person READ this row? Their own artist, never the vault, never company-wide, and only for a person in
-- that artist's own workspace.
create or replace function public.can_see_artist_grant(p_member uuid, p_client text, p_section text)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  tws uuid;
  cws uuid;
begin
  if p_client is null or p_section = 'vault' then return false; end if;
  select wm.workspace_id into tws from public.workspace_members wm where wm.id = p_member;
  select c.workspace_id into cws from public.clients c
   where c.id = p_client and (c.demo_owner is null or c.demo_owner = auth.uid());
  return tws is not null and tws = cws and public.is_artist_admin(p_client);
end;
$function$;
revoke all on function public.can_see_artist_grant(uuid, text, text) from public, anon;
grant execute on function public.can_see_artist_grant(uuid, text, text) to authenticated;

drop policy if exists "access_grants select" on public.access_grants;
create policy "access_grants select" on public.access_grants for select to authenticated
  using (
    exists (
      select 1 from public.workspace_members target
      join public.workspace_members caller on caller.workspace_id = target.workspace_id
      where target.id = access_grants.workspace_member_id
        and caller.user_id = auth.uid()
        and (caller.role = 'manager' or caller.id = target.id)
    )
    or public.can_see_artist_grant(access_grants.workspace_member_id, access_grants.client_id, access_grants.section)
  );

drop policy if exists "access_grants insert" on public.access_grants;
create policy "access_grants insert" on public.access_grants for insert to authenticated
  with check (public.can_change_grant(access_grants.workspace_member_id, access_grants.client_id, access_grants.section));

drop policy if exists "access_grants update" on public.access_grants;
create policy "access_grants update" on public.access_grants for update to authenticated
  using (public.can_change_grant(access_grants.workspace_member_id, access_grants.client_id, access_grants.section))
  with check (public.can_change_grant(access_grants.workspace_member_id, access_grants.client_id, access_grants.section));

drop policy if exists "access_grants delete" on public.access_grants;
create policy "access_grants delete" on public.access_grants for delete to authenticated
  using (public.can_change_grant(access_grants.workspace_member_id, access_grants.client_id, access_grants.section));

-- Take one person off one artist completely. Returns how many rows went.
create or replace function public.revoke_artist_access(p_member uuid, p_client text)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  t record;
  ws uuid;
  n integer;
begin
  select wm.* into t from public.workspace_members wm where wm.id = p_member;
  select c.workspace_id into ws from public.clients c
   where c.id = p_client and (c.demo_owner is null or c.demo_owner = auth.uid());
  if t is null or ws is null or ws <> t.workspace_id or t.client_id is not null or t.role = 'manager' then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not (
    exists (select 1 from public.workspace_members m
             where m.workspace_id = ws and m.user_id = auth.uid() and m.role = 'manager')
    or (public.is_artist_admin(p_client) and t.role in ('team', 'agent', 'lawyer'))
  ) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  delete from public.access_grants g where g.workspace_member_id = p_member and g.client_id = p_client;
  get diagnostics n = row_count;
  return n;
end;
$function$;
revoke all on function public.revoke_artist_access(uuid, text) from public, anon;
grant execute on function public.revoke_artist_access(uuid, text) to authenticated;
