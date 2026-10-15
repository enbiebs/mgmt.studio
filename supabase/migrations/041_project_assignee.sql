-- Projects are given to a REAL teammate, the same people the to-do list uses, instead of the four
-- placeholder initials (GC / EB / PH / MS) the page used to offer.
--
-- The old text column `assignee` is left in place (nothing reads it any more) so no history is lost;
-- the new column `assignee_user` holds the login the project is given to.
--
-- A guard checks the same two things as for to-dos:
--   * only the management side may hand a project to someone (an artist's own login can submit a
--     request, but cannot choose who gets it; whatever it sends is ignored), and
--   * it may only be given to a manager, or to someone who has access to this artist.
alter table public.projects
  add column if not exists assignee_user uuid references auth.users(id) on delete set null;
create index if not exists projects_assignee_user_idx on public.projects (assignee_user) where assignee_user is not null;

create or replace function public.projects_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws uuid;
begin
  if new.assignee_user is not null and (TG_OP = 'INSERT' or new.assignee_user is distinct from old.assignee_user) then
    -- A signed-in person who is not on the management side (the artist's own login) cannot assign.
    if auth.uid() is not null and not public.is_management_side(new.client_id) then
      new.assignee_user := case when TG_OP = 'UPDATE' then old.assignee_user else null end;
      return new;
    end if;
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
drop trigger if exists projects_guard on public.projects;
create trigger projects_guard before insert or update on public.projects
  for each row execute function public.projects_guard();
