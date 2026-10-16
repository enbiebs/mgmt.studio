-- One login, several companies (the database half). The access rules already look up a person's role in the ARTIST'S OWN
-- company (has_section_access, can_open_client, is_management_side...), so a person who owns one company and is a
-- freelancer in another already gets the right power in each. What is added here:
--   * workspace_people() can be asked about ONE company (it used to take the caller's first company).
--   * Inviting someone who already has a login: the invitation waits (pending_invites, as before) and the person sees it
--     in the app and chooses Accept or Decline. Accepting creates their membership and their pages exactly as a sign-up
--     through an invitation does (one shared function now does that for both).
--   * A person can leave a company (never the owner). A manager can see and cancel waiting invitations and remove someone
--     from the company; only the owner can remove an admin; the owner can never be removed.

-- 1. the shared "apply the pages an invitation carries" step (unchanged rules, one copy)
create or replace function public.apply_invite_access(p_member uuid, p_invite uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare inv record;
begin
  select * into inv from public.pending_invites p where p.id = p_invite;
  if not found then return; end if;
  if inv.role in ('team', 'agent', 'lawyer') and inv.client_id is null and jsonb_array_length(inv.access) > 0 then
    begin
      insert into public.access_grants (id, workspace_member_id, section, client_id, can_edit)
      select 'grant-' || gen_random_uuid()::text, p_member, a.section, a.client_id, a.can_edit
        from jsonb_to_recordset(inv.access) as a(section text, client_id text, can_edit boolean)
        join public.clients c on c.id = a.client_id and c.workspace_id = inv.workspace_id and c.demo_owner is null
       where a.section in ('music', 'tour', 'content', 'finance', 'team', 'projects', 'analytics', 'legal', 'profile', 'deals', 'admin')
         and a.can_edit is not null
         and (a.section <> 'admin' or a.can_edit)
       limit 300
      on conflict do nothing;
    exception when others then
      update public.pending_invites set apply_error = left(sqlerrm, 300) where id = inv.id;
    end;
  end if;
end
$$;
revoke all on function public.apply_invite_access(uuid, uuid) from public, anon, authenticated;

-- 2. the sign-up trigger uses it
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_workspace_id uuid;
  new_member_id uuid;
  inv record;
begin
  select * into inv from public.pending_invites p
   where p.email = lower(new.email) and p.used_at is null and p.created_at > now() - interval '14 days'
   order by p.created_at desc limit 1;

  if found then
    insert into public.workspace_members (workspace_id, user_id, role, person_id, client_id)
    values (inv.workspace_id, new.id, inv.role, inv.person_id, inv.client_id)
    returning id into new_member_id;
    update public.pending_invites set used_at = now() where id = inv.id;
    perform public.apply_invite_access(new_member_id, inv.id);
  else
    insert into public.workspaces (name, owner_user_id)
    values (coalesce(nullif(btrim(left(new.raw_user_meta_data->>'workspace_name', 80)), ''), left(split_part(new.email, '@', 1), 80)), new.id)
    returning id into new_workspace_id;
    insert into public.workspace_members (workspace_id, user_id, role)
    values (new_workspace_id, new.id, 'manager');
  end if;
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 3. the team list for ONE company (null = the caller's earliest company, as before)
drop function if exists public.workspace_people();
create function public.workspace_people(p_workspace uuid default null)
returns table (member_id uuid, user_id uuid, label text, role text, all_clients boolean, client_ids text[], invited boolean, person_id text, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select wm.id, wm.user_id,
         coalesce(nullif(p.name, ''), u.email::text, 'Someone'),
         wm.role,
         (wm.role = 'manager' or exists (
            select 1 from public.access_grants g where g.workspace_member_id = wm.id and g.client_id is null)),
         coalesce((select array_agg(distinct g.client_id) from public.access_grants g
                    where g.workspace_member_id = wm.id and g.client_id is not null), '{}'),
         (u.last_sign_in_at is null),
         wm.person_id,
         case when exists (select 1 from public.workspace_members me
                            where me.user_id = auth.uid() and me.role = 'manager' and me.client_id is null and me.workspace_id = wm.workspace_id)
              then lower(u.email::text) end
    from public.workspace_members wm
    join auth.users u on u.id = wm.user_id
    left join public.people p on p.id = wm.person_id
   where wm.client_id is null
     and wm.workspace_id = coalesce(p_workspace, (select me.workspace_id from public.workspace_members me
                                                   where me.user_id = auth.uid() and me.client_id is null order by me.created_at, me.id limit 1))
     -- the caller must be on the management side of that company
     and exists (select 1 from public.workspace_members me where me.user_id = auth.uid() and me.client_id is null and me.workspace_id = wm.workspace_id)
$$;
revoke all on function public.workspace_people(uuid) from public, anon;
grant execute on function public.workspace_people(uuid) to authenticated;

-- 4. invitations for someone who already has a login: what they are offered, accepting, declining
create or replace function public.my_company_invites()
returns table (invite_id uuid, workspace_id uuid, company text, role text, artists text[], invited_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.workspace_id, w.name, p.role,
         coalesce((select array_agg(distinct c.name order by c.name) from public.clients c
                    where c.workspace_id = p.workspace_id
                      and (c.id = p.client_id or c.id in (select a.client_id from jsonb_to_recordset(p.access) as a(client_id text)))), '{}'),
         p.created_at
    from public.pending_invites p
    join public.workspaces w on w.id = p.workspace_id
   where p.used_at is null and p.created_at > now() - interval '14 days'
     and p.email = lower((select u.email::text from auth.users u where u.id = auth.uid()))
     and not exists (select 1 from public.workspace_members m where m.workspace_id = p.workspace_id and m.user_id = auth.uid())
   order by p.created_at desc
$$;
revoke all on function public.my_company_invites() from public, anon;
grant execute on function public.my_company_invites() to authenticated;

create or replace function public.accept_company_invite(p_invite uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv record;
  me_email text;
  new_member uuid;
begin
  select lower(u.email::text) into me_email from auth.users u where u.id = auth.uid();
  select * into inv from public.pending_invites p
   where p.id = p_invite and p.used_at is null and p.created_at > now() - interval '14 days' and p.email = me_email;
  if not found then raise exception 'That invitation is no longer available'; end if;

  if exists (select 1 from public.workspace_members m where m.workspace_id = inv.workspace_id and m.user_id = auth.uid()) then
    update public.pending_invites set used_at = now() where id = inv.id;   -- already part of it: nothing to add
    return inv.workspace_id;
  end if;

  insert into public.workspace_members (workspace_id, user_id, role, person_id, client_id)
  values (inv.workspace_id, auth.uid(), inv.role, inv.person_id, inv.client_id)
  returning id into new_member;
  update public.pending_invites set used_at = now() where id = inv.id;
  perform public.apply_invite_access(new_member, inv.id);
  return inv.workspace_id;
end
$$;
revoke all on function public.accept_company_invite(uuid) from public, anon;
grant execute on function public.accept_company_invite(uuid) to authenticated;

create or replace function public.decline_company_invite(p_invite uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.pending_invites p
   where p.id = p_invite and p.used_at is null
     and p.email = lower((select u.email::text from auth.users u where u.id = auth.uid()))
$$;
revoke all on function public.decline_company_invite(uuid) from public, anon;
grant execute on function public.decline_company_invite(uuid) to authenticated;

-- 5. what a manager sees and can do about waiting invitations
create or replace function public.company_pending_invites()
returns table (invite_id uuid, workspace_id uuid, email text, role text, artists text[], invited_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.workspace_id, p.email, p.role,
         coalesce((select array_agg(distinct c.name order by c.name) from public.clients c
                    where c.workspace_id = p.workspace_id
                      and (c.id = p.client_id or c.id in (select a.client_id from jsonb_to_recordset(p.access) as a(client_id text)))), '{}'),
         p.created_at
    from public.pending_invites p
   where p.used_at is null and p.created_at > now() - interval '14 days' and public.is_manager_of_workspace(p.workspace_id)
   order by p.created_at desc
$$;
revoke all on function public.company_pending_invites() from public, anon;
grant execute on function public.company_pending_invites() to authenticated;

create or replace function public.cancel_company_invite(p_invite uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.pending_invites p where p.id = p_invite and p.used_at is null and public.is_manager_of_workspace(p.workspace_id);
  if not found then raise exception 'That invitation was not found'; end if;
end
$$;
revoke all on function public.cancel_company_invite(uuid) from public, anon;
grant execute on function public.cancel_company_invite(uuid) to authenticated;

-- 6. leaving, and removing someone from the company (their login and their other companies are untouched)
create or replace function public.leave_company(p_workspace uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.workspaces w where w.id = p_workspace and w.owner_user_id = auth.uid()) then
    raise exception 'The owner cannot leave the company';
  end if;
  delete from public.workspace_members m where m.workspace_id = p_workspace and m.user_id = auth.uid();
  if not found then raise exception 'You are not part of that company'; end if;
end
$$;
revoke all on function public.leave_company(uuid) from public, anon;
grant execute on function public.leave_company(uuid) to authenticated;

create or replace function public.remove_company_member(p_member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  owner uuid;
begin
  select m.id, m.user_id, m.role, m.workspace_id into t from public.workspace_members m where m.id = p_member;
  if not found then raise exception 'That person was not found'; end if;
  select w.owner_user_id into owner from public.workspaces w where w.id = t.workspace_id;
  if not public.is_manager_of_workspace(t.workspace_id) then raise exception 'Only a manager can remove someone from the company'; end if;
  if t.user_id = owner then raise exception 'The owner cannot be removed'; end if;
  if t.user_id = auth.uid() then raise exception 'Use Leave this company to remove yourself'; end if;
  if t.role = 'manager' and owner is distinct from auth.uid() then raise exception 'Only the owner can remove an admin'; end if;
  delete from public.workspace_members where id = p_member;
end
$$;
revoke all on function public.remove_company_member(uuid) from public, anon;
grant execute on function public.remove_company_member(uuid) to authenticated;
