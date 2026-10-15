-- To-dos: the real, hand-written to-do list behind Home ("Today").
--
-- A to-do belongs to ONE artist and is given to ONE teammate (or nobody yet). It can point at a show,
-- offer, invoice, bill, contract, song or project so "Open" lands in the right place. The automatic
-- "what needs you" items (overdue invoices, offers waiting on a reply) are NOT stored; they are worked
-- out fresh from the data, and this table is only for things a person (or later, the agent) wrote down.
--
-- Who may see a to-do (management side only; the artist's own login never sees any of this):
--   * the person it is given to, always (they were handed it); or
--   * anyone with access to the section the to-do points at (a Finance to-do needs Finance; a to-do
--     that points at nothing needs Projects). Managers can see all.
-- Who may add one: edit access to that same section. Who may change one: the person it is given to, or
-- anyone with edit access to the section. Who may remove one: whoever wrote it, or edit access.
-- The server (not the screen) decides which section a to-do belongs to, who wrote it and who finished
-- it, and who it may be given to, so none of that can be faked from the browser.

create table if not exists public.tasks (
  id          text primary key,
  client_id   text not null references public.clients(id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 1 and 300),
  notes       text check (notes is null or char_length(notes) <= 2000),
  due_date    date,
  assignee    uuid references auth.users(id) on delete set null,   -- the login it is given to; null = nobody yet
  link_type   text check (link_type is null or link_type in ('show', 'offer', 'invoice', 'expense', 'contract', 'song', 'project')),
  link_id     text check (link_id is null or char_length(link_id) <= 100),
  section     text,                                                 -- set by the server from link_type (decides who may see it)
  source      text not null default 'manual' check (source in ('manual', 'command_bar', 'agent')),
  created_by  uuid,                                                 -- set by the server
  created_at  timestamptz not null default now(),
  done_at     timestamptz,                                          -- set by the server when it is checked off
  done_by     uuid,
  check ((link_type is null) = (link_id is null))
);
create index if not exists tasks_client_idx on public.tasks (client_id);
create index if not exists tasks_assignee_open_idx on public.tasks (assignee) where done_at is null;

-- ── The server fills in / checks the fields that must not be trusted from the browser ─────────
create or replace function public.tasks_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  ws uuid;
begin
  if TG_OP = 'UPDATE' then
    if new.client_id <> old.client_id then raise exception 'A to-do cannot move to another artist'; end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  elsif actor is not null then
    new.created_by := actor;
  end if;

  -- The section it belongs to follows what it points at.
  new.section := case new.link_type
    when 'show' then 'tour' when 'offer' then 'tour'
    when 'invoice' then 'finance' when 'expense' then 'finance'
    when 'contract' then 'legal' when 'song' then 'music' when 'project' then 'projects'
    else null end;

  -- Checked off: record when and by whom (server time); unchecked: clear it.
  if new.done_at is null then
    new.done_by := null;
  elsif TG_OP = 'INSERT' or old.done_at is null then
    new.done_at := now();
    new.done_by := actor;
  else
    new.done_at := old.done_at;
    new.done_by := old.done_by;
  end if;

  -- It may only be given to a teammate who can actually open this artist (a manager, or someone
  -- granted access to this artist or to all artists), never to an artist login or an outsider.
  if new.assignee is not null and (TG_OP = 'INSERT' or new.assignee is distinct from old.assignee) then
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
drop trigger if exists tasks_guard on public.tasks;
create trigger tasks_guard before insert or update on public.tasks
  for each row execute function public.tasks_guard();

-- ── Who may see and change them ──────────────────────────────────────────────────────────────
alter table public.tasks enable row level security;
drop policy if exists "tasks select" on public.tasks;
drop policy if exists "tasks insert" on public.tasks;
drop policy if exists "tasks update" on public.tasks;
drop policy if exists "tasks delete" on public.tasks;
create policy "tasks select" on public.tasks for select to authenticated
  using (public.is_management_side(client_id)
         and (assignee = auth.uid() or public.has_section_access(client_id, coalesce(section, 'projects'))));
create policy "tasks insert" on public.tasks for insert to authenticated
  with check (public.is_management_side(client_id)
              and public.has_section_access(client_id, coalesce(section, 'projects'), true));
create policy "tasks update" on public.tasks for update to authenticated
  using (public.is_management_side(client_id)
         and (assignee = auth.uid() or public.has_section_access(client_id, coalesce(section, 'projects'), true)))
  with check (public.is_management_side(client_id)
              and (assignee = auth.uid() or public.has_section_access(client_id, coalesce(section, 'projects'), true)));
create policy "tasks delete" on public.tasks for delete to authenticated
  using (public.is_management_side(client_id)
         and (created_by = auth.uid() or public.has_section_access(client_id, coalesce(section, 'projects'), true)));
revoke all on public.tasks from anon;

-- ── The teammates a to-do can be given to ────────────────────────────────────────────────────
-- Names come from the person's record (or their email if none), the same way the activity log
-- names them. Only people on the management side are listed, and only to someone on that side.
create or replace function public.workspace_people()
returns table (member_id uuid, user_id uuid, label text, role text, all_clients boolean, client_ids text[])
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
                    where g.workspace_member_id = wm.id and g.client_id is not null), '{}')
    from public.workspace_members wm
    join auth.users u on u.id = wm.user_id
    left join public.people p on p.id = wm.person_id
   where wm.client_id is null
     and wm.workspace_id = (select me.workspace_id from public.workspace_members me
                             where me.user_id = auth.uid() and me.client_id is null limit 1)
$$;
revoke all on function public.workspace_people() from public, anon;
grant execute on function public.workspace_people() to authenticated;
