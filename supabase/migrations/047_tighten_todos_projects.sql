-- Hardening for to-dos and project assignment, from an independent security review of migrations 040 and 041.
--
-- 1. Taking someone's access away now also takes away the to-dos given to them. Before, "given to me" alone was
--    enough to keep reading and editing a to-do after every grant had been removed.
-- 2. To-dos respect the per-item "hide from this person" setting: a to-do about a show, invoice, contract, bill or
--    project is hidden from anyone that item is hidden from (and shared with anyone it is shared with).
-- 3. The safety checks on to-dos and projects turn away a login that is not on the management side (the artist's
--    own login) BEFORE doing anything else, so their error messages can't be used to find out who has access to what.
-- 4. Saving an existing to-do or project no longer re-checks who it is given to unless that is changing. (A save is
--    an "upsert", which reaches the INSERT check first, so a person who had since lost access could no longer tick
--    their own to-do or change a project's status.)
-- 5. An artist's login can never choose or CLEAR who has a project, and a project can't move to another artist.

-- "May this person see (or, with edit, change) a to-do about this thing?": the section it belongs to, plus the
-- per-item hide/share setting for the kinds of thing that have one.
create or replace function public.can_see_task_item(p_client text, p_section text, p_link_type text, p_link_id text, p_edit boolean default false)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_link_type in ('show', 'invoice', 'contract', 'expense', 'project')
              then public.can_see_item(p_client, coalesce(p_section, 'projects'), p_link_type, p_link_id, p_edit)
              else public.has_section_access(p_client, coalesce(p_section, 'projects'), p_edit) end
$$;
revoke all on function public.can_see_task_item(text, text, text, text, boolean) from public, anon;
grant execute on function public.can_see_task_item(text, text, text, text, boolean) to authenticated;

drop policy if exists "tasks select" on public.tasks;
drop policy if exists "tasks insert" on public.tasks;
drop policy if exists "tasks update" on public.tasks;
drop policy if exists "tasks delete" on public.tasks;
create policy "tasks select" on public.tasks for select to authenticated
  using (public.is_management_side(client_id)
         and ((assignee = auth.uid() and public.can_open_client(client_id))
              or public.can_see_task_item(client_id, section, link_type, link_id, false)));
create policy "tasks insert" on public.tasks for insert to authenticated
  with check (public.is_management_side(client_id)
              and public.can_see_task_item(client_id, section, link_type, link_id, true));
create policy "tasks update" on public.tasks for update to authenticated
  using (public.is_management_side(client_id)
         and ((assignee = auth.uid() and public.can_open_client(client_id))
              or public.can_see_task_item(client_id, section, link_type, link_id, true)))
  with check (public.is_management_side(client_id)
              and ((assignee = auth.uid() and public.can_open_client(client_id))
                   or public.can_see_task_item(client_id, section, link_type, link_id, true)));
create policy "tasks delete" on public.tasks for delete to authenticated
  using (public.is_management_side(client_id)
         and ((created_by = auth.uid() and public.can_open_client(client_id))
              or public.can_see_task_item(client_id, section, link_type, link_id, true)));

create or replace function public.tasks_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  ws uuid;
  prior_assignee uuid;
  prior_exists boolean;
begin
  -- Not on the management side (the artist's own login)? Turned away first, so nothing below can be probed.
  if actor is not null and not public.is_management_side(new.client_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  if TG_OP = 'UPDATE' then
    if new.client_id <> old.client_id then raise exception 'A to-do cannot move to another artist'; end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    prior_assignee := old.assignee;
    prior_exists := true;
  else
    if actor is not null then new.created_by := actor; end if;
    -- A save of a to-do that already exists reaches here first: look up who it was given to before.
    select t.assignee, true into prior_assignee, prior_exists from public.tasks t where t.id = new.id;
  end if;

  new.section := case new.link_type
    when 'show' then 'tour' when 'offer' then 'tour'
    when 'invoice' then 'finance' when 'expense' then 'finance'
    when 'contract' then 'legal' when 'song' then 'music' when 'project' then 'projects'
    else null end;

  if new.done_at is null then
    new.done_by := null;
  elsif TG_OP = 'INSERT' or old.done_at is null then
    new.done_at := now();
    new.done_by := actor;
  else
    new.done_at := old.done_at;
    new.done_by := old.done_by;
  end if;

  -- Only when it is being given to someone NEW: they must be able to open this artist.
  if new.assignee is not null and (not coalesce(prior_exists, false) or new.assignee is distinct from prior_assignee) then
    select c.workspace_id into ws from public.clients c where c.id = new.client_id;
    if not exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = ws and wm.user_id = new.assignee and wm.client_id is null
        and (wm.role = 'manager' or exists (
          select 1 from public.access_grants g
          where g.workspace_member_id = wm.id and (g.client_id is null or g.client_id = new.client_id)))
    ) then
      raise exception 'That person cannot open this artist, so they cannot be given this to-do';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.tasks_guard() from public, anon, authenticated;

create or replace function public.projects_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws uuid;
  prior_assignee uuid;
  prior_exists boolean;
  management boolean := auth.uid() is null or public.is_management_side(new.client_id);
begin
  if TG_OP = 'UPDATE' then
    if new.client_id is distinct from old.client_id then raise exception 'A project cannot move to another artist'; end if;
    prior_assignee := old.assignee_user;
    prior_exists := true;
  else
    -- A save of a project that already exists reaches here first.
    select p.assignee_user, true into prior_assignee, prior_exists from public.projects p where p.id = new.id;
  end if;

  -- The artist's own login can submit and edit its request, but never chooses or clears who has it.
  if not management then
    new.assignee_user := case when coalesce(prior_exists, false) then prior_assignee else null end;
    return new;
  end if;

  -- The management side: only when it is being given to someone NEW must that person be able to open this artist.
  if new.assignee_user is not null and (not coalesce(prior_exists, false) or new.assignee_user is distinct from prior_assignee) then
    select c.workspace_id into ws from public.clients c where c.id = new.client_id;
    if not exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = ws and wm.user_id = new.assignee_user and wm.client_id is null
        and (wm.role = 'manager' or exists (
          select 1 from public.access_grants g
          where g.workspace_member_id = wm.id and (g.client_id is null or g.client_id = new.client_id)))
    ) then
      raise exception 'That person cannot open this artist, so they cannot be given this project';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.projects_guard() from public, anon, authenticated;
