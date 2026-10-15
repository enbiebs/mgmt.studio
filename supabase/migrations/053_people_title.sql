-- A free-text title / role on every person in the team directory ("Tour Manager", "Stylist", "Business manager").
-- Typed by hand (with suggestions in the app), so it can be anything. Optional, at most 80 characters.
-- This replaces the separate "key contacts" list that lived on the artist Profile page.
alter table public.people add column if not exists title text;
alter table public.people drop constraint if exists people_title_length;
alter table public.people add constraint people_title_length check (title is null or char_length(title) <= 80);
