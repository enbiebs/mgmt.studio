-- ─────────────────────────────────────────────────────────────
-- Studio · Shared people directory
--
-- Previously a person's name/email/phone got typed separately in
-- crew_members and release_stakeholders (and would drift out of sync —
-- e.g. two different emails for the same person in two different
-- places). This introduces one `people` table that both now point to
-- via person_id, so a person's info lives in exactly one place no
-- matter how many roles they're linked from.
--
-- Verified live against avmigforzdklzrujshrc: both tables were empty
-- (no real data yet), so this is a clean structural change, not a
-- data migration.
-- ─────────────────────────────────────────────────────────────

create table if not exists people (
  id        text primary key,
  client_id text not null references clients(id) on delete cascade,
  name      text not null,
  email     text,
  phone     text,
  org       text,
  notes     text
);

create index if not exists idx_people_client_id on people(client_id);

alter table people enable row level security;
create policy "people scoped to workspace" on people for all
  using (client_id in (select client_ids_for_user()))
  with check (client_id in (select client_ids_for_user()));

-- crew_members: point at people instead of duplicating name/phone/email
alter table crew_members add column if not exists person_id text references people(id) on delete cascade;
alter table crew_members drop column if exists name;
alter table crew_members drop column if exists phone;
alter table crew_members drop column if exists email;
alter table crew_members alter column person_id set not null;

-- release_stakeholders: point at people instead of duplicating name/org/email/phone
alter table release_stakeholders add column if not exists person_id text references people(id) on delete cascade;
alter table release_stakeholders drop column if exists name;
alter table release_stakeholders drop column if exists org;
alter table release_stakeholders drop column if exists email;
alter table release_stakeholders drop column if exists phone;
alter table release_stakeholders alter column person_id set not null;

create index if not exists idx_crew_members_person_id on crew_members(person_id);
create index if not exists idx_release_stakeholders_person_id on release_stakeholders(person_id);
