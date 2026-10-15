-- Artist photo and logo: so each artist's pages feel like theirs, not like a spreadsheet.
--
-- The images live in a PRIVATE bucket (no storage policies on purpose: default-deny for everyone but our
-- own server routes, which check who is asking first, exactly like the bills and settlements buckets).
-- Only PNG, JPEG and WEBP, up to 5 MB (SVG is left out on purpose: it can carry script).
-- The clients table remembers which file is the current photo / logo. The database insists the file sits in
-- that artist's own folder and has the expected shape, so a changed browser cannot point one artist at
-- another artist's pictures.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('artist-branding', 'artist-branding', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

alter table public.clients add column if not exists photo_path text;
alter table public.clients add column if not exists logo_path text;
alter table public.clients drop constraint if exists clients_photo_path_check;
alter table public.clients add constraint clients_photo_path_check
  check (photo_path is null or (char_length(photo_path) <= 200 and starts_with(photo_path, id || '/photo-') and photo_path ~ '^[A-Za-z0-9_.-]+/photo-[A-Za-z0-9]+\.(png|jpe?g|webp)$'));
alter table public.clients drop constraint if exists clients_logo_path_check;
alter table public.clients add constraint clients_logo_path_check
  check (logo_path is null or (char_length(logo_path) <= 200 and starts_with(logo_path, id || '/logo-') and logo_path ~ '^[A-Za-z0-9_.-]+/logo-[A-Za-z0-9]+\.(png|jpe?g|webp)$'));

-- "May this person open this artist at all?": a manager, the artist's own login, or a teammate who was given
-- any access to this artist (or to all artists). Like the other access helpers it only ever answers about the
-- caller, and a demo artist is private to its owner.
create or replace function public.can_open_client(target_client_id text)
returns boolean
language plpgsql
stable
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
  if wm is null then return false; end if;
  if wm.role = 'manager' then return true; end if;
  if wm.client_id is not null then return wm.client_id = target_client_id; end if;
  return exists (
    select 1 from public.access_grants g
    where g.workspace_member_id = wm.id and (g.client_id is null or g.client_id = target_client_id)
  );
end;
$function$;
revoke all on function public.can_open_client(text) from public, anon;
grant execute on function public.can_open_client(text) to authenticated;
