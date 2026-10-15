-- A link from each show to its folder in Google Drive (or anywhere else the team keeps its files).
-- Only http(s) addresses are allowed, so a booby-trapped link can never be saved and later clicked.
alter table public.shows
  add column if not exists drive_url text
  check (drive_url is null or (char_length(drive_url) <= 500 and drive_url ~* '^https?://'));
