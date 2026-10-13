-- A "demo" artist is a made-up client (fake shows, money, invoices) kept around to try the app
-- on. It belongs to ONE person (demo_owner): only they can see or change it, so teammates
-- invited later never meet fake data that looks real. Real clients leave demo_owner empty.
--
-- Every table's access rules already go through the same few helper functions
-- (has_section_access, can_see_item, is_management_side), which find the viewer's membership by
-- joining to the client. Hiding the demo at that one join hides all of its data from everyone but
-- the owner, in one place; the clients table's own rules are updated the same way.
alter table public.clients
  add column if not exists demo_owner uuid references auth.users(id) on delete cascade;

-- The one existing demo artist belongs to the workspace owner (Eli, the only member so far).
update public.clients
   set demo_owner = 'f7303cf1-f728-46a2-a861-dc7787c00d9c'
 where id = 'demo-nova-lane' and demo_owner is null;

-- ── the clients table itself ──
drop policy if exists "clients select" on public.clients;
create policy "clients select" on public.clients for select
  using (workspace_id in (select public.my_workspace_ids())
         and (demo_owner is null or demo_owner = auth.uid()));

drop policy if exists "clients update" on public.clients;
create policy "clients update" on public.clients for update
  using (workspace_id in (select workspace_id from public.workspace_members
                          where user_id = auth.uid() and role = 'manager')
         and (demo_owner is null or demo_owner = auth.uid()));

drop policy if exists "clients delete" on public.clients;
create policy "clients delete" on public.clients for delete
  using (workspace_id in (select workspace_id from public.workspace_members
                          where user_id = auth.uid() and role = 'manager')
         and (demo_owner is null or demo_owner = auth.uid()));

-- ── the helper functions every other table's rules call ──
-- Same bodies as before; the only change is the extra "and (c.demo_owner ...)" in the lookup, so
-- for someone who isn't the demo's owner no membership is found and the answer is "no".
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
      and g.section = target_section
      and (g.client_id is null or g.client_id = target_client_id)
      and (not require_edit or g.can_edit = true)
  );
end;
$function$;

create or replace function public.can_see_item(target_client_id text, target_section text, target_item_type text, target_item_id text, require_edit boolean default false)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  wm record;
  fx text;
begin
  select wm2.* into wm
  from public.workspace_members wm2
  join public.clients c on c.workspace_id = wm2.workspace_id
  where wm2.user_id = auth.uid() and c.id = target_client_id
    and (c.demo_owner is null or c.demo_owner = auth.uid())
  limit 1;

  if wm is null then return false; end if;
  if wm.role = 'manager' then return true; end if;

  select ia.effect into fx from public.item_access ia
  where ia.item_type = target_item_type and ia.item_id = target_item_id and ia.member_id = wm.id;

  if fx = 'hide' then return false; end if;
  if fx = 'share' and not require_edit then return true; end if;

  if target_item_type = 'expense' and wm.client_id is not null then return false; end if;
  return public.has_section_access(target_client_id, target_section, require_edit);
end;
$function$;

create or replace function public.is_management_side(target_client_id text)
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

  return wm.client_id is null;
end;
$function$;

create or replace function public.client_ids_for_user()
returns setof text
language sql
stable
security definer
set search_path to ''
as $function$
  select id from public.clients
  where workspace_id in (select public.my_workspace_ids())
    and (demo_owner is null or demo_owner = auth.uid())
$function$;

-- create or replace keeps existing grants, but state them so the file is self-describing.
revoke execute on function public.has_section_access(text, text, boolean) from public, anon;
grant  execute on function public.has_section_access(text, text, boolean) to authenticated;
revoke execute on function public.can_see_item(text, text, text, text, boolean) from public, anon;
grant  execute on function public.can_see_item(text, text, text, text, boolean) to authenticated;
revoke execute on function public.is_management_side(text) from public, anon;
grant  execute on function public.is_management_side(text) to authenticated;
revoke execute on function public.client_ids_for_user() from public, anon;
grant  execute on function public.client_ids_for_user() to authenticated;
