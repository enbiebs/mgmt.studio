-- A manager can rename their own company (the Company page). Only the name can change, only by a manager of that company,
-- and it must not be blank or very long. Nothing else about a company row can be changed from the app.
revoke insert, update, delete, truncate on public.workspaces from anon, authenticated;
grant update (name) on public.workspaces to authenticated;

drop policy if exists "managers rename their company" on public.workspaces;
create policy "managers rename their company" on public.workspaces for update to authenticated
  using (exists (select 1 from public.workspace_members m where m.workspace_id = workspaces.id and m.user_id = auth.uid() and m.role = 'manager' and m.client_id is null))
  with check (exists (select 1 from public.workspace_members m where m.workspace_id = workspaces.id and m.user_id = auth.uid() and m.role = 'manager' and m.client_id is null));

-- existing names are all short and filled in; new and changed names must be too
alter table public.workspaces drop constraint if exists workspaces_name_length;
alter table public.workspaces add constraint workspaces_name_length check (char_length(btrim(name)) between 1 and 80);
