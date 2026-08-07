-- ─────────────────────────────────────────────────────────────
-- Studio · Real team member and artist invites
--
-- handle_new_user() previously always created a brand-new workspace
-- for any signup. That's still correct for the self-serve "create my
-- own workspace" flow, but wrong for someone accepting an invite —
-- they should join the EXISTING workspace they were invited into,
-- with the role/links the manager set when sending the invite.
--
-- The invite API route (src/app/api/team/invite) stamps that
-- targeting info into the invited user's metadata; this trigger reads
-- it. No metadata present = unchanged self-serve behavior.
--
-- Widened the role check to add 'team' — a generic label for crew/
-- internal team members whose real permissions live in access_grants,
-- not implied by the role name the way 'agent'/'lawyer' used to be.
-- ─────────────────────────────────────────────────────────────

alter table workspace_members drop constraint if exists workspace_members_role_check;
alter table workspace_members add constraint workspace_members_role_check
  check (role in ('manager', 'artist', 'agent', 'lawyer', 'team'));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  new_workspace_id uuid;
  invite_workspace_id uuid;
begin
  invite_workspace_id := nullif(new.raw_user_meta_data->>'invite_workspace_id', '')::uuid;

  if invite_workspace_id is not null then
    insert into public.workspace_members (workspace_id, user_id, role, person_id, client_id)
    values (
      invite_workspace_id,
      new.id,
      coalesce(new.raw_user_meta_data->>'invite_role', 'team'),
      nullif(new.raw_user_meta_data->>'invite_person_id', ''),
      nullif(new.raw_user_meta_data->>'invite_client_id', '')
    );
  else
    insert into public.workspaces (name)
    values (coalesce(new.raw_user_meta_data->>'workspace_name', split_part(new.email, '@', 1)))
    returning id into new_workspace_id;

    insert into public.workspace_members (workspace_id, user_id, role)
    values (new_workspace_id, new.id, 'manager');
  end if;

  return new;
end;
$$;
