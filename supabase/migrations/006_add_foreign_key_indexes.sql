-- ─────────────────────────────────────────────────────────────
-- Studio · Add missing foreign key indexes
--
-- Every client_id / album_id / invoice_id / workspace_id foreign key
-- column was missing a covering index, flagged by Supabase's performance
-- advisor ("Unindexed foreign keys"). Without these, Postgres has to
-- scan the whole table to join or cascade-delete on these columns —
-- fine at demo-data volume, not fine once a workspace has real history.
--
-- Purely additive — no data or behavior changes, just faster lookups.
-- Verified live against avmigforzdklzrujshrc.
-- ─────────────────────────────────────────────────────────────

create index if not exists idx_albums_client_id on public.albums(client_id);
create index if not exists idx_artist_todos_client_id on public.artist_todos(client_id);
create index if not exists idx_catalog_works_client_id on public.catalog_works(client_id);
create index if not exists idx_clients_workspace_id on public.clients(workspace_id);
create index if not exists idx_contracts_client_id on public.contracts(client_id);
create index if not exists idx_deposits_client_id on public.deposits(client_id);
create index if not exists idx_expenses_client_id on public.expenses(client_id);
create index if not exists idx_invoice_line_items_invoice_id on public.invoice_line_items(invoice_id);
create index if not exists idx_invoices_client_id on public.invoices(client_id);
create index if not exists idx_posts_client_id on public.posts(client_id);
create index if not exists idx_posts_release_id on public.posts(release_id);
create index if not exists idx_projects_client_id on public.projects(client_id);
create index if not exists idx_release_stakeholders_album_id on public.release_stakeholders(album_id);
create index if not exists idx_royalty_streams_client_id on public.royalty_streams(client_id);
create index if not exists idx_shows_client_id on public.shows(client_id);
create index if not exists idx_tour_offers_client_id on public.tour_offers(client_id);
create index if not exists idx_tracks_album_id on public.tracks(album_id);
create index if not exists idx_workspace_members_user_id on public.workspace_members(user_id);
