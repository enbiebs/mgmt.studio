-- A second admin, and groups.
--
-- ADMINS: a company's owner can make another person who has signed in an admin (a manager: sees and changes everything,
-- invites and removes people), and take it back. Only the owner can, the owner can never be demoted, and an artist login
-- can never be an admin. It is one function, because nobody (not even a manager) can change a role directly: the members
-- table has no write rules at all, and its write privileges are removed here as well.
--
-- GROUPS: a saved list of people ("Booking team") so a manager can give a role on an artist to everyone in it at once.
-- A group only remembers who is in it; the access itself is still each person's own (set on the Company page), so
-- nothing about who can see what depends on a group. Managers of the company only.

-- 0. nobody changes company members from the app directly
revoke insert, update, delete, truncate on public.workspace_members from anon, authenticated;

-- 1. is the caller a manager of this company?
create or replace function public.is_manager_of_workspace(p_ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.workspace_members m
                  where m.workspace_id = p_ws and m.user_id = auth.uid() and m.role = 'manager' and m.client_id is null)
$$;
revoke all on function public.is_manager_of_workspace(uuid) from public, anon;
grant execute on function public.is_manager_of_workspace(uuid) to authenticated;

-- 2. make someone an admin / take it back (owner only)
create or replace function public.set_company_admin(p_member uuid, p_admin boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  owner uuid;
begin
  select m.id, m.user_id, m.role, m.workspace_id, m.client_id into t from public.workspace_members m where m.id = p_member;
  if not found then raise exception 'That person was not found'; end if;
  select w.owner_user_id into owner from public.workspaces w where w.id = t.workspace_id;
  if owner is null or owner is distinct from auth.uid() then raise exception 'Only the owner can change who is an admin'; end if;
  if t.client_id is not null or t.role = 'artist' then raise exception 'An artist login cannot be an admin'; end if;
  if t.user_id = owner then raise exception 'The owner is always an admin'; end if;

  if p_admin then
    if t.role = 'manager' then return; end if;
    -- someone who has never signed in could be a mistyped address: they must have signed in at least once
    if not exists (select 1 from auth.users u where u.id = t.user_id and u.last_sign_in_at is not null) then
      raise exception 'They need to sign in once before they can be made an admin';
    end if;
    update public.workspace_members set role = 'manager' where id = p_member;
  else
    if t.role <> 'manager' then return; end if;
    update public.workspace_members set role = 'team' where id = p_member;
  end if;
end
$$;
revoke all on function public.set_company_admin(uuid, boolean) from public, anon;
grant execute on function public.set_company_admin(uuid, boolean) to authenticated;

-- 3. groups
create table if not exists public.company_groups (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 60),
  created_at   timestamptz not null default now(),
  unique (workspace_id, name)
);
create table if not exists public.company_group_members (
  group_id  uuid not null references public.company_groups (id) on delete cascade,
  member_id uuid not null references public.workspace_members (id) on delete cascade,
  primary key (group_id, member_id)
);
create index if not exists company_group_members_member_idx on public.company_group_members (member_id);

alter table public.company_groups enable row level security;
alter table public.company_group_members enable row level security;
revoke all on public.company_groups, public.company_group_members from anon;
grant select, insert, update, delete on public.company_groups, public.company_group_members to authenticated;

create policy "managers read groups" on public.company_groups for select to authenticated using (public.is_manager_of_workspace(workspace_id));
create policy "managers add groups" on public.company_groups for insert to authenticated with check (public.is_manager_of_workspace(workspace_id));
create policy "managers rename groups" on public.company_groups for update to authenticated
  using (public.is_manager_of_workspace(workspace_id)) with check (public.is_manager_of_workspace(workspace_id));
create policy "managers remove groups" on public.company_groups for delete to authenticated using (public.is_manager_of_workspace(workspace_id));

create policy "managers read group members" on public.company_group_members for select to authenticated
  using (exists (select 1 from public.company_groups g where g.id = group_id and public.is_manager_of_workspace(g.workspace_id)));
-- a group can only hold people from its own company, and never a manager or an artist
create policy "managers add group members" on public.company_group_members for insert to authenticated
  with check (exists (select 1 from public.company_groups g join public.workspace_members m on m.workspace_id = g.workspace_id
                       where g.id = group_id and m.id = member_id and m.role not in ('manager', 'artist') and m.client_id is null
                         and public.is_manager_of_workspace(g.workspace_id)));
create policy "managers remove group members" on public.company_group_members for delete to authenticated
  using (exists (select 1 from public.company_groups g where g.id = group_id and public.is_manager_of_workspace(g.workspace_id)));

-- sensible ceilings, so a runaway script cannot fill the tables
create or replace function public.company_groups_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if TG_TABLE_NAME = 'company_groups' then
    if (select count(*) from public.company_groups where workspace_id = new.workspace_id) >= 50 then raise exception 'A company can have up to 50 groups'; end if;
  else
    if (select count(*) from public.company_group_members where group_id = new.group_id) >= 300 then raise exception 'A group can hold up to 300 people'; end if;
  end if;
  return new;
end
$$;
revoke execute on function public.company_groups_limits() from public, anon, authenticated;
drop trigger if exists company_groups_limits on public.company_groups;
create trigger company_groups_limits before insert on public.company_groups for each row execute function public.company_groups_limits();
drop trigger if exists company_group_members_limits on public.company_group_members;
create trigger company_group_members_limits before insert on public.company_group_members for each row execute function public.company_groups_limits();
