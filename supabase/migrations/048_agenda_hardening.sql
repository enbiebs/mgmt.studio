-- Hardening for the agenda, from an independent security and code review of migration 044. Needs migration 047.
--
-- 1. The artist's own login is turned away before anything else is looked at (so the limit message can't be used to probe).
-- 2. Ticking a point on an agenda that already has the maximum of 60 points works again: saving an existing point is
--    an "upsert", which reached the "at most 60" check and counted the point against itself.
-- 3. An agenda follows the to-do exactly: someone whose access was taken away loses the agenda of a to-do given to
--    them, and a to-do about a hidden item hides its agenda too (they use the same rules as the to-do itself, 047).
create or replace function public.agenda_points_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_management_side(new.client_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if TG_OP = 'INSERT' then
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
    -- A save of a point that already exists reaches here as an insert: it is not a new point, so it doesn't count.
    if not exists (select 1 from public.agenda_points a where a.id = new.id)
       and (select count(*) from public.agenda_points a where a.item_type = new.item_type and a.item_id = new.item_id) >= 60 then
      raise exception 'An agenda can have at most 60 points';
    end if;
  else
    new.client_id := old.client_id; new.item_type := old.item_type; new.item_id := old.item_id;
    new.created_by := old.created_by; new.created_at := old.created_at;
  end if;
  return new;
end;
$$;
revoke execute on function public.agenda_points_guard() from public, anon, authenticated;

drop policy if exists "agenda_points insert" on public.agenda_points;
drop policy if exists "agenda_points update" on public.agenda_points;
drop policy if exists "agenda_points delete" on public.agenda_points;
create policy "agenda_points insert" on public.agenda_points for insert to authenticated
  with check (
    public.is_management_side(client_id) and (
      (item_type = 'task' and exists (select 1 from public.tasks t where t.id = agenda_points.item_id and t.client_id = agenda_points.client_id
         and ((t.assignee = auth.uid() and public.can_open_client(t.client_id))
              or public.can_see_task_item(t.client_id, t.section, t.link_type, t.link_id, true))))
      or (item_type = 'project' and public.has_section_access(client_id, 'projects', true)
         and exists (select 1 from public.projects p where p.id = agenda_points.item_id and p.client_id = agenda_points.client_id))
    )
  );
create policy "agenda_points update" on public.agenda_points for update to authenticated
  using (
    public.is_management_side(client_id) and (
      (item_type = 'task' and exists (select 1 from public.tasks t where t.id = agenda_points.item_id and t.client_id = agenda_points.client_id
         and ((t.assignee = auth.uid() and public.can_open_client(t.client_id))
              or public.can_see_task_item(t.client_id, t.section, t.link_type, t.link_id, true))))
      or (item_type = 'project' and public.has_section_access(client_id, 'projects', true)
         and exists (select 1 from public.projects p where p.id = agenda_points.item_id and p.client_id = agenda_points.client_id))
    )
  )
  with check (public.is_management_side(client_id));
create policy "agenda_points delete" on public.agenda_points for delete to authenticated
  using (
    public.is_management_side(client_id) and (
      (item_type = 'task' and exists (select 1 from public.tasks t where t.id = agenda_points.item_id and t.client_id = agenda_points.client_id
         and ((t.assignee = auth.uid() and public.can_open_client(t.client_id))
              or public.can_see_task_item(t.client_id, t.section, t.link_type, t.link_id, true))))
      or (item_type = 'project' and public.has_section_access(client_id, 'projects', true)
         and exists (select 1 from public.projects p where p.id = agenda_points.item_id and p.client_id = agenda_points.client_id))
    )
  );
