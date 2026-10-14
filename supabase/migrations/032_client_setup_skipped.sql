-- The first-day checklist on each artist ticks itself off from real data. A step that doesn't
-- apply to an artist (say, a DJ with no crew) can be skipped, and the skip is remembered here so
-- the whole team sees the same checklist. The clients table's existing rules already decide who
-- may change it (managers only, and only the owner for a demo client).
alter table public.clients
  add column if not exists setup_skipped text[] not null default '{}';
