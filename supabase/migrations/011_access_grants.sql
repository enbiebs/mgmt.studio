-- ─────────────────────────────────────────────────────────────
-- Studio · Access grants — real per-person, per-section, per-client
-- permissions, replacing the old "any workspace member sees the
-- whole workspace" model.
--
-- workspace_members gains two nullable links:
--   person_id  → which Team profile this login belongs to (crew,
--                agents, lawyers — anyone whose access is granted
--                section by section via access_grants)
--   client_id  → for an artist's own login: they see only this one
--                client, full view, plus edit on their own to-dos.
--                A row with client_id set has no access_grants rows
--                at all — the client link IS the grant.
--
-- access_grants is the real permission table: one row per
-- (team-member login, section, client-or-all), with can_edit
-- defaulting to false. View is the default the moment a grant
-- exists; edit is a separate, explicit upgrade.
--
-- has_section_access() is the single helper every table's RLS
-- policy calls — manager sees everything, artist sees their own
-- client, everyone else is checked against access_grants.
-- ─────────────────────────────────────────────────────────────

alter table workspace_members add column if not exists person_id text references people(id) on delete set null;
alter table workspace_members add column if not exists client_id text references clients(id) on delete set null;

create table if not exists access_grants (
  id                   text primary key,
  workspace_member_id  uuid not null references workspace_members(id) on delete cascade,
  section              text not null check (section in
                          ('music','tour','content','business','team','projects','analytics','fandom','legal')),
  client_id            text references clients(id) on delete cascade,  -- null = every client in the workspace
  can_edit             boolean not null default false,
  created_at           timestamptz not null default now(),
  unique (workspace_member_id, section, client_id)
);

create index if not exists idx_access_grants_member on access_grants(workspace_member_id);

alter table access_grants enable row level security;

-- Only managers configure access. A team member may read their own
-- grants (so the app knows what to show them) but never anyone else's.
create policy "access_grants select" on access_grants for select
  using (
    exists (
      select 1 from workspace_members target
      join workspace_members caller on caller.workspace_id = target.workspace_id
      where target.id = access_grants.workspace_member_id
        and caller.user_id = auth.uid()
        and (caller.role = 'manager' or caller.id = target.id)
    )
  );

create policy "access_grants insert" on access_grants for insert
  with check (
    exists (
      select 1 from workspace_members target
      join workspace_members caller on caller.workspace_id = target.workspace_id
      where target.id = access_grants.workspace_member_id
        and caller.user_id = auth.uid() and caller.role = 'manager'
    )
  );

create policy "access_grants update" on access_grants for update
  using (
    exists (
      select 1 from workspace_members target
      join workspace_members caller on caller.workspace_id = target.workspace_id
      where target.id = access_grants.workspace_member_id
        and caller.user_id = auth.uid() and caller.role = 'manager'
    )
  )
  with check (
    exists (
      select 1 from workspace_members target
      join workspace_members caller on caller.workspace_id = target.workspace_id
      where target.id = access_grants.workspace_member_id
        and caller.user_id = auth.uid() and caller.role = 'manager'
    )
  );

create policy "access_grants delete" on access_grants for delete
  using (
    exists (
      select 1 from workspace_members target
      join workspace_members caller on caller.workspace_id = target.workspace_id
      where target.id = access_grants.workspace_member_id
        and caller.user_id = auth.uid() and caller.role = 'manager'
    )
  );

-- ── The one function every table's policy calls ─────────────────
create or replace function has_section_access(target_client_id text, target_section text, require_edit boolean default false)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  wm record;
begin
  select wm2.* into wm
  from public.workspace_members wm2
  join public.clients c on c.workspace_id = wm2.workspace_id
  where wm2.user_id = auth.uid() and c.id = target_client_id
  limit 1;

  if wm is null then
    return false;
  end if;

  if wm.role = 'manager' then
    return true;
  end if;

  if wm.client_id is not null then
    if wm.client_id <> target_client_id then
      return false;
    end if;
    if require_edit then
      return target_section = 'projects';
    end if;
    return true;
  end if;

  return exists (
    select 1 from public.access_grants g
    where g.workspace_member_id = wm.id
      and g.section = target_section
      and (g.client_id is null or g.client_id = target_client_id)
      and (not require_edit or g.can_edit = true)
  );
end;
$$;

-- ── Replace every table's blanket "workspace member sees all" policy ──
-- clients: seeing the roster (names/colors) stays low-friction for any
-- workspace member; adding/removing an artist from the roster stays
-- manager-only.
drop policy if exists "clients: workspace members can select" on clients;
drop policy if exists "clients: workspace members can insert" on clients;
drop policy if exists "clients: workspace members can update" on clients;
drop policy if exists "clients: workspace members can delete" on clients;

create policy "clients select" on clients for select
  using (workspace_id in (select my_workspace_ids()));
create policy "clients insert" on clients for insert
  with check (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid() and role = 'manager'));
create policy "clients update" on clients for update
  using (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid() and role = 'manager'));
create policy "clients delete" on clients for delete
  using (workspace_id in (select workspace_id from workspace_members where user_id = auth.uid() and role = 'manager'));

-- Direct client_id tables
drop policy if exists "albums scoped to workspace" on albums;
create policy "albums select" on albums for select using (has_section_access(client_id, 'music'));
create policy "albums insert" on albums for insert with check (has_section_access(client_id, 'music', true));
create policy "albums update" on albums for update using (has_section_access(client_id, 'music', true)) with check (has_section_access(client_id, 'music', true));
create policy "albums delete" on albums for delete using (has_section_access(client_id, 'music', true));

drop policy if exists "shows scoped to workspace" on shows;
create policy "shows select" on shows for select using (has_section_access(client_id, 'tour'));
create policy "shows insert" on shows for insert with check (has_section_access(client_id, 'tour', true));
create policy "shows update" on shows for update using (has_section_access(client_id, 'tour', true)) with check (has_section_access(client_id, 'tour', true));
create policy "shows delete" on shows for delete using (has_section_access(client_id, 'tour', true));

drop policy if exists "tour_offers scoped to workspace" on tour_offers;
create policy "tour_offers select" on tour_offers for select using (has_section_access(client_id, 'tour'));
create policy "tour_offers insert" on tour_offers for insert with check (has_section_access(client_id, 'tour', true));
create policy "tour_offers update" on tour_offers for update using (has_section_access(client_id, 'tour', true)) with check (has_section_access(client_id, 'tour', true));
create policy "tour_offers delete" on tour_offers for delete using (has_section_access(client_id, 'tour', true));

drop policy if exists "crew_members scoped to workspace" on crew_members;
create policy "crew_members select" on crew_members for select using (has_section_access(client_id, 'tour'));
create policy "crew_members insert" on crew_members for insert with check (has_section_access(client_id, 'tour', true));
create policy "crew_members update" on crew_members for update using (has_section_access(client_id, 'tour', true)) with check (has_section_access(client_id, 'tour', true));
create policy "crew_members delete" on crew_members for delete using (has_section_access(client_id, 'tour', true));

drop policy if exists "posts scoped to workspace" on posts;
create policy "posts select" on posts for select using (has_section_access(client_id, 'content'));
create policy "posts insert" on posts for insert with check (has_section_access(client_id, 'content', true));
create policy "posts update" on posts for update using (has_section_access(client_id, 'content', true)) with check (has_section_access(client_id, 'content', true));
create policy "posts delete" on posts for delete using (has_section_access(client_id, 'content', true));

drop policy if exists "royalty_streams scoped to workspace" on royalty_streams;
create policy "royalty_streams select" on royalty_streams for select using (has_section_access(client_id, 'business'));
create policy "royalty_streams insert" on royalty_streams for insert with check (has_section_access(client_id, 'business', true));
create policy "royalty_streams update" on royalty_streams for update using (has_section_access(client_id, 'business', true)) with check (has_section_access(client_id, 'business', true));
create policy "royalty_streams delete" on royalty_streams for delete using (has_section_access(client_id, 'business', true));

drop policy if exists "deposits scoped to workspace" on deposits;
create policy "deposits select" on deposits for select using (has_section_access(client_id, 'business'));
create policy "deposits insert" on deposits for insert with check (has_section_access(client_id, 'business', true));
create policy "deposits update" on deposits for update using (has_section_access(client_id, 'business', true)) with check (has_section_access(client_id, 'business', true));
create policy "deposits delete" on deposits for delete using (has_section_access(client_id, 'business', true));

drop policy if exists "catalog_works scoped to workspace" on catalog_works;
create policy "catalog_works select" on catalog_works for select using (has_section_access(client_id, 'business'));
create policy "catalog_works insert" on catalog_works for insert with check (has_section_access(client_id, 'business', true));
create policy "catalog_works update" on catalog_works for update using (has_section_access(client_id, 'business', true)) with check (has_section_access(client_id, 'business', true));
create policy "catalog_works delete" on catalog_works for delete using (has_section_access(client_id, 'business', true));

drop policy if exists "invoices scoped to workspace" on invoices;
create policy "invoices select" on invoices for select using (has_section_access(client_id, 'business'));
create policy "invoices insert" on invoices for insert with check (has_section_access(client_id, 'business', true));
create policy "invoices update" on invoices for update using (has_section_access(client_id, 'business', true)) with check (has_section_access(client_id, 'business', true));
create policy "invoices delete" on invoices for delete using (has_section_access(client_id, 'business', true));

drop policy if exists "expenses scoped to workspace" on expenses;
create policy "expenses select" on expenses for select using (has_section_access(client_id, 'business'));
create policy "expenses insert" on expenses for insert with check (has_section_access(client_id, 'business', true));
create policy "expenses update" on expenses for update using (has_section_access(client_id, 'business', true)) with check (has_section_access(client_id, 'business', true));
create policy "expenses delete" on expenses for delete using (has_section_access(client_id, 'business', true));

drop policy if exists "pl_months scoped to workspace" on pl_months;
create policy "pl_months select" on pl_months for select using (has_section_access(client_id, 'business'));
create policy "pl_months insert" on pl_months for insert with check (has_section_access(client_id, 'business', true));
create policy "pl_months update" on pl_months for update using (has_section_access(client_id, 'business', true)) with check (has_section_access(client_id, 'business', true));
create policy "pl_months delete" on pl_months for delete using (has_section_access(client_id, 'business', true));

drop policy if exists "bank_accounts scoped to workspace" on bank_accounts;
create policy "bank_accounts select" on bank_accounts for select using (has_section_access(client_id, 'business'));
create policy "bank_accounts insert" on bank_accounts for insert with check (has_section_access(client_id, 'business', true));
create policy "bank_accounts update" on bank_accounts for update using (has_section_access(client_id, 'business', true)) with check (has_section_access(client_id, 'business', true));
create policy "bank_accounts delete" on bank_accounts for delete using (has_section_access(client_id, 'business', true));

drop policy if exists "bank_transactions scoped to workspace" on bank_transactions;
create policy "bank_transactions select" on bank_transactions for select using (has_section_access(client_id, 'business'));
create policy "bank_transactions insert" on bank_transactions for insert with check (has_section_access(client_id, 'business', true));
create policy "bank_transactions update" on bank_transactions for update using (has_section_access(client_id, 'business', true)) with check (has_section_access(client_id, 'business', true));
create policy "bank_transactions delete" on bank_transactions for delete using (has_section_access(client_id, 'business', true));

drop policy if exists "people scoped to workspace" on people;
create policy "people select" on people for select using (has_section_access(client_id, 'team'));
create policy "people insert" on people for insert with check (has_section_access(client_id, 'team', true));
create policy "people update" on people for update using (has_section_access(client_id, 'team', true)) with check (has_section_access(client_id, 'team', true));
create policy "people delete" on people for delete using (has_section_access(client_id, 'team', true));

drop policy if exists "projects scoped to workspace" on projects;
create policy "projects select" on projects for select using (has_section_access(client_id, 'projects'));
create policy "projects insert" on projects for insert with check (has_section_access(client_id, 'projects', true));
create policy "projects update" on projects for update using (has_section_access(client_id, 'projects', true)) with check (has_section_access(client_id, 'projects', true));
create policy "projects delete" on projects for delete using (has_section_access(client_id, 'projects', true));

drop policy if exists "artist_todos scoped to workspace" on artist_todos;
create policy "artist_todos select" on artist_todos for select using (has_section_access(client_id, 'projects'));
create policy "artist_todos insert" on artist_todos for insert with check (has_section_access(client_id, 'projects', true));
create policy "artist_todos update" on artist_todos for update using (has_section_access(client_id, 'projects', true)) with check (has_section_access(client_id, 'projects', true));
create policy "artist_todos delete" on artist_todos for delete using (has_section_access(client_id, 'projects', true));

drop policy if exists "contracts scoped to workspace" on contracts;
create policy "contracts select" on contracts for select using (has_section_access(client_id, 'legal'));
create policy "contracts insert" on contracts for insert with check (has_section_access(client_id, 'legal', true));
create policy "contracts update" on contracts for update using (has_section_access(client_id, 'legal', true)) with check (has_section_access(client_id, 'legal', true));
create policy "contracts delete" on contracts for delete using (has_section_access(client_id, 'legal', true));

-- Nested tables (join up to find client_id)
drop policy if exists "tracks scoped to workspace" on tracks;
create policy "tracks select" on tracks for select using (has_section_access((select client_id from albums where id = tracks.album_id), 'music'));
create policy "tracks insert" on tracks for insert with check (has_section_access((select client_id from albums where id = tracks.album_id), 'music', true));
create policy "tracks update" on tracks for update using (has_section_access((select client_id from albums where id = tracks.album_id), 'music', true)) with check (has_section_access((select client_id from albums where id = tracks.album_id), 'music', true));
create policy "tracks delete" on tracks for delete using (has_section_access((select client_id from albums where id = tracks.album_id), 'music', true));

drop policy if exists "checklist_items scoped to workspace" on checklist_items;
create policy "checklist_items select" on checklist_items for select using (has_section_access((select client_id from albums where id = checklist_items.album_id), 'music'));
create policy "checklist_items insert" on checklist_items for insert with check (has_section_access((select client_id from albums where id = checklist_items.album_id), 'music', true));
create policy "checklist_items update" on checklist_items for update using (has_section_access((select client_id from albums where id = checklist_items.album_id), 'music', true)) with check (has_section_access((select client_id from albums where id = checklist_items.album_id), 'music', true));
create policy "checklist_items delete" on checklist_items for delete using (has_section_access((select client_id from albums where id = checklist_items.album_id), 'music', true));

drop policy if exists "release_stakeholders scoped to workspace" on release_stakeholders;
create policy "release_stakeholders select" on release_stakeholders for select using (has_section_access((select client_id from albums where id = release_stakeholders.album_id), 'music'));
create policy "release_stakeholders insert" on release_stakeholders for insert with check (has_section_access((select client_id from albums where id = release_stakeholders.album_id), 'music', true));
create policy "release_stakeholders update" on release_stakeholders for update using (has_section_access((select client_id from albums where id = release_stakeholders.album_id), 'music', true)) with check (has_section_access((select client_id from albums where id = release_stakeholders.album_id), 'music', true));
create policy "release_stakeholders delete" on release_stakeholders for delete using (has_section_access((select client_id from albums where id = release_stakeholders.album_id), 'music', true));

drop policy if exists "invoice_line_items scoped to workspace" on invoice_line_items;
create policy "invoice_line_items select" on invoice_line_items for select using (has_section_access((select client_id from invoices where id = invoice_line_items.invoice_id), 'business'));
create policy "invoice_line_items insert" on invoice_line_items for insert with check (has_section_access((select client_id from invoices where id = invoice_line_items.invoice_id), 'business', true));
create policy "invoice_line_items update" on invoice_line_items for update using (has_section_access((select client_id from invoices where id = invoice_line_items.invoice_id), 'business', true)) with check (has_section_access((select client_id from invoices where id = invoice_line_items.invoice_id), 'business', true));
create policy "invoice_line_items delete" on invoice_line_items for delete using (has_section_access((select client_id from invoices where id = invoice_line_items.invoice_id), 'business', true));

drop policy if exists "show_advances scoped to workspace" on show_advances;
create policy "show_advances select" on show_advances for select using (has_section_access((select client_id from shows where id = show_advances.show_id), 'tour'));
create policy "show_advances insert" on show_advances for insert with check (has_section_access((select client_id from shows where id = show_advances.show_id), 'tour', true));
create policy "show_advances update" on show_advances for update using (has_section_access((select client_id from shows where id = show_advances.show_id), 'tour', true)) with check (has_section_access((select client_id from shows where id = show_advances.show_id), 'tour', true));
create policy "show_advances delete" on show_advances for delete using (has_section_access((select client_id from shows where id = show_advances.show_id), 'tour', true));

drop policy if exists "guest_list_entries scoped to workspace" on guest_list_entries;
create policy "guest_list_entries select" on guest_list_entries for select using (has_section_access((select client_id from shows where id = guest_list_entries.show_id), 'tour'));
create policy "guest_list_entries insert" on guest_list_entries for insert with check (has_section_access((select client_id from shows where id = guest_list_entries.show_id), 'tour', true));
create policy "guest_list_entries update" on guest_list_entries for update using (has_section_access((select client_id from shows where id = guest_list_entries.show_id), 'tour', true)) with check (has_section_access((select client_id from shows where id = guest_list_entries.show_id), 'tour', true));
create policy "guest_list_entries delete" on guest_list_entries for delete using (has_section_access((select client_id from shows where id = guest_list_entries.show_id), 'tour', true));

drop policy if exists "travel_items scoped to workspace" on travel_items;
create policy "travel_items select" on travel_items for select using (has_section_access((select client_id from shows where id = travel_items.show_id), 'tour'));
create policy "travel_items insert" on travel_items for insert with check (has_section_access((select client_id from shows where id = travel_items.show_id), 'tour', true));
create policy "travel_items update" on travel_items for update using (has_section_access((select client_id from shows where id = travel_items.show_id), 'tour', true)) with check (has_section_access((select client_id from shows where id = travel_items.show_id), 'tour', true));
create policy "travel_items delete" on travel_items for delete using (has_section_access((select client_id from shows where id = travel_items.show_id), 'tour', true));

drop policy if exists "advance_contacts scoped to workspace" on advance_contacts;
create policy "advance_contacts select" on advance_contacts for select using (has_section_access((select s.client_id from shows s join show_advances sa on sa.show_id = s.id where sa.id = advance_contacts.advance_id), 'tour'));
create policy "advance_contacts insert" on advance_contacts for insert with check (has_section_access((select s.client_id from shows s join show_advances sa on sa.show_id = s.id where sa.id = advance_contacts.advance_id), 'tour', true));
create policy "advance_contacts update" on advance_contacts for update using (has_section_access((select s.client_id from shows s join show_advances sa on sa.show_id = s.id where sa.id = advance_contacts.advance_id), 'tour', true)) with check (has_section_access((select s.client_id from shows s join show_advances sa on sa.show_id = s.id where sa.id = advance_contacts.advance_id), 'tour', true));
create policy "advance_contacts delete" on advance_contacts for delete using (has_section_access((select s.client_id from shows s join show_advances sa on sa.show_id = s.id where sa.id = advance_contacts.advance_id), 'tour', true));

-- Lock down has_section_access the same way the other RLS helpers are locked
-- down: authenticated (RLS policies call it on the querying user's behalf)
-- keeps EXECUTE, anon/public do not.
revoke all on function has_section_access(text, text, boolean) from public, anon;
grant execute on function has_section_access(text, text, boolean) to authenticated;
