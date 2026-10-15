-- Agenda: an ordered list of talking points / steps around ONE to-do or project, to run a call or plan the work.
-- Each point can be ticked off. (Turning a point into its own to-do is done in the app.)
--
-- Privacy follows the thing it belongs to, exactly: whoever may see a to-do (or a project) may see its agenda,
-- whoever may change it may change its agenda, and the artist's own login never sees any agenda (an agenda is
-- the team's own notes; the artist can read their request, but not the team's talking points about it).
-- Removing a to-do or project removes its agenda; removing an artist removes everything of theirs.
create table if not exists public.agenda_points (
  id         text primary key,
  client_id  text not null references public.clients(id) on delete cascade,
  item_type  text not null check (item_type in ('task', 'project')),
  item_id    text not null check (char_length(item_id) between 1 and 100),
  text       text not null check (char_length(btrim(text)) between 1 and 300),
  done       boolean not null default false,
  position   integer not null default 0,
  created_by uuid,                                   -- set by the server
  created_at timestamptz not null default now()
);
create index if not exists agenda_points_item_idx on public.agenda_points (item_type, item_id, position);
create index if not exists agenda_points_client_idx on public.agenda_points (client_id);

create or replace function public.agenda_points_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if TG_OP = 'INSERT' then
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
    if (select count(*) from public.agenda_points a where a.item_type = new.item_type and a.item_id = new.item_id) >= 60 then
      raise exception 'An agenda can have at most 60 points';
    end if;
  else
    -- a point stays with the same item, artist and author
    new.client_id := old.client_id; new.item_type := old.item_type; new.item_id := old.item_id;
    new.created_by := old.created_by; new.created_at := old.created_at;
  end if;
  return new;
end;
$$;
drop trigger if exists agenda_points_guard on public.agenda_points;
create trigger agenda_points_guard before insert or update on public.agenda_points
  for each row execute function public.agenda_points_guard();

-- Cleaning up with the item (these run as the owner so they can remove points whoever deleted the item).
create or replace function public.agenda_points_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.agenda_points a where a.item_type = TG_ARGV[0] and a.item_id = old.id;
  return old;
end;
$$;
drop trigger if exists tasks_agenda_cleanup on public.tasks;
create trigger tasks_agenda_cleanup after delete on public.tasks
  for each row execute function public.agenda_points_cleanup('task');
drop trigger if exists projects_agenda_cleanup on public.projects;
create trigger projects_agenda_cleanup after delete on public.projects
  for each row execute function public.agenda_points_cleanup('project');

-- Rules. The subqueries read tasks / projects AS THE CALLER, so each table's own rules (including a task that
-- is only visible to the person it is given to, or a project hidden from someone) decide what is visible here.
alter table public.agenda_points enable row level security;
drop policy if exists "agenda_points select" on public.agenda_points;
drop policy if exists "agenda_points insert" on public.agenda_points;
drop policy if exists "agenda_points update" on public.agenda_points;
drop policy if exists "agenda_points delete" on public.agenda_points;

create policy "agenda_points select" on public.agenda_points for select to authenticated
  using (
    public.is_management_side(client_id) and (
      (item_type = 'task' and exists (select 1 from public.tasks t where t.id = agenda_points.item_id and t.client_id = agenda_points.client_id))
      or (item_type = 'project' and exists (select 1 from public.projects p where p.id = agenda_points.item_id and p.client_id = agenda_points.client_id))
    )
  );

-- Changing an agenda: for a to-do, the person it is given to or anyone who may edit its section; for a project,
-- edit access to Projects. (Same as changing the item itself.)
create policy "agenda_points insert" on public.agenda_points for insert to authenticated
  with check (
    public.is_management_side(client_id) and (
      (item_type = 'task' and exists (select 1 from public.tasks t where t.id = agenda_points.item_id and t.client_id = agenda_points.client_id
         and (t.assignee = auth.uid() or public.has_section_access(t.client_id, coalesce(t.section, 'projects'), true))))
      or (item_type = 'project' and public.has_section_access(client_id, 'projects', true)
         and exists (select 1 from public.projects p where p.id = agenda_points.item_id and p.client_id = agenda_points.client_id))
    )
  );
create policy "agenda_points update" on public.agenda_points for update to authenticated
  using (
    public.is_management_side(client_id) and (
      (item_type = 'task' and exists (select 1 from public.tasks t where t.id = agenda_points.item_id and t.client_id = agenda_points.client_id
         and (t.assignee = auth.uid() or public.has_section_access(t.client_id, coalesce(t.section, 'projects'), true))))
      or (item_type = 'project' and public.has_section_access(client_id, 'projects', true)
         and exists (select 1 from public.projects p where p.id = agenda_points.item_id and p.client_id = agenda_points.client_id))
    )
  )
  with check (public.is_management_side(client_id));
create policy "agenda_points delete" on public.agenda_points for delete to authenticated
  using (
    public.is_management_side(client_id) and (
      (item_type = 'task' and exists (select 1 from public.tasks t where t.id = agenda_points.item_id and t.client_id = agenda_points.client_id
         and (t.assignee = auth.uid() or public.has_section_access(t.client_id, coalesce(t.section, 'projects'), true))))
      or (item_type = 'project' and public.has_section_access(client_id, 'projects', true)
         and exists (select 1 from public.projects p where p.id = agenda_points.item_id and p.client_id = agenda_points.client_id))
    )
  );
revoke all on public.agenda_points from anon;
