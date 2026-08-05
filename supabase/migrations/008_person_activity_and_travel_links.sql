-- Adds a comms log to people and lets travel bookings link to team members.
alter table public.people
  add column activity jsonb not null default '[]'::jsonb;

alter table public.travel_items
  add column person_ids text[] not null default '{}'::text[];
