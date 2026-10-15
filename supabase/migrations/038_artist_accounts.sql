-- Accounts list: where each of an artist's logins is kept and how the team gets in.
--
-- This is a DIRECTORY, not a vault. It never holds a password. For each platform (Spotify for Artists,
-- DistroKid, the bookings email...) it says who owns the account, which username it uses, how the team gets
-- in (the platform's own team access, a shared entry in the team's password manager, or only the artist),
-- what kind of second step protects it, and a link to the shared entry. Same access rules as the rest of the
-- profile: management side, with the "profile" permission.
create table if not exists public.artist_accounts (
  id           text primary key,
  client_id    text not null references public.clients(id) on delete cascade,
  platform     text not null check (char_length(platform) between 1 and 100),
  category     text not null default 'other' check (char_length(category) <= 40),
  label        text check (char_length(label) <= 150),
  username     text check (char_length(username) <= 200),
  owner        text check (char_length(owner) <= 100),
  access       text not null default 'unsorted' check (access in ('platform', 'manager', 'artist', 'unsorted')),
  two_factor   text not null default 'unknown' check (two_factor in ('app', 'sms', 'email', 'key', 'none', 'unknown')),
  login_url    text check (login_url is null or (char_length(login_url) <= 500 and login_url ~* '^https?://')),
  vault_url    text check (vault_url is null or (char_length(vault_url) <= 500 and vault_url ~* '^https?://')),
  last_changed date,
  notes        text check (char_length(notes) <= 2000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid
);
create index if not exists artist_accounts_client_idx on public.artist_accounts (client_id);

alter table public.artist_accounts enable row level security;
drop policy if exists "artist_accounts select" on public.artist_accounts;
drop policy if exists "artist_accounts insert" on public.artist_accounts;
drop policy if exists "artist_accounts update" on public.artist_accounts;
drop policy if exists "artist_accounts delete" on public.artist_accounts;
create policy "artist_accounts select" on public.artist_accounts for select to authenticated
  using (public.has_section_access(client_id, 'profile') and public.is_management_side(client_id));
create policy "artist_accounts insert" on public.artist_accounts for insert to authenticated
  with check (public.has_section_access(client_id, 'profile', true) and public.is_management_side(client_id));
create policy "artist_accounts update" on public.artist_accounts for update to authenticated
  using (public.has_section_access(client_id, 'profile', true) and public.is_management_side(client_id))
  with check (public.has_section_access(client_id, 'profile', true) and public.is_management_side(client_id));
create policy "artist_accounts delete" on public.artist_accounts for delete to authenticated
  using (public.has_section_access(client_id, 'profile', true) and public.is_management_side(client_id));
revoke all on public.artist_accounts from anon;
