-- Artist profile: the information pool managers look things up in.
--
-- Three layers, each stricter than the last:
--   1. OPEN details (contacts, sizes, social links, travel preferences, team contacts) are an ordinary
--      table behind the usual access rules: management side, with the new "profile" section.
--   2. PRIVATE details (birth date, home address, travel IDs, allergies, emergency contact, tax ID) are
--      scrambled by the server before they are stored and can only be read or written through server routes.
--      The browser's roles have no access to that table at all, and every reveal is recorded.
--   3. The VAULT (logins, bank numbers) uses the same locked table with its own "vault" permission.
--      (Built next; the permission is added here so grants can already be given.)

-- ── Two new sections people can be given access to ──────────────────────────────
alter table public.access_grants drop constraint if exists access_grants_section_check;
alter table public.access_grants add constraint access_grants_section_check
  check (section in ('music','tour','content','finance','team','projects','analytics','fandom','legal','profile','vault'));

-- ── 1. Open details ─────────────────────────────────────────────────────────────
create table if not exists public.artist_profiles (
  client_id  text primary key references public.clients(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.artist_profiles enable row level security;
drop policy if exists "artist_profiles select" on public.artist_profiles;
drop policy if exists "artist_profiles insert" on public.artist_profiles;
drop policy if exists "artist_profiles update" on public.artist_profiles;
drop policy if exists "artist_profiles delete" on public.artist_profiles;
create policy "artist_profiles select" on public.artist_profiles for select to authenticated
  using (public.has_section_access(client_id, 'profile') and public.is_management_side(client_id));
create policy "artist_profiles insert" on public.artist_profiles for insert to authenticated
  with check (public.has_section_access(client_id, 'profile', true) and public.is_management_side(client_id));
create policy "artist_profiles update" on public.artist_profiles for update to authenticated
  using (public.has_section_access(client_id, 'profile', true) and public.is_management_side(client_id))
  with check (public.has_section_access(client_id, 'profile', true) and public.is_management_side(client_id));
create policy "artist_profiles delete" on public.artist_profiles for delete to authenticated
  using (public.has_section_access(client_id, 'profile', true) and public.is_management_side(client_id));
revoke all on public.artist_profiles from anon;

-- ── 2 and 3. Private details and the vault (server-only) ────────────────────────
create table if not exists public.profile_secure (
  client_id  text not null references public.clients(id) on delete cascade,
  subject    text not null,                       -- 'artist', or the id of a person in the artist's directory
  tier       text not null check (tier in ('private', 'vault')),
  data_enc   text not null,                       -- the fields, scrambled (AES-256-GCM) by the server; never readable here
  fields     text[] not null default '{}',        -- which fields are filled in (names only), so the screen can say "5 filled"
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (client_id, subject, tier)
);
alter table public.profile_secure enable row level security;   -- no policies on purpose: only the server's own key can reach it
revoke all on public.profile_secure from anon, authenticated;

-- ── Who looked, who changed ─────────────────────────────────────────────────────
-- No foreign key on purpose (like the activity log): removing an artist must not erase who looked.
create table if not exists public.profile_access_log (
  id         uuid primary key default gen_random_uuid(),
  at         timestamptz not null default now(),
  user_id    uuid not null,
  user_label text not null,
  client_id  text not null,
  subject    text not null,
  tier       text not null check (tier in ('private', 'vault')),
  action     text not null check (action in ('reveal', 'save')),
  fields     text[] not null default '{}'         -- the names of the fields touched, never their values
);
create index if not exists profile_access_log_client_idx on public.profile_access_log (client_id, at desc);

alter table public.profile_access_log enable row level security;
drop policy if exists "profile_access_log read" on public.profile_access_log;
create policy "profile_access_log read" on public.profile_access_log for select to authenticated
  using (
    public.is_management_side(client_id)
    and public.has_section_access(client_id, 'profile')
    and (tier = 'private' or public.has_section_access(client_id, 'vault'))
  );
revoke all on public.profile_access_log from anon, authenticated;
grant select on public.profile_access_log to authenticated;      -- reads only; entries are written by the server
