-- Owners on offers and shows: one named teammate who is handling it.
--
-- Purely additive: two new, empty, optional columns. Nothing existing changes, and every existing offer and show starts with no owner.
-- The owner is a teammate's LOGIN (the same people a to-do can be given to). Like a to-do, the database only lets an item be given to someone
-- who can actually open that artist (a manager, or someone granted access to all artists or to this one), never to an artist login or an
-- outsider. The check only runs when the owner is being set to someone NEW, so an old owner whose access was later removed never blocks
-- an unrelated save. The app treats such an owner as "no owner" on screen.
-- Changing an existing item's owner to someone who cannot open the artist is refused with a plain message (the app writes the owner on its
-- own, as a one-column update, only when the owner is changed). A row being CREATED with such an owner (for example a deleted show coming
-- back from the trash after its owner lost access) is created with no owner instead, so a restore never fails over it.
-- If the person's login is deleted, the item simply has no owner again (on delete set null).
--
-- Who may read or change the column is the same as for the rest of the row: it follows the table's existing rules.
-- The Activity log already records every changed column on these tables; the app words an owner change without showing the login id.

alter table public.shows        add column if not exists owner_user uuid references auth.users(id) on delete set null;
alter table public.tour_offers  add column if not exists owner_user uuid references auth.users(id) on delete set null;

create or replace function public.item_owner_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws uuid;
begin
  if new.owner_user is not null and (TG_OP = 'INSERT' or new.owner_user is distinct from old.owner_user) then
    select c.workspace_id into ws from public.clients c where c.id = new.client_id;
    if not exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = ws and wm.user_id = new.owner_user and wm.client_id is null
        and (wm.role = 'manager' or exists (
          select 1 from public.access_grants g
          where g.workspace_member_id = wm.id and (g.client_id is null or g.client_id = new.client_id)))
    ) then
      if TG_OP = 'INSERT' then
        new.owner_user := null;
      else
        raise exception 'That person cannot open this artist, so they cannot be the owner';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- Only the triggers below run it; nobody signed in may call it by hand (same lock-down as the other trigger functions).
revoke execute on function public.item_owner_guard() from public, anon, authenticated;

drop trigger if exists shows_owner_guard on public.shows;
create trigger shows_owner_guard before insert or update on public.shows
  for each row execute function public.item_owner_guard();

drop trigger if exists tour_offers_owner_guard on public.tour_offers;
create trigger tour_offers_owner_guard before insert or update on public.tour_offers
  for each row execute function public.item_owner_guard();
